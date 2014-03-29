'use strict';
/*jshint bitwise: false*/
var config = require('../config')
  , logger = require('../helpers/logger')
  , redis = require('../helpers/redis')
  , Communicator = require('../helpers/communicator')
  , os = require('os')
  , util = require('util')
  , myStats = require('../helpers/peerStats')
  , jobs = require('../helpers/jobs')

//start stats collection
myStats.start(config.get('mesh.statInterval') || 1000)

var logAnnounce = function(selfPeer,oldPeer,peer,packet){
  if(config.get('mesh.debug') || (packet.handle !== oldPeer.handle)){
    logger.info(
      packet.handle +
      ' posted an announce' +
      ' at ' +
      new Date(peer.sent).toLocaleTimeString() +
      ' (latency ' + peer.latency + ')' +
      (config.get('mesh.debug') && packet.handle === selfPeer.handle ? ' [SELFIE]' : '')
    )
  }
  if(config.get('mesh.debug') > 1){
    logger.info(os.EOL + util.inspect(peer))
  }
}

//setup multicast networking
var multicast = new Communicator({
  proto: 'mcast',
  port: config.get('mesh.port'),
  mcast: {
    address: config.get('mesh.address'),
    ttl: config.get('mesh.ttl')
  }
})
multicast.useReceive(function(packet){
  redis.hgetall('peers:' + config.get('hostname'),function(err,selfPeer){
    if(err) logger.error(err)
    else {
      redis.hgetall('peers:' + packet.hostname,function(err,oldPeer){
        if(err) logger.error(err)
        else {
          if(!oldPeer) oldPeer = {}
          //populate details
          var peer = {}
          peer.latency = packet.sent - (oldPeer.sent || 0) - config.get('mesh.interval')
          if(peer.latency < 0) peer.latency = 0
          peer.sent = packet.sent
          peer.handle = packet.handle
          peer.hostname = packet.hostname
          peer.ip = packet.rinfo.address
          peer.diskFree = packet.diskFree
          peer.diskTotal = packet.diskTotal
          peer.cpuIdle = packet.cpuIdle
          peer.cpuTotal = packet.cpuTotal
          peer.availableCapacity = packet.availableCapacity
          peer.services = packet.services
          //save to redis
          redis.sadd('peerList',packet.hostname)
          redis.zadd('peerRank',packet.availableCapacity,packet.hostname,function(err){
            if(err) logger.error(err)
            redis.hmset('peers:' + packet.hostname,peer,function(err){
              if(err) logger.error(err)
              //start a prism sync on the first one
              if(config.get('prism.enabled') && packet.services.indexOf('store') > 0 && !oldPeer){
                jobs.create('prismSync',{
                  title: 'Sync or build the global hash table',
                  hostname: packet.hostname
                }).save()
              }
              logAnnounce(selfPeer,oldPeer,peer,packet)
            })
          })
        }
      })
    }
  })
})

var announceTimeout

var sendAnnounce = function(){
  redis.hgetall('peers:' + config.get('hostname'),function(err,peer){
    if(err) logger.error(err)
    else if(!peer){
      logger.warn('Announce delayed, peer not ready')
      announceTimeout = setTimeout(sendAnnounce,config.get('mesh.interval'))
    } else {
      var message = {}
      message.hostname = config.get('hostname')
      message.handle = peer.handle
      message.diskFree = peer.diskFree
      message.diskTotal = peer.diskTotal
      message.cpuIdle = peer.cpuIdle
      message.cpuTotal = peer.cpuTotal
      message.availableCapacity = peer.availableCapacity
      message.services = ''
      if(config.get('store.enabled')) message.services += ',store'
      if(config.get('prism.enabled')) message.services += ',prism'
      multicast.send(message,function(){
        announceTimeout = setTimeout(sendAnnounce,config.get('mesh.interval'))
      })
    }
  })
}


/**
 * Access to the multicast setup
 * @type {Communicator}
 */
exports.multicast = multicast


/**
 * Start mesh
 * @param {function} done
 */
exports.start = function(done){
  sendAnnounce()
  done()
}


/**
 * Stop mesh
 */
exports.stop = function(){
  if(announceTimeout)
    clearTimeout(announceTimeout)
}

if(require.main === module){
  exports.start(function(){
    logger.info('Mesh started and announcing')
  })
}
