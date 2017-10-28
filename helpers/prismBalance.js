'use strict';
var P = require('bluebird')
var debug = require('debug')('oose:prismBalance')

var couch = require('./couchbase')
var redis = require('../helpers/redis')()
var logger = require('./logger')


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
      var qstring = 'SELECT b.* FROM ' +
        couch.getName(couch.type.PEER,true) + ' b ' +
        'WHERE META(b).id LIKE $1'
      var query = couch.N1Query.fromString(qstring)
      prismKey = prismKey + '%'
      return couch.peer.queryAsync(query,[prismKey])
        .then(function(result){
          return result
        })
        .map(function(row){
          row.type = couch.schema.PEER_TYPES.prism
          return row
        })
    }()),
    (function(){
      var qstring = 'SELECT b.* FROM ' +
        couch.getName(couch.type.PEER,true) + ' b ' +
        'WHERE META(b).id LIKE $1'
      var query = couch.N1Query.fromString(qstring)
      storeKey = storeKey + '%'
      return couch.peer.queryAsync(query,[storeKey])
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
  var qstring = 'SELECT b.* FROM ' +
    couch.getName(couch.type.PEER,true) + ' b ' +
    'WHERE META(b).id LIKE $1'
  var query = couch.N1Query.fromString(qstring)
  prismKey = prismKey + '%'
  return couch.peer.queryAsync(query,[prismKey])
    .then(function(result){
      return result
    })
    .filter(function(doc){
      return doc.name && doc.available && doc.active
    })
}


/**
 * Store list by prism
 * @param {string} prism
 * @return {P}
 */
exports.storeListByPrism = function(prism){
  redis.incr(redis.schema.counter('prism','prismBalance:storeListByPrism'))
  var storeKey = couch.schema.store(prism)
  return couch.peer.all({startkey: storeKey, endkey: storeKey + '\uffff'})
    .map(function(row){
      return couch.peer.getAsync(row.key)
    })
    .filter(function(row){
      row = row.value
      return row.available && row.active
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
  var existsKeyQ = existsKey + '%'
  var existsRecord = {}
  var count = 0
  debug(existsKey,'contentExists received')
  var deadRecord = {
    hash: hash,
    mimeType: null,
    mimeExtension: null,
    relativePath: null,
    exists: false,
    count: 0,
    size: 0,
    map: []
  }
  var qstring = 'SELECT b.* FROM ' +
    couch.getName(couch.type.INVENTORY,true) + ' b ' +
    'WHERE META(b).id LIKE $1'
  var query = couch.N1Query.fromString(qstring)
  return couch.inventory.queryAsync(query,[existsKeyQ])
    .then(function(result){
      debug(existsKey,'got inventory result',result)
      return result
    })
    .map(function(row){
      debug(existsKey,'got record',row)
      count++
      return couch.inventory.getAsync(row.key)
        .then(function(result){
          return result.value
        })
        .catch(function(err){
          if(!err || !err.code || 13 !== err.code) throw err
        })
    })
    .then(function(inventoryList){
      //debug(existsKey,'records',result)
      if(!count || !inventoryList){
        return deadRecord
      } else {
        return P.try(function(){
          return inventoryList
        })
          .map(function(row){
            debug(existsKey,'got inventory list record',row)
            return P.all([
              couch.peer.getAsync(couch.schema.prism(row.prism))
                .then(function(result){
                  return result.value
                })
                .catch(function(){
                  return {name:row.prism,available:false}
                }),
              couch.peer.getAsync(
                couch.schema.store(row.prism,row.store))
                .then(function(result){
                  return result.value
                })
                .catch(function(){
                  return {name:row.store,available:false}
                })
            ])
          })
          .filter(function(row){
            return (row[0].available && row[1].available)
          })
          .then(function(result){
            var map = result.map(function(val){
              var avail = ((val[0].available) ? '+' : '-') +
                          ((val[1].available) ? '+' : '-')
              return val[0].name + ':' + val[1].name + avail
            })
            var record = {
              hash: inventoryList[0].hash,
              mimeType: inventoryList[0].mimeType,
              mimeExtension: inventoryList[0].mimeExtension,
              relativePath: inventoryList[0].relativePath,
              size: inventoryList[0].size,
              count: map.length,
              exists: true,
              map: map
            }
            debug(existsKey,'inventory record',record)
            return record
          })
      }
    })
    .then(function(result){
      existsRecord = result
      return existsRecord
    })
    .catch(function(err){
      logger.log('error',err)
      logger.log('error', err.stack)
      logger.log('error', 'EXISTS ERROR: ' + err.message + '  ' + hash)
      return deadRecord
    })
}
