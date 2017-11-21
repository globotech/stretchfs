'use strict';
var P = require('bluebird')
var debug = require('debug')('stretchfs:prismBalance')

var couch = require('./couchbase')
var redis = require('../helpers/redis')()

//open couch buckets
var cb = couch.stretchfs()


/**
 * Get list of prisms and cache the result
 * @return {P}
 */
exports.peerList = function(){
  redis.incr(redis.schema.counter('prism','prismBalance:peerList'))
  var prismKey = couch.schema.prism()
  var storeKey = couch.schema.store()
  debug('Querying for peer list')
  return P.all([
    (function(){
      var qstring = 'SELECT ' +
        couch.getName(couch.type.STRETCHFS,true) + '.* FROM ' +
        couch.getName(couch.type.STRETCHFS,true) +
        ' WHERE META().id LIKE $1'
      var query = couch.N1Query.fromString(qstring)
      prismKey = prismKey + '%'
      return cb.queryAsync(query,[prismKey])
        .then(function(result){
          return result
        })
        .map(function(row){
          row.type = couch.schema.PEER_TYPES.prism
          return row
        })
    }()),
    (function(){
      var qstring = 'SELECT ' +
        couch.getName(couch.type.STRETCHFS,true) + '.* FROM ' +
        couch.getName(couch.type.STRETCHFS,true) +
        ' WHERE META(b).id LIKE $1'
      var query = couch.N1Query.fromString(qstring)
      storeKey = storeKey + '%'
      return cb.queryAsync(query,[storeKey])
        .then(function(result){
          return result
        })
        .map(function(row){
          row.type = couch.schema.PEER_TYPES.store
          return row
        })
    }())
  ])
    .then(function(result){
      debug('Peer list result',
        'prism',result[0].length,'store',result[1].length)
      var peers = []
      peers = peers.concat(result[0] || [])
      peers = peers.concat(result[1] || [])
      return peers
    })
}


/**
 * Get list of prisms and cache the result
 * @return {P}
 */
exports.prismList = function(){
  redis.incr(redis.schema.counter('prism','prismBalance:prismList'))
  var prismKey = couch.schema.prism()
  var qstring = 'SELECT ' +
    couch.getName(couch.type.STRETCHFS,true) + '.* FROM ' +
    couch.getName(couch.type.STRETCHFS,true) +
    'WHERE META(b).id LIKE $1'
  var query = couch.N1Query.fromString(qstring)
  prismKey = prismKey + '%'
  return cb.queryAsync(query,[prismKey])
    .then(function(result){
      return result
    })
    .filter(function(doc){
      return doc.name && doc.available && doc.active
    })
}


/**
 * Populate hits from a token
 * @param {string} token
 * @param {Array} prismList
 * @return {Array}
 */
exports.populateHits = function(token,prismList){
  redis.incr(redis.schema.counter('prism','prismBalance:populateHits'))
  var populate = function(prism){
    return function(hits){
      prism.hits = +hits
    }
  }
  var promises = []
  var prism
  for(var i = 0; i < prismList.length; i++){
    prism = prismList[i]
    promises.push(
      redis.getAsync(redis.schema.prismHits(token,prism.name))
        .then(populate(prism))
    )
  }
  return P.all(promises)
    .then(function(){
      return prismList
    })
}


/**
 * Pick a winner from a prism list
 * @param {string} token
 * @param {Array} prismList
 * @param {Array} skip
 * @param {boolean} allowFull
 * @return {P}
 */
exports.winner = function(token,prismList,skip,allowFull){
  if(undefined === allowFull) allowFull = false
  redis.incr(redis.schema.counter('prism','prismBalance:winner'))
  if(!(skip instanceof Array)) skip = []
  if(!(prismList instanceof Array)) prismList = []
  var winner = false
  return exports.populateHits(token,prismList)
    .then(function(prismList){
      var prism
      for(var i = 0; i < prismList.length; i++){
        prism = prismList[i]
        if((-1 === skip.indexOf(prism.name)) && (allowFull || prism.writable) &&
          ((!winner) || (winner.hits > prism.hits))) winner = prism
      }
      return redis.incrAsync(redis.schema.prismHits(token,winner.name))
    })
    .then(function(){
      return winner
    })
}


/**
 * Check existence of a hash (cached)
 * @param {string} hash
 * @return {P}
 */
exports.contentExists = function(hash){
  redis.incr(redis.schema.counter('prism','prismBalance:contentExists'))
  var existsKey = couch.schema.inventory(hash)
  debug(existsKey,'contentExists received')
  return cb.getAsync(existsKey)
    .then(function(result){
      result.value.exists = true
      result.value.copies = parseInt(result.value.copies)
      result.value.size = parseInt(result.value.size)
      return result.value
    })
    .then(function(result){
      debug(existsKey,'exists found',result)
      return result
    })
    .catch(function(err){
      if(13 !== err.code && 53 !== err.code) throw err
      return {
        hash: hash,
        mimeType: null,
        mimeExtension: null,
        map: [],
        size: 0,
        copies: 0,
        relativePath: null,
        exists: false
      }
    })
}
