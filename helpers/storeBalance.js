'use strict';
var P = require('bluebird')
var debug = require('debug')('stretchfs:storeBalance')
var stretchfs = require('stretchfs-sdk')

var NotFoundError = stretchfs.NotFoundError
var couch = require('./couchbase')
var redis = require('../helpers/redis')()

//open couch buckets
var cb = couch.stretchfs()


/**
 * Get list of stores
 * @param {string} search
 * @return {P}
 */
exports.storeList = function(search){
  redis.incr(redis.schema.counter('prism','storeBalance:storeList'))
  var storeKey = couch.schema.store(search)
  debug(storeKey,'getting store list')
  var qstring = 'SELECT ' +
    couch.getName(couch.type.STRETCHFS,true) + '.* FROM ' +
    couch.getName(couch.type.STRETCHFS,true) +
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
  redis.incr(redis.schema.counter('prism','storeBalance:populateStores'))
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
    if(
      (-1 === skip.indexOf(store.name) &&
      (allowFull || store.roles.indexOf('write') > 0)) &&
      ((!winner) || (winner.usage.free < store.usage.free))) winner = store
  }
  return redis.incrAsync(redis.schema.storeHits(token,winner.name))
    .then(function(){
      return winner
    })
}
