'use strict';
var P = require('bluebird')
var debug = require('debug')('oose:storeBalance')
var oose = require('oose-sdk')

var NotFoundError = oose.NotFoundError
var couchdb = require('../helpers/couchdb')
var redis = require('../helpers/redis')()


/**
 * Get list of stores by prism
 * @param {string} prism
 * @return {P}
 */
exports.storeList = function(prism){
  redis.incr(redis.schema.counter('prism','storeBalance:storeList'))
  var storeKey = couchdb.schema.store(prism)
  debug(storeKey,'getting store list')
  return couchdb.peer.listAsync(
    {startkey: storeKey, endkey: storeKey + '\uffff', include_docs: true})
    .then(function(rows){
      return rows.rows
    })
    .map(function(row){
      return row.doc
    })
    .filter(function(doc){
      debug(storeKey,'got store',doc)
      return doc.name && doc.available && doc.active
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
  inventory.map.forEach(function(store){
    if(skip.indexOf(store) < 0) result.push(store)
  })
  return result
}


/**
 * Populate stores from array of names
 * @param {Array} stores
 * @return {P}
 */
exports.populateStores = function(stores){
  redis.incr(redis.schema.counter('prism','storeBalance:populateStores'))
  return P.try(function(){
    return stores
  })
    .map(function(store){
      return couchdb.peer.getAsync(couchdb.schema.store(store))
    })
    .then(function(results){
      return results
    })
}


/**
 * Populate hits from a token
 * @param {string} token
 * @param {Array} storeList
 * @return {P}
 */
exports.populateHits = function(token,storeList){
  redis.incr(redis.schema.counter('prism','storeBalance:populateHits'))
  return P.try(function(){
    return storeList
  })
    .map(function(store){
      return redis.getAsync(redis.schema.storeHits(token,store.name))
        .then(function(hits){
          store.hits = +hits
          return store
        })
    })
}


/**
 * Take the result of an existence check and pick a winner
 * @param {string} token
 * @param {object} inventory
 * @param {Array} skip
 * @param {boolean} allowFull
 * @return {P}
 */
exports.winnerFromExists = function(token,inventory,skip,allowFull){
  if(undefined === allowFull) allowFull = false
  redis.incr(redis.schema.counter('prism','storeBalance:winnerFromExists'))
  if(!(skip instanceof Array)) skip = []
  var candidates = exports.existsToArray(inventory,skip)
  if(!candidates.length) throw new NotFoundError('No store candidates found')
  return exports.populateStores(candidates)
    .then(function(results){
      return exports.populateHits(token,results)
    })
    .then(function(results){
      return exports.pickWinner(token,results,skip,allowFull)
    })
}


/**
 * Pick a winner from a prism list
 * @param {Array} storeList
 * @param {Array} skip
 * @return {P}
 */
exports.winner = function(storeList,skip){
  redis.incr(redis.schema.counter('prism','storeBalance:winner'))
  var token = 'new'
  return exports.populateHits(token,storeList)
    .then(function(storeList){
      return exports.pickWinner(token,storeList,skip)
    })
}


/**
 * Pick a winner
 * @param {string} token
 * @param {array} storeList
 * @param {array} skip
 * @param {bool} allowFull
 * @return {P}
 */
exports.pickWinner = function(token,storeList,skip,allowFull){
  if(undefined === allowFull) allowFull = false
  var store
  var winner = false
  if(!token) token = 'new'
  if(!(skip instanceof Array)) skip = []
  if(!(storeList instanceof Array)) storeList = []
  for(var i = 0; i < storeList.length; i++){
    store = storeList[i]
    if((-1 === skip.indexOf(store.name) && (allowFull || store.writable)) &&
      ((!winner) || (winner.hits > store.hits))) winner = store
  }
  return redis.incrAsync(redis.schema.storeHits(token,winner.name))
    .then(function(){
      return winner
    })
}
