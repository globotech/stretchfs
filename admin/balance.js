'use strict';
var P = require('bluebird')
var debug = require('debug')('stretchfs:balance')
var diskusage = P.promisifyAll(require('diskusage'))
var child = require('infant').child

var redis = require('../helpers/redis')()
var couch = require('../helpers/couchbase')

var config = require('../config')


var storeKey = couch.schema.store(config.store.name)
var balanceInterval
var balanceLock = false

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
  var inventoryKey = couch.schema.inventory(hash,config.store.name)
  return couchInventory.getAsync(inventoryKey)
    .then(function(result){
      result.value.hitCount = result.value.hitCount + hitCount
      result.value.byteCount = result.value.byteCount + byteCount
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
var listImbalanced = function(){
  debug('listing imbalanced inventory')
  var tname = couch.getName(couch.type.INVENTORY,true)
  var qstring = 'SELECT META().id AS _id, ' + tname + '.* FROM ' + tname +
    ' WHERE META().id NOT LIKE $1 AND '
  var query = couch.N1Query.fromString(qstring)
  query.consistency(couch.N1Query.Consistency.REQUEST_PLUS)
  var inventoryKey = '%:%'
  return couchInventory.queryAsync(query,[inventoryKey])
    .then(function(result){
      debug('list imbalanced complete',result)
      return result
    })
}


/**
 * Balance an inventory record
 * @return {P}
 */
var balanceRecord = function(row){
  debug(row.hash,'beginning to balance')
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
var inventoryBalance= function(){
  if(balanceLock && balanceTries < config.inventory.balance.maxLockout){
    debug('skipping run, balance locked')
    return
  } else if(balanceTries >= config.inventory.balance.maxLockout){
    debug('skipping run, however, max lock out reached, clearing lock')
    balanceLock = false
    return
  }
  balanceLock = true
  debug('starting to balance inventory')
  return listImbalanced()
    .each(function(row){
      return balanceRecord(row)
    })
    .then(function(){
      debug('balance complete')
    })
    .catch(function(err){
      console.log(err)
      logger.log('error','Inventory balance ',err.message)
    })
    .finally(function(){
      balanceLock = false
    })
}


/**
 * Start main
 * @param {function} done
 */
exports.start = function(done){
  debug('starting inventory balancer')
  balanceInterval = setInterval(
    inventoryBalance,config.inventory.balanceFrequency)
  process.nextTick(done)
}


/**
 * Stop main
 * @param {function} done
 */
exports.stop = function(done){
  clearInterval(balanceInterval)
  couch.disconnect()
  process.nextTick(done)
}

if(require.main === module){
  child(
    'stretchfs:balancer',
    function(done){
      exports.start(done)
    },
    function(done){
      exports.stop(done)
    }
  )
}
