'use strict';
var debug = require('debug')('oose:sp')
var infant = require('infant')
var program = require('commander')

var api = require('../helpers/api')
var logger = require('../helpers/logger')
var prismBalance = require('../helpers/prismBalance')
var stats = require('../helpers/stats')

var config = require('../config')

var statsPushTimeout = null

//setup our identity
var setupProgram = function(){
  program.version(config.version)
    .description('OOSE StatsPush')
    .option('-k --key <key>','System key for statsPush eg: om101 or store1')
    .option('-p --prism <name>',
      'When type is store the parent prism name is needed here')
    .option('-t --type <type>','System type either prism or store')
    .parse(process.argv)
  //try to look these up if none passed
  if(!program.key && !program.type){
    program.key = config.statsPush.systemKey
    program.type = config.statsPush.systemType
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
 * Run the statsPush from this peer
 * @param {string} systemKey
 * @param {string} systemType
 */
var runStatsPush = function(systemKey,systemType){
  //steps to a successful statsPush run
  // 1) collect list of peers to ping (including ourselves)
  // 2) ping all of those peers
  // 3) collect failures to calculate loss
  // 4) check loss against triggers
  // 5) expire down votes from this peer
  var startTime = +(new Date())
  logger.log('info','StatsPush action started')
  prismBalance.peerList()
    .map(function(peer){
      //skip any peer that isn't our prism
      if(config.store.prism !== peer.name) return;
      // DO THANGZ
      //setup the stats handler
      debug('Setting up to push stats',peer.name,peer.host + ':' + peer.port)
      var peerRequest = api.prism(peer)
      //make the ping request
      return peerRequest.postAsync({
        url: peerRequest.url('/statsPush') + '',
        timeout: 3333
      })
        .spread(function(res,body){
          debug('Stats response',peer.name,body)
          if(body && body.pong && 'pong' === body.pong){
            //success, so do nothing i think or check if its down
            //and file an up vote
            debug('Cleared vote log',peer.name)
            //if this peer is not available this should be where it gets its
            //votes cleared and returned to an available status
          }
        })
        .catch(function(err){
          logger.log('error', 'Stats Error ' + peer.name,err.message)
        })
    })
    .catch(function(err){
      logger.log('error', err)
    })
    .finally(function(){
      logger.log('info','StatsPush action finished, duration ' +
        (+(new Date()) - startTime)
      )
      statsPushTimeout = setTimeout(function(){
        runStatsPush(systemKey,systemType)
      },config.statsPush.frequency)
    })
}


/**
 * Start StatsPush
 * @param {string} systemKey
 * @param {string} systemPrism
 * @param {string} systemType
 * @param {function} done
 */
exports.start = function(systemKey,systemPrism,systemType,done){
  var startDelay = (+config.statsPush.startDelay) ||
    ((+(new Date()) % config.statsPush.frequency))
  logger.log('info', 'Setting up to start statsPush' + ' ' + systemKey +
    ' ' + systemType + ' ' + startDelay)
  if(!systemKey)
    throw new Error('System key has not been set, statsPush not started')
  if(!systemType)
    throw new Error('System type has not been set, statsPush not started')
  statsPushTimeout = setTimeout(function(){
    runStatsPush(systemKey,systemType)
  },startDelay)
  done()
}


/**
 * Stop StatsPush
 * @param {function} done
 */
exports.stop = function(done){
  logger.log('info','Stopping statsPush')
  if(statsPushTimeout) clearTimeout(statsPushTimeout)
  logger.log('info','StatsPush stopped')
  done()
}

if(require.main === module){
  infant.child(
    'oose:' + program.key + ':statsPush',
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
