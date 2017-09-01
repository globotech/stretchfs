'use strict';
var P = require('bluebird')
var debug = require('debug')('oose:prismBalance')

var config = require('../config')
var couchdb = require('../helpers/couchdb')
var redis = require('../helpers/redis')()
var logger = require('./logger')

var peerGetRows = function(rows){
  var ids = []
  for(var i=0; i < rows.length; i++) ids.push(rows[i].id)
  return couchdb.peer.getAsync(ids)
}


/**
 * Get list of prisms and cache the result
 * @return {P}
 */
exports.peerList = function(){
  redis.incr(redis.schema.counter('prism','prismBalance:peerList'))
  var prismKey = couchdb.schema.prism()
  var storeKey = couchdb.schema.store()
  debug('Querying for peer list')
  return P.all([
    (function(){
      return couchdb.peer.listAsync({
          startkey: prismKey,
          endkey: prismKey + '\uffff'
        })
        .then(function(rows){
          return peerGetRows(rows)
        })
        .map(function(row){
          row.doc.type = couchdb.schema.PEER_TYPES.prism
          return row.doc
        })
    }()),
    (function(){
      return couchdb.peer.listAsync({
        startkey: storeKey,
        endkey: storeKey + '\uffff'
      })
        .then(function(rows){
          return peerGetRows(rows)
        })
        .map(function(row){
          row.doc.type = couchdb.schema.PEER_TYPES.store
          return row.doc
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
  var prismKey = couchdb.schema.prism()
  return couchdb.peer.listAsync(
    {startkey: prismKey, endkey: prismKey + '\uffff'})
    .then(function(rows){
      return peerGetRows(rows)
    })
    .map(function(row){
      return row.doc
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
  var storeKey = couchdb.schema.store(prism)
  return couchdb.peer.all({startkey: storeKey, endkey: storeKey + '\uffff'})
    .map(function(row){
      return couchdb.peer.getAsync(row.key)
    })
    .filter(function(row){
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
 * @param {boolean} cacheEnable
 * @return {P}
 */
exports.contentExists = function(hash,cacheEnable){
  if('undefined' === typeof cacheEnable) cacheEnable = true
  else cacheEnable = (cacheEnable)
  redis.incr(redis.schema.counter('prism','prismBalance:contentExists'))
  var existsKey = couchdb.schema.inventory(hash)
  var existsRecord = {}
  var count = 0
  var cacheValid = false
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
  return redis.getAsync(existsKey)
    .then(function(result){
      if(result){
        try {
          result = JSON.parse(result)
          cacheValid = true
        } catch(e){
          cacheValid = false
        }
      }
      if(cacheEnable && cacheValid){
        return result
      } else {
        return couchdb.inventory.listAsync({
          startkey: existsKey,
          endkey: existsKey + '\uffff'
        })
          .map(function(row){
            debug(existsKey,'got record',row)
            count++
            return couchdb.inventory.getAsync(row.key)
              .catch(function(err){
                if(404 !== err.statusCode) throw err
              })
          })
          .then(function(inventoryList){
            //debug(existsKey,'records',result)
            if(!count){
              return deadRecord
            } else {
              return P.try(function(){
                  return inventoryList
                })
                .map(function(row){
                  debug(existsKey,'got inventory list record',row)
                  return P.all([
                    couchdb.peer.getAsync(couchdb.schema.prism(row.prism))
                      .catch(function(){
                        return {name:row.prism,available:false}
                      }),
                    couchdb.peer.getAsync(
                      couchdb.schema.store(row.prism,row.store))
                      .catch(function(){
                        return {name:row.store,available:false}
                      })
                  ])
                })
                .filter(function(row){
                  return (!cacheEnable)||(row[0].available && row[1].available)
                })
                .then(function(result){
                  var map = result.map(function(val){
                    var avail = cacheEnable ? '' : ':' +
                      ((val[0].available) ? '+' : '-') +
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
            //only record cache if record exists
            if(true === existsRecord.exists){
              return redis.setAsync(existsKey,JSON.stringify(existsRecord))
                .then(function(){
                  return redis.expireAsync(
                    existsKey,+config.prism.existsCacheLife || 30
                  )
                })
            }
          })
          .then(function(){
            return existsRecord
          })
          .catch(function(err){
            logger.log('error',err)
            logger.log('error', err.stack)
            logger.log('error', 'EXISTS ERROR: ' + err.message + '  ' + hash)
            return deadRecord
          })
      }
    })
}
