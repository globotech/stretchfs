'use strict';
var P = require('bluebird')
var debug = require('debug')('stretchfs:store:stat')
var child = require('infant').child

var redis = require('../helpers/redis')()
var couch = require('../helpers/couchbase')

var config = require('../config')

var syncInterval

//open some buckets
var stretchInventory = couch.inventory()
var stretchfsPurchase = couch.purchase()


/**
 * Update the inventory stat
 * @param {string} hash
 * @param {number} hitCount
 * @param {number} byteCount
 * @return {P}
 */
var updateInventoryStat = function(hash,hitCount,byteCount){
  var inventoryKey = couch.schema.inventory(
    hash,config.store.prism,config.store.name)
  return stretchInventory.getAndLock(inventoryKey)
    .then(function(result){
      result.value.hitCount = result.value.hitCount + hitCount
      result.value.byteCount = result.value.byteCount + byteCount
      result.value.lastUpdated = new Date().toJSON()
      return stretchInventory.upsertAsync(
        inventoryKey,result.value,{cas: result.cas})
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
  return stretchfsPurchase.getAndLock(purchaseKey)
    .then(function(result){
      result.value.hitCount = result.value.hitCount + hitCount
      result.value.byteCount = result.value.byteCount + byteCount
      result.value.lastUpdated = new Date().toJSON()
      return stretchfsPurchase.upsertAsync(
        purchaseKey,result.value,{cas: result.cas})
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
 * Sync stats from redis
 * @return {P}
 */
var statSync= function(){
  debug('starting to sync stats')
  return P.all([
    statSyncInventory(),
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
