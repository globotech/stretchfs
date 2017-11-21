'use strict';
var P = require('bluebird')
var debug = require('debug')('stretchfs:balance:supervisor')
var child = require('infant').child

var couch = require('../../helpers/couchbase')
var promiseWhile = require('../../helpers/promiseWhile')

var config = require('../../config')

//open some buckets
var couchInventory = couch.inventory()
var couchStretch = couch.stretchfs()

//balance lock
var balanceInterval
var balanceLock = false

//setup some types
var copyType = {
  CACHE: 'cache',
  DATA: 'data'
}

var copyCondition = {
  addCache: function(inventory){
    var cond = inventory.desiredMap.length <= inventory.desiredCopies
    debug(inventory.hash,'checking while condition for add cache',cond)
    return cond
  },
  removeCache: function(inventory){
    var cond = inventory.desiredMap.length >= inventory.desiredCopies
    debug(inventory.hash,'checking while condition for remove cache',cond)
    return cond
  },
  addData: function(inventory){
    var cond = inventory.desiredMap.length <= inventory.desiredCopies
    debug(inventory.hash,'checking while condition for add data',cond)
    return cond
  },
  removeData: function(inventory){
    var cond = inventory.desiredMap.length >= inventory.desiredCopies
    debug(inventory.hash,'checking while condition for remove data',cond)
    return cond
  }
}


/**
 * Find and list single inventory records
 * @param {integer} limit
 * @return {P}
 */
var listSingles = function(limit){
  debug('listing imbalanced inventory')
  var tname = couch.getName(couch.type.INVENTORY,true)
  var qstring = 'SELECT META().id AS _id, ' + tname + '.* FROM ' + tname +
    ' WHERE META().id LIKE $1 AND copies < 2 ' +
    ' LIMIT ' + (limit || 5000)
  var query = couch.N1Query.fromString(qstring)
  query.consistency(couch.N1Query.Consistency.REQUEST_PLUS)
  var inventoryKey = '%:%'
  return couchInventory.queryAsync(query,[inventoryKey])
    .then(function(result){
      debug('list singles complete',result.length)
      return result
    })
}


/**
 * Find and list imbalanced inventory records
 * @param {integer} limit
 * @return {P}
 */
var listImbalanced = function(limit){
  debug('listing imbalanced inventory')
  var tname = couch.getName(couch.type.INVENTORY,true)
  var qstring = 'SELECT META().id AS _id, ' + tname + '.* FROM ' + tname +
    ' WHERE META().id LIKE $1 AND desiredCopies <> copies' +
    ' LIMIT ' + (limit || 10000)
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
 * Find and list inventory records wanting cache
 * @param {integer} limit
 * @return {P}
 */
var listHot = function(limit){
  debug('listing hot inventory needing cache copies')
  var tname = couch.getName(couch.type.INVENTORY,true)
  var qstring = 'SELECT META().id AS _id, ' + tname + '.* FROM ' + tname +
    ' WHERE META().id LIKE $1 AND copies - cacheCopies < 0' +
    ' LIMIT ' + (limit || 250)
  var query = couch.N1Query.fromString(qstring)
  query.consistency(couch.N1Query.Consistency.REQUEST_PLUS)
  var inventoryKey = '%:%'
  return couchInventory.queryAsync(query,[inventoryKey])
    .then(function(result){
      debug('list hot complete',result)
      return result
    })
}


/**
 * List general inventory records
 * @param {integer} limit
 * @return {P}
 */
var listGeneral = function(limit){
  debug('listing general inventory')
  var tname = couch.getName(couch.type.INVENTORY,true)
  var qstring = 'SELECT META().id AS _id, ' + tname + '.* FROM ' + tname +
    ' WHERE META().id LIKE $1 AND ' +
    ' (lastBalancedAt IS NULL OR lastBalancedAt < $2) ' +
    ' LIMIT ' + (limit || 10000)
  var query = couch.N1Query.fromString(qstring)
  query.consistency(couch.N1Query.Consistency.REQUEST_PLUS)
  var inventoryKey = '%:%'
  var lastBalancedKey = new Date(
    (+new Date() - config.inventory.balance.expiration)
  )
  return couchInventory.queryAsync(query,[inventoryKey,lastBalancedKey])
    .then(function(result){
      debug('list imbalanced complete',result)
      return result
    })
}


/**
 * Add Copy
 * @param {object} inventory
 * @param {string} type
 * @param {function} condition
 * @return {P}
 */
var addCopy = function(inventory,type,condition){
  return promiseWhile(
    function(){
      return condition(inventory,type)
    },
    function(){
      var copyKey
      var storeTo
      return storeBalance.winner(storeList,skip)
        .then(function(result){
          storeTo = result
          copyKey = couch.schema.inventoryCopy(inventory.hash,storeTo.name)
          var copy = {
            hash: inventory.hash,
            storeFrom: null,
            storeTo: storeTo,
            action: 'copy',
            status: 'queued'
          }
          return couchStretch.upsertAsync(copyKey,copy,{cas: null})
        })
        .then(function(){
          //update desired map
          inventory.desiredMap.push([storeTo.name])
          debug(inventory.hash,'updated desired map',inventory.desiredMap)
          //update job map
          inventory.jobMap.push({
            storeFrom: null,
            storeTo: storeTo,
            type: type,
            action: 'copy',
            handle: copyKey
          })
          debug(inventory.hash,'updated job map',inventory.desiredMap)
          return inventory
        })
    }
  )
}


/**
 * Remove Copy
 * @param {object} inventory
 * @param {string} type
 * @param {function} condition
 * @return {P}
 */
var removeCopy = function(inventory,type,condition){
  return promiseWhile(
    function(){
      return condition(inventory,type)
    },
    function(){
      var storeFrom
      var copyKey
      return storeBalance.winnerFromExists(inventory.hash,inventory,[],true)
        .then(function(result){
          storeFrom = result
          copyKey = couch.schema.inventoryCopy(inventory.hash,storeFrom.name)
          var copy = {
            hash: inventory.hash,
            storeFrom: storeFrom,
            storeTo: null,
            action: 'remove',
            status: 'queued'
          }
          return couchStretch.upsertAsync(copyKey,copy,{cas: null})
        })
        .then(function(){
          //update desired map
          var desiredIndex = inventory.desiredMap.indexOf(storeTo.name)
          inventory.desiredMap.splice(desiredIndex,1)
          debug(inventory.hash,'updated desired map',inventory.desiredMap)
          //update job map
          inventory.jobMap.push({
            storeFrom: storeFrom,
            storeTo: null,
            type: type,
            action: 'remove',
            handle: copyKey
          })
          debug(inventory.hash,'updated job map',inventory.desiredMap)
          return inventory
        })
    }
  )
}

/**
 * Manage a record and control job flow
 * @param {object} inventory
 * @return {boolean}
 */
var manageRecord = function(inventory){
  return P.try(function(){
    return inventory
  })
}


/**
 * Validate whether a record needs balanced or jobs have already been scheduled
 * @param {object} inventory
 * @return {boolean}
 */
var validateBalance = function(inventory){
  return P.try(function(){
    return inventory
  })
}


/**
 * Balance an inventory record
 * @return {P}
 */
var balanceRecord = function(inventory){
  debug(inventory.hash,'beginning to balance')
  debug(inventory.hash,'managing record')
  return manageRecord(inventory)
    .then(function(result){
      debug(inventory.hash,'manage complete',result)
      inventory = result
      debug(inventory.hash,'validating balance',result)
      return validateBalance(inventory)
    })
    .then(function(result){
      debug(inventory.hash,'validate complete',result)
      inventory = result
      //first things first if this is a single lets make sure its not
      if(!config.inventory.unsafe){
        if(inventory.copies <= 1){
          inventory.cacheCopies = 0
          inventory.desiredCopies = 2
        }
      }
      //first we look at the total delta
      //lets take some example numbers,
      // copies: 2, desiredCopies: 4, cacheCopies:1
      //4 (desired) - 2 (copies) = 2 (totalDelta) (needs to copies)
      //2 (copies) - 1 (cacheCopies) = 1 (cacheDelta) (needs 1 cache copy)
      //2 (totalDelta) - 1 (cacheDelta) = 1 (dataDelta)
      //so in this instance we need to spawn 1 job to create a new data copy
      //and 1 job to create a new cache copy
      //lets do another scenario, copies: 4, desiredCopies: 2, cacheCopies: 2
      //2 (desired) - 4 (copies) = -2 (totalDelta) (needs less copies)
      //4 (copies) - 2 (cacheCopies) = 2 (cacheDelta)
      // (2 of the 4 copies are cache)
      //-2 (totalDelta) - 2 (cacheDelta) = 0 (dataDelta remove 0 data copies)
      //this will tell us to destroy 2 cache copies
      var totalDelta = inventory.desiredCopies - inventory.copies
      var cacheDelta = inventory.copies - inventory.cacheCopies
      var dataDelta = totalDelta - cacheDelta
      //once the deltas are sorted out they will adjust the desiredMap and from
      //the desiredMap schedule jobs and store those job handles in jobMap
      //serialized by <destStore>:<handle> //sources will be picked at job
      //execution time
      //reset the desiredMap to the current map prior to starting for sanity
      inventory.desiredMap = inventory.map
      //first deal with cache deltas
      if(totalDelta > 0 && cacheDelta > 0){
        //adding cache copies
        debug(inventory.hash,'addCopy',copyType.CACHE)
        return addCopy(inventory,copyType.CACHE,copyCondition.addCache)
      }
      else if(totalDelta > 0 && dataDelta > 0){
        //adding data copies
        debug(inventory.hash,'addCopy',copyType.DATA)
        return addCopy(inventory,copyType.DATA,copyCondition.addData)
      }
      else if(totalDelta < 0 && cacheDelta > 0){
        //removing cache copies
        debug(inventory.hash,'removeCopy',copyType.CACHE)
        return removeCopy(inventory,copyType.CACHE,copyCondition.removeCache)
      }
      else if(totalDelta < 0 && cacheDelta <= 0){
        //removing data copies
        debug(inventory.hash,'removeCopy',copyType.DATA)
        return removeCopy(inventory,copyType.DATA,copyCondition.removeData)
      } else {
        debug(inventory.hash,'unknown balance hit',inventory)
        //we dont know how to balance this
        console.log(inventory.hash,
          'Balance failed no known rules work',inventory)
        return new P(function(resolve){
          process.nextTick(resolve)
        })
      }
    })
    .then(function(result){
      inventory = result
      var inventoryKey = couch.schema.inventory(inventory.hash)
      //get a fresh copy of inventory for saving
      return couchInventory.getAsync(inventoryKey)
    })
    .then(function(result){
      return couchInventory.upsertAsync(
        inventoryKey,inventory,{cas: result.cas})
    })
}


/**
 * Sync stats from redis
 * @return {P}
 */
var inventoryBalance= function(){
  return
  if(balanceLock && balanceTries < config.inventory.balance.maxLockout){
    debug('skipping run, balance locked')
    return
  } else if(balanceTries >= config.inventory.balance.maxLockout){
    debug('skipping run, however, max lock out reached, clearing lock')
    balanceLock = false
    return
  }
  balanceLock = true
  debug('starting to balance single copy inventory')
  return listSingles()
    .each(function(row){
      debug('balancing single copy record',row)
      return balanceRecord(row)
    })
    .then(function(){
      debug('singles balance complete')
      debug('scanning for hot content')
      return listHot()
    })
    .each(function(row){
      debug('caching record for performance',row)
      return balanceRecord(row)
    })
    .then(function(){
      debug('performance scanning and caching complete')
      debug('scanning for active deltas')
      return listImbalanced()
    })
    .each(function(row){
      debug('managing record',row)
      return balanceRecord(row)
    })
    .then(function(){
      debug('delta management complete')
      debug('analyzing general inventory')
      return listGeneral()
    })
    .each(function(row){
      debug('balancing record',row)
      balanceRecord(row)
    })
    .then(function(){
      debug('general balancing for this run complete')
    })
    .catch(function(err){
      console.log(err)
      logger.log('error','Inventory balance ',err.message)
    })
    .finally(function(){
      debug('unlocking balance for next run')
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
    'stretchfs:balance:supervisor',
    function(done){
      exports.start(done)
    },
    function(done){
      exports.stop(done)
    }
  )
}
