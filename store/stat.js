'use strict';
var P = require('bluebird')
var debug = require('debug')('stretchfs:store:stat')
var diskusage = P.promisifyAll(require('diskusage'))
var child = require('infant').child

var redis = require('../helpers/redis')()
var couch = require('../helpers/couchbase')

var config = require('../config')


var storeKey = couch.schema.store(config.store.name)
var syncInterval

//open some buckets
var couchInventory = couch.inventory()
var couchStretch = couch.stretchfs()
var couchPurchase = couch.purchase()


/**
 * Update the inventory stat
 * @param {string} hash
 * @param {number} hitCount
 * @param {number} byteCount
 * @return {P}
 */
var updateInventoryStat = function(hash,hitCount,byteCount){
  var storeName = config.store.name
  var inventoryKey = couch.schema.inventory(hash)
  return couchInventory.getAsync(inventoryKey)
    .then(function(result){
      result.value.hitCount = result.value.hitCount + hitCount
      result.value.byteCount = result.value.byteCount + byteCount
      result.value.hits[storeName] = result.value.hits[storeName] + hitCount
      result.value.bytes[storeName] = result.value.bytes[storeName] + byteCount
      result.value.lastUpdated = new Date().toJSON()
      return couchInventory.upsertAsync(
        inventoryKey,result.value,{cas: result.cas})
    })
    .catch(function(err){
      if(12 !== err.code) throw err
      return updateInventoryStat(hash,hitCount,byteCount)
    })
}


/**
 * Update the purchase stat
 * @param {string} token
 * @param {number} hitCount
 * @param {number} byteCount
 * @return {P}
 */
var updatePurchaseStat = function(token,hitCount,byteCount){
  var purchaseKey = couch.schema.purchase(token)
  return couchPurchase.getAsync(purchaseKey)
    .then(function(result){
      result.value.hitCount = result.value.hitCount + hitCount
      result.value.byteCount = result.value.byteCount + byteCount
      result.value.hits[storeName] = result.value.hits[storeName] + hitCount
      result.value.bytes[storeName] = result.value.bytes[storeName] + byteCount
      result.value.lastUpdated = new Date().toJSON()
      return couchPurchase.upsertAsync(
        purchaseKey,result.value,{cas: result.cas})
    })
    .catch(function(err){
      if(12 !== err.code) throw err
      return updatePurchaseStat(token,hitCount,byteCount)
    })
}


/**
 * Update the peer stat
 * @param {object} diskUsage
 * @param {array} slotUsage
 * @return {P}
 */
var updatePeerStat = function(diskUsage,slotUsage){
  return couchStretch.getAsync(storeKey)
    .then(function(result){
      result.value.usage = {
        free: diskUsage.free,
        total: diskUsage.total
      }
      result.value.slot = {
        count: slotUsage.length,
        list: slotUsage
      }
      return couchStretch.upsertAsync(storeKey,result.value,{cas: result.cas})
    })
    .catch(function(err){
      if(12 !== err.code) throw err
      return updatePeerStat(diskUsage,slotUsage)
    })
}


/**
 * Sync stats from redis
 * @return {P}
 */
var statSyncInventory = function(){
  debug('inventory stat sync starting')
  var keyCount = 0
  var overallHitCount = 0
  var overallByteCount = 0
  var collectKey = redis.schema.inventoryStatCollect()
  return redis.smembersAsync(collectKey)
    .each(function(hash){
      keyCount++
      //get the local keys
      var hitCountKey = redis.schema.inventoryStat(hash,'hit')
      var byteCountKey = redis.schema.inventoryStat(hash,'byte')
      return P.all([
        redis.getAsync(hitCountKey),
        redis.getAsync(byteCountKey)
      ])
        .spread(function(hitCount,byteCount){
          overallHitCount = overallHitCount + hitCount
          overallByteCount = overallByteCount + hitCount
          return updateInventoryStat(hitCount,byteCount)
        })
        .then(function(){
          //reset counter keys and collection set
          redis.set(hitCountKey,0)
          redis.set(byteCountKey,0)
        })
    })
    .then(function(){
      redis.del(collectKey)
      debug('inventory stat sync complete',
        keyCount,overallHitCount,overallByteCount)
    })
}


/**
 * Sync stats from redis
 * @return {P}
 */
var statSyncPurchases = function(){
  debug('purchase stat sync starting')
  var keyCount = 0
  var overallHitCount = 0
  var overallByteCount = 0
  var collectKey = redis.schema.purchaseStatCollect()
  return redis.smembersAsync(collectKey)
    .each(function(token){
      keyCount++
      //get the local keys
      var hitCountKey = redis.schema.purchaseStat(token,'hit')
      var byteCountKey = redis.schema.purchaseStat(token,'byte')
      return P.all([
        redis.getAsync(hitCountKey),
        redis.getAsync(byteCountKey)
      ])
        .spread(function(hitCount,byteCount){
          overallHitCount = overallHitCount + hitCount
          overallByteCount = overallByteCount + hitCount
          return updatePurchaseStat(token,hitCount,byteCount)
        })
        .then(function(){
          redis.set(hitCountKey,0)
          redis.set(byteCountKey,0)
        })
    })
    .then(function(){
      redis.del(collectKey)
      debug('purchase stat sync complete',
        keyCount,overallHitCount,overallByteCount)
    })
}


/**
 * Sync stats for peer
 * @return {P}
 */
var statSyncPeer = function(){
  debug('peer stat sync starting')
  var slotKey = redis.schema.peerSlot()
  var slotUsage = {}
  var diskUsage = {}
  return diskusage.checkAsync(config.root)
    .then(function(result){
      debug('got disk usage',result)
      diskUsage = result
      debug('getting slots')
      return redis.smembersAsync(slotKey)
    })
    .then(function(result){
      debug('got slots',result)
      slotUsage = result
      return updatePeerStat(diskUsage,slotUsage)
    })
    .then(function(){
      debug('peer stat sync complete')
    })
}


/**
 * Sync stats from redis
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
