'use strict';
var program = require('commander')
var debug = require('debug')('oose:hb')
var infant = require('infant')

var api = require('../helpers/api')
var couch = require('./couchbase')
var prismBalance = require('../helpers/prismBalance')
var logger = require('../helpers/logger')

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

/**
 * Some notes about the changes for 2.6. I am going to be working fixing the
 * issue that leaves heartbeat running when the main process shuts down. I am
 * also going to check through all the promise chains and look for holes that
 * need extra handling.
 */


var heartbeatTimeout = null
var pruneTimeout = null
var voteLog = {}

//setup our identity
var setupProgram = function(){
  program.version(config.version)
    .description('OOSE Heartbeat')
    .option('-k --key <key>','System key for heartbeat eg: om101 or store1')
    .option('-p --prism <name>',
      'When type is store the parent prism name is needed here')
    .option('-t --type <type>','System type either prism or store')
    .parse(process.argv)
  //try to look these up if none passed
  if(!program.key && !program.type){
    program.key = config.heartbeat.systemKey
    program.type = config.heartbeat.systemType
    if(!program.key && config.prism.enabled){
      program.key = config.prism.name
      program.type = 'prism'
    }
    if(!program.key && config.store.enabled){
      program.key = config.store.name
      program.prism = config.store.prism || ''
      program.type = 'store'
    }
  }
}
setupProgram()


/**
 * Get Peer Key
 * @param {object} peer
 * @return {string}
 */
var getPeerKey = function(peer){
  var prismKey = couch.schema.prism(peer.name)
  var storeKey = couch.schema.store(peer.prism,peer.name)
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
  var downKey = couch.schema.downVote(peer.name)
  var myDownKey = couch.schema.downVote(peer.name,systemKey)
  debug('DOWN VOTE: ' + key)
  var createDownVote = function(){
    return couch.heartbeat.upsertAsync(myDownKey,{
      peer: peer,
      systemKey: systemKey,
      systemType: systemType,
      reason: reason,
      timestamp: +(new Date())
    })
  }
  //get down votes that have already been set for this host
  return createDownVote()
    .then(function(){
      var qstring = 'SELECT * FROM ' +
        couch.getName(couch.type.HEARTBEAT,true) + ' b ' +
        'WHERE META(b).id LIKE $1'
      var query = couch.N1Query.fromString(qstring)
      downKey = downKey + '%'
      return couch.heartbeat.queryAsync(query,[downKey])
    })
    .then(function(result){
      var count = peerCount
      var votes = result.length
      if(count === 0 || votes < (count / 2))
        return true
      peer.available = false
      return couch.peer.upsertAsync(key,peer)
        .catch(function(err){
          debug('failed to cast down vote',err)
        })
    })
    .catch(function(err){
      console.log(err)
      logger.log('error', 'Failed to cast down vote: ' + err.message)
    })
}


/**
 * Run the heartbeat from this peer
 * @param {string} systemKey
 * @param {string} systemType
 * @return {P}
 */
var runHeartbeat = function(systemKey,systemType){
  //steps to a successful heartbeat run
  // 1) collect list of peers to ping (including ourselves)
  // 2) ping all of those peers
  // 3) collect failures to calculate loss
  // 4) check loss against triggers
  // 5) expire down votes from this peer
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
        .catch(function(err){
          logger.log('error','Failed to cast down vote for ' +
            peer.name + ': ' + err.message)
        })
    } else {
      return true
    }
  }
  /**
   * Restore peer to operational status
   * @param {object} peer
   * @return {P}
   */
  var restorePeer = function(peer){
    logger.log('info', 'Restoring peer ' + peer.name)
    return couch.peer.getAsync(peer._id)
      .then(function(result){
        var peer = result.value
        peer.available = true
        return couch.peer.upsertAsync(peer._id,peer,{cas: result.cas})
      })
      .then(function(){
        //remove down votes
        var downKey = couch.schema.downVote(peer.name)
        var qstring = 'DELETE FROM ' +
          couch.getName(couch.type.HEARTBEAT,true) +
          ' b WHERE META(b).id LIKE $1'
        var query = couch.N1Query.fromString(qstring)
        downKey = downKey + '%'
        return couch.heartbeat.queryAsync(query,[downKey])
      })
      .then(function(result){
        debug('deleted ' + result.length + ' records')
      })
      .catch(function(err){
        console.log(err)
        logger.log('error', 'Failed to restore peer: ' + err.message)
      })
  }
  return prismBalance.peerList()
    .then(function(result){
      peerCount = result.length
      debug('Found peers',result.length)
      return result
    })
    .map(function(peer){
      //check for down votes for this peer from us
      var downKey = couch.schema.downVote(peer.name,systemKey)
      return couch.heartbeat.getAsync(downKey)
        .then(
          function(result){
            peer.existingDownVote = result.value
            return peer
          },
          function(){
            peer.existingDownVote = false
            return peer
          }
        )
    })
    //MAIN PING LOOP
    .map(function(peer){
      //setup the ping handler
      debug('Setting up to ping peer',peer.name,peer.host + ':' + peer.port)
      //check if the peer is eligible for ping
      if(!peer.active) return true
      //if we already have a downvote the peer should not be contacted
      if(peer.existingDownVote) return true
      var peerRequest = 'prism' === peer.type ?
        api.setupAccess('prism',peer) : api.setupAccess('store',peer)
      //make the ping request
      var url = peerRequest.url('/ping')
      return peerRequest.postAsync({
        url: url + '',
        timeout: config.heartbeat.pingResponseTimeout || 1000
      })
        .spread(
          function(res,body){
            debug('Ping response',peer.name,body)
            if(body && body.pong && 'pong' === body.pong){
              //success, so do nothing i think or check if its down
              //and file an up vote
              debug('Cleared vote log',peer.name)
              voteLog[peer.name] = 0
              //if this peer is not available this should be where it gets its
              //votes cleared and returned to an available status
              if(peer.active && !peer.available)
                return restorePeer(peer)
            } else {
              return handlePingFailure('Got a bad response',peer)
            }
          },
          function(err){
            logger.log('error', 'Ping Error to ' + url,err.message)
            return handlePingFailure(err.message,peer)
          }
        )
        .catch(function(err){
          logger.log('error', 'Ping error to ' + url, err)
          return handlePingFailure(err.message,peer)
        })
    },{concurrency: config.heartbeat.concurrency})
    .catch(function(err){
      console.log(err)
      logger.log('error', 'Unknown ping error' + err.message)
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
  var downVoteKey = couch.schema.downVote()
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
  var qstring = 'SELECT * FROM ' +
    couch.getName(couch.type.HEARTBEAT,true) + ' b ' +
    'WHERE META(b).id LIKE $1'
  var query = couch.N1Query.fromString(qstring)
  downVoteKey = downVoteKey + '%'
  return couch.heartbeat.queryAsync(query,[downVoteKey])
    .then(function(result){
      return result
    })
    .map(function(vote){
      return couch.heartbeat.getAsync(vote.id)
        .catch(function(err){
          debug('failed to get vote to prune',err)
          return false
        })
    })
    .filter(function(vote){
      vote = vote.value
      if(!vote) return false
      debug('filtering vote',vote.id,validateVote(vote))
      return validateVote(vote)
    })
    .map(function(vote){
      debug('Pruning vote',vote._id)
      return couch.heartbeat.removeAsync(vote._id)
        .catch(function(err){
          debug('failed to destroy vote pruning',err)
        })
    })
    .catch(function(err){
      console.log(err)
      logger.log('error', 'Vote prune error: ' + err.message)
    })
}


/**
 * Mark this system up
 * @param {string} systemKey
 * @param {string} systemPrism
 * @param {string} systemType
 * @param {function} done
 * @return {P}
 */
var markMeUp = function(systemKey,systemPrism,systemType,done){
  if('function' !== typeof done) done = function(){}
  debug('Marking myself up')
  var key = getPeerKey({
    name: systemKey,
    prism: systemPrism,
    type: systemType
  })
  var downKey = couch.schema.downVote(systemKey)
  debug('Getting peer information',key)
  return couch.peer.getAsync(key)
    .then(
      function(result){
        var peer = result.value
        debug('Got peer information back',peer)
        peer.available = true
        peer.active = true
        return couch.peer.upsertAsync(key,peer,{cas: result.cas})
          .catch(function(err){
            debug('failed to mark peer up',err)
          })
      },
      function(err){
        debug('Got an error getting peer information',err)
        throw new Error('Could not get peer information, cannot mark myself up')
      }
    )
    .then(function(){
      //Time to delete the downvote log
      var qstring = 'DELETE FROM ' +
        couch.getName(couch.type.HEARTBEAT,true) +
        ' b WHERE META(b).id LIKE $1'
      var query = couch.N1Query.fromString(qstring)
      downKey = downKey + '%'
      return couch.heartbeat.queryAsync(query,[downKey])
    })
    .then(function(result){
      debug('deleted ' + result.length + ' records')
      debug('finished marking myself up',result)
      done(null,result)
    })
    .catch(function(err){
      console.log(err)
      logger.log('error', 'markMeUp error: '+ err.message)
    })
}


/**
 * Start Heartbeat
 * @param {string} systemKey
 * @param {string} systemPrism
 * @param {string} systemType
 * @param {function} done
 */
exports.start = function(systemKey,systemPrism,systemType,done){
  logger.log('info', 'Setting up to start heartbeat' + ' ' + systemKey +
    ' ' + systemType)
  if(!systemKey)
    throw new Error('System key has not been set, heartbeat not started')
  if(!systemType)
    throw new Error('System type has not been set, heartbeat not started')
  heartbeatTimeout = setInterval(function(){
    return runHeartbeat(systemKey,systemType)
      .then(function(){
        debug('Heartbeat run complete')
      })
  },+config.heartbeat.frequency || 5000)
  pruneTimeout = setInterval(function(){
    return runVotePrune(systemKey,systemType)
      .then(function(){
        debug('Vote prune complete')
      })
  },+config.heartbeat.votePruneFrequency || 60000)
  markMeUp(systemKey,systemPrism,systemType,done)
}


/**
 * Stop Heartbeat
 * @param {function} done
 */
exports.stop = function(done){
  logger.log('info','Stopping heartbeat')
  if(heartbeatTimeout) clearInterval(heartbeatTimeout)
  if(pruneTimeout) clearInterval(pruneTimeout)
  logger.log('info','Heartbeat stopped')
  done()
  process.exit()
}

if(require.main === module){
  infant.child(
    'oose:' + program.key + ':heartbeat',
    function(done){
      //do a sanity check we need both
      if(!program.key)
        throw new Error('Cant start invalid system key')
      if(!program.type)
        throw new Error('Cant start invalid system type')
      exports.start(program.key,program.prism,program.type,done)
    },
    function(done){
      exports.stop(done)
    }
  )
}
