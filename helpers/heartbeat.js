'use strict';
var debug = require('debug')('oose:hb')
var infant = require('infant')
var random = require('random-js')()

var api = require('../helpers/api')
var cradle = require('../helpers/couchdb')
var prismBalance = require('../helpers/prismBalance')

var config = require('../config')

/**
 Some notes about this heartbeat rework before we get started. I think the specs
 I provided to George were sketchy at best.

 The system itself has also changed during the development process of the
 heartbeat system.

 This system is going to operate as a service that can be added on to any main
 process.

 It will start and stop and during operational status is will conduct a parallel
 TCP ping to each member of the cluster on a sliding interval to prevent
 dos-beat.
*/

var heartbeatTimeout = null
var pruneTimeout = null
var voteLog = {}


/**
 * Get Peer Key
 * @param {object} peer
 * @return {string}
 */
var getPeerKey = function(peer){
  var prismKey = cradle.schema.prism(peer.name)
  var storeKey = cradle.schema.store(peer.prism,peer.name)
  return (peer.type === 'prism') ? prismKey : storeKey
}


/**
 * Down vote a peer
 * @param {object} peer
 * @param {string} reason
 * @param {string} systemKey
 * @param {string} systemType
 * @param {integer} peerCount
 * @return {P}
 */
var downVote = function(peer,reason,systemKey,systemType,peerCount){
  //setup keys
  var key = getPeerKey(peer)
  var downKey = cradle.schema.downVote(peer.name)
  var myDownKey = cradle.schema.downVote(peer.name, systemKey)
  var currentVoteLog = null
  debug('DOWN VOTE: ' + key)
  var createDownVote = function(){
    return cradle.db.saveAsync(myDownKey,{
      peer: peer,
      systemKey: systemKey,
      systemType: systemType,
      reason: reason,
      timestamp: +(new Date())
    })
  }
  //get down votes that have already been set for this host
  return cradle.db.allAsync({startkey: downKey, endkey: downKey + '\uffff'})
    .then(
      function(log){
        currentVoteLog = log
        for(var i = 0; i < log.length; i++){
          if(log[i].key === myDownKey) {
            debug('Already recorded')
            return false
          }
        }
        return createDownVote()
      },
      function(err){
        if(!err.headers) throw err
        if(404 !== err.headers.status) throw err
        currentVoteLog = []
        return createDownVote()
      }
    )
    .then(function(myVote){
      if(myVote !== false)
        currentVoteLog.push(myVote)
      var count = peerCount
      var votes = currentVoteLog.length
      if(count === 0 || votes < (count / 2))
        throw new Error('Ok, got it')
      peer.available = false
      return cradle.db.saveAsync(key,peer._rev,peer)
    })
    .catch(function(err){
      if('Ok, got it' === err.message){
        debug('Vote already cast',peer.name)
      } else {
        console.log(err)
      }
    })
}


/**
 * Run the heartbeat from this peer
 * @param {string} systemKey
 * @param {string} systemType
 */
var runHeartbeat = function(systemKey,systemType){
  //steps to a successful heartbeat run
  // 1) collect list of peers to ping (including ourselves)
  // 2) ping all of those peers
  // 3) collect failures to calculate loss
  // 4) check loss against triggers
  // 5) expire down votes from this peer
  var startTime = +(new Date())
  var peerCount = 0
  debug('Getting peer list for heartbeat ping')


  /**
   * Help handle ping failure
   * @param {string} reason
   * @param {object} peer
   * @return {P}
   */
  var handlePingFailure = function(reason,peer){
    debug('Adding to vote log',peer.name)
    voteLog[peer.name] = (voteLog[peer.name] !== undefined) ?
    voteLog[peer.name] + 1 : 1
    if(voteLog[peer.name] > config.heartbeat.retries){
      debug('Vote log high water reached, down voting',peer.name)
      return downVote(peer,reason,systemKey,systemType,peerCount)
    } else {
      return true
    }
  }
  prismBalance.peerList()
    .then(function(result){
      peerCount = result.length
      debug('Found peers',result.length)
      return result
    })
    .map(function(peer){
      //check for down votes for this peer from us
      var downKey = cradle.schema.downVote(peer.name,systemKey)
      return cradle.db.getAsync(downKey)
        .then(
          function(result){
            peer.existingDownVote = result
            return peer
          },
          function(){
            peer.existingDownVote = false
            return peer
          }
        )
    })
    .map(function(peer){
      //setup the ping handler
      debug('Setting up to ping peer',peer.name,peer.host + ':' + peer.port)
      //check if the peer is eligible for ping
      if(!peer.active) return true
      //if we already have a downvote the peer should not be contacted
      if(peer.existingDownVote) return true
      peer.request = 'prism' === peer.type ? api.prism(peer) : api.store(peer)
      //make the ping request
      return peer.request.postAsync({
        url: peer.request.url('/ping') + '',
        timeout: config.heartbeat.pingResponseTimeout || 1000
      })
        .spread(function(res,body){
          debug('Ping response',peer.name,body)
          if(body && body.pong && 'pong' === body.pong){
            //success, so do nothing i think or check if its down
            //and file an up vote
            debug('Cleared vote log',peer.name)
            voteLog[peer.name] = 0
          } else {
            handlePingFailure('Got a bad response',peer)
          }
        })
        .catch(function(err){
          console.log('Ping Error ' + peer.name,err.message)
          handlePingFailure(err.message,peer)
        })
    })
    .catch(function(err){
      console.log(err)
    })
    .finally(function(){
      var duration = +(new Date()) - startTime
      var delay = duration +
        (random.integer(0,5) * 1000) +
        config.heartbeat.frequency
      debug('Setting next heart beat run',duration,delay)
      heartbeatTimeout = setTimeout(function(){
        runHeartbeat(systemKey,systemType)
      },delay)
    })
}


/**
 * Prune votes cast by this system
 * @param {string} systemKey
 * @param {string} systemType
 * @return {P}
 */
var runVotePrune = function(systemKey,systemType){
  //get votes we cast
  var downVoteKey = cradle.schema.downVote()
  var currentTimestamp = +(new Date())
  debug('Starting vote prune',downVoteKey,currentTimestamp)


  /**
   * Validate vote record
   * @param {string} vote
   * @return {boolean}
   */
  var validateVote = function(vote){
    var voteExpiresAfter = +(+vote.timestamp + config.heartbeat.voteLife)
    if(vote.systemKey && vote.systemKey !== systemKey) return false
    if(vote.systemType && vote.systemType !== systemType) return false
    return (voteExpiresAfter <= currentTimestamp)
  }
  return cradle.db.allAsync({
    startkey: downVoteKey,
    endkey: downVoteKey + '\uffff'
  })
    .map(function(vote){
      return cradle.db.getAsync(vote.id)
    })
    .filter(function(vote){
      debug('filtering vote',vote.id,validateVote(vote))
      return validateVote(vote)
    })
    .map(function(vote){
      debug('Pruning vote',vote._id)
      return cradle.db.removeAsync(vote._id,vote._rev)
    })
    .catch(function(err){
      console.log('vote prune error: ',err)
    })
    .finally(function(){
      debug('Vote prune complete')
      pruneTimeout = setTimeout(function(){
        runVotePrune(systemKey,systemType)
      },+config.heartbeat.votePruneFrequency || 60000)
    })
}


/**
 * Mark this system up
 * @param {string} systemKey
 * @param {string} systemType
 * @return {P}
 */
var markMeUp = function(systemKey,systemType){
  debug('Marking myself up')
  var key = getPeerKey({
    name: systemKey,
    type: systemType
  })
  var downKey = cradle.schema.downVote(systemKey)
  debug('Getting peer information')
  return cradle.db.getAsync(key)
    .then(
      function(peer){
        debug('Got peer information back',peer)
        peer.available = true
        peer.active = true
        return cradle.db.saveAsync(key,peer._rev,peer)
      },
      function(err){
        debug('Got an error getting peer information',err)
        throw new Error('Could not get peer information, cannot mark myself up')
      }
    )
    .then(function(){
      //Time to delete the downvote log
      debug('About to get down votes',downKey)
      return cradle.db.allAsync({startkey: downKey, endkey: downKey + '\uffff'})
    })
    .map(function(log){
      debug('Removing downvote',log)
      return cradle.db.removeAsync(log.key,log._rev)
    })
    .then(function(result){
      debug('finished marking myself up',result)
    })
    .catch(function(err){
      console.log('markMeUp error: ',err)
    })
}


/**
 * Start Heartbeat
 * @param {string} systemKey
 * @param {string} systemType
 * @param {function} done
 */
exports.start = function(systemKey,systemType,done){
  if('function' === typeof systemKey){
    done = systemKey
    systemKey = config.hearbeat.systemKey
    systemType = config.heartbeat.systemType
  }
  if(!systemKey)
    throw new Error('System key has not been set, heartbeat not started')
  if(!systemType)
    throw new Error('System type has not been set, heartbeat not started')
  heartbeatTimeout = setTimeout(function(){
    runHeartbeat(systemKey,systemType)
  },1000)
  runVotePrune(systemKey,systemType)
  markMeUp(systemKey,systemType,done)
}


/**
 * Stop Heartbeat
 * @param {function} done
 */
exports.stop = function(done){
  clearTimeout(heartbeatTimeout)
  clearTimeout(pruneTimeout)
  process.nextTick(done)
}

if(require.main === module){
  infant.child(
    'oose:' + config.store.name + ':heartbeat',
    function(done){
      var program = require('commander')
      program.version(config.version)
        .description('OOSE Heartbeat')
        .option('-k --key <key>','System key for heartbeat eg: om101 or store1')
        .option('-t --type <type>','System type either prism or store')
        .parse(process.argv)
      if(!program.key)
        throw new Error('Cant start invalid system key')
      if(!program.type)
        throw new Error('Cant start invalid system type')
      exports.start(program.key,program.type,done)
    },
    exports.stop
  )
}
