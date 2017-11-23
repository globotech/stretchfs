'use strict';
var P = require('bluebird')
var debug = require('debug')('stretchfs:store:stat')
var diskusage = P.promisifyAll(require('diskusage'))
var child = require('infant').child

var couch = require('../helpers/couchbase')

var config = require('../config')


var storeKey = couch.schema.store(config.store.name)
var syncInterval

//open some buckets
var cb = couch.stretchfs()


/**
 * Update the peer stat
 * @param {object} diskUsage
 * @return {P}
 */
var updatePeerStat = function(diskUsage){
  return P.all([
    cb.mutateInAsync(storeKey,
      couch.SubDocument.upsert('usage.free',diskUsage.free)),
    cb.mutateInAsync(storeKey,
      couch.SubDocument.upsert('usage.total',diskUsage.total))
  ])
}


/**
 * Sync stats for peer
 * @return {P}
 */
var statSyncPeer = function(){
  debug('peer stat sync starting')
  var diskUsage = {}
  return diskusage.checkAsync(config.root)
    .then(function(result){
      debug('got disk usage',result)
      diskUsage = result
      return updatePeerStat(diskUsage)
    })
    .then(function(){
      debug('peer stat sync complete')
    })
}


/**
 * Sync stats
 * @return {P}
 */
var statSync= function(){
  debug('starting to sync stats')
  return P.all([
    statSyncInventory(),
    statSyncPeer(),
    statSyncPurchases()
  ])
    .then(function(){
      debug('stat sync complete')
    })
}


/**
 * Start main
 * @param {function} done
 */
exports.start = function(done){
  debug('starting store stat worker')
  syncInterval = setInterval(statSync,config.store.stat.syncFrequency)
  process.nextTick(done)
}


/**
 * Stop main
 * @param {function} done
 */
exports.stop = function(done){
  clearInterval(syncInterval)
  couch.disconnect()
  process.nextTick(done)
}

if(require.main === module){
  child(
    'stretchfs:' + config.store.name + ':stat:worker',
    function(done){
      exports.start(done)
    },
    function(done){
      exports.stop(done)
    }
  )
}
