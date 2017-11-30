'use strict';
var P = require('bluebird')
var debug = require('debug')('stretchfs:storeBalance')
var stretchfs = require('stretchfs-sdk')

var NotFoundError = stretchfs.NotFoundError
var couch = require('./couchbase')
var slotHelper = require('./slot')

//open couch buckets
var cb = couch.stretchfs()


/**
 * Get list of stores
 * @param {string} search
 * @return {P}
 */
exports.storeList = function(search){
  couch.counter(cb,couch.schema.counter('prism','storeBalance-storeList'))
  var storeKey = couch.schema.store(search)
  debug(storeKey,'getting store list')
  var qstring = 'SELECT ' +
    couch.getName(couch.type.stretchfs) + '.* FROM ' +
    couch.getName(couch.type.stretchfs) +
    ' WHERE META().id LIKE $1'
  var query = couch.N1Query.fromString(qstring)
  storeKey = storeKey + '%'
  return cb.queryAsync(query,[storeKey])
    .then(function(result){
      debug(storeKey,'got store list result',result)
      return result
    })
    .filter(function(row){
      debug(storeKey,'got store',row)
      var valid = true
      if(-1 === row.roles.indexOf('active')) valid = false
      if(-1 === row.roles.indexOf('online')) valid = false
      return valid
    })
}


/**
 * Take an existence map and turn it into an array of store instances
 * @param {object} inventory
 * @param {Array} skip
 * @return {Array}
 */
exports.existsToArray = function(inventory,skip){
  if(!(skip instanceof Array)) skip = []
  var result = []
  inventory.map.forEach(function(row){
    if(-1 === skip.indexOf(row)) result.push(row)
  })
  return result
}


/**
 * Populate stores from array of names
 * @param {Array} storeList
 * @return {P}
 */
exports.populateStores = function(storeList){
  couch.counter(cb,couch.schema.counter('prism','storeBalance-populateStores'))
  return P.try(function(){
    return storeList
  })
    .map(function(row){
      var storeKey = couch.schema.store(row)
      return cb.getAsync(storeKey)
        .then(function(result){
          return result.value
        })
    })
    .then(function(results){
      return results
    })
}


/**
 * Take the result of an existence check and pick a winner
 * @param {object} req
 * @param {object} inventory
 * @param {Array} skip
 * @return {P}
 */
exports.selectReadPeer = function(req,inventory,skip){
  couch.counter(cb,couch.schema.counter('prism','storeBalance-selectReadPeer'))
  if(!(skip instanceof Array)) skip = []
  var candidates = exports.existsToArray(inventory,skip)
  if(!candidates.length) throw new NotFoundError('No store candidates found')
  var slot = {}
  var winner = false
  //get the slot or create it
  var slotKey = couch.schema.slot(
    req.ip,
    req.connection.remotePort,
    req.headers['user-agent'],
    inventory.hash
  )
  return slotHelper.upsertAndGet(slotKey,req,inventory.hash)
    .then(function(result){
      slot = result
      return exports.populateStores(candidates)
    })
    .filter(function(store){
      return (
        store &&
        store.roles &&
        store.roles.indexOf('read') >= 0 &&
        -1 === skip.indexOf(store.name)
      )
    })
    .map(function(store){
      if(slot.value.hits && slot.value.hits[store.name]){
        store.hitCount = +slot.value.hits[store.name]
      }
      if(!winner || (winner && store.hitCount < winner.hitCount)){
        winner = store
      }
    })
    .then(function(){
      if(!winner) throw new Error('No stores available')
      return winner
    })
    .catch(function(err){
      if(12 !== err.code) throw err
      return exports.selectReadPeer(req,inventory,skip)
    })
}


/**
 * Pick a winner from a prism list
 * @param {Array} storeList
 * @param {Array} skip
 * @return {P}
 */
exports.selectWritePeer = function(storeList,skip){
  couch.counter(cb,couch.schema.counter('prism','storeBalance-selectWritePeer'))
  var winner = false
  if(!(skip instanceof Array)) skip = []
  if(!(storeList instanceof Array)) storeList = []
  storeList.forEach(function(store){
    if(
      (
        -1 === skip.indexOf(store.name) && //ensure not skipped
        (store.roles.indexOf('write') > 0) //ensure writable
      ) &&
      (
        !winner || (winner.usage.free < store.usage.free) //select most avail
      )
    )
    {
      winner = store
    }
  })
  return P.try(function(){
    if(!winner) throw new Error('No store candidates available to write')
    return winner
  })
}
