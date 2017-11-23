'use strict';
var P = require('bluebird')
var debug = require('debug')('stretchfs:prismBalance')

var couch = require('./couchbase')

//open couch buckets
var cb = couch.stretchfs()


/**
 * Get list of prisms and cache the result
 * @return {P}
 */
exports.peerList = function(){
  couch.counter(cb,couch.schema.counter('prism','prismBalance-peerList'))
  var prismKey = couch.schema.prism()
  var storeKey = couch.schema.store()
  debug('Querying for peer list')
  return P.all([
    (function(){
      var qstring = 'SELECT ' +
        couch.getName(couch.type.stretchfs) + '.* FROM ' +
        couch.getName(couch.type.stretchfs) +
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
        couch.getName(couch.type.stretchfs) + '.* FROM ' +
        couch.getName(couch.type.stretchfs) +
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
  couch.counter(cb,couch.schema.counter('prism','prismBalance-prismList'))
  var prismKey = couch.schema.prism()
  var qstring = 'SELECT ' +
    couch.getName(couch.type.stretchfs) + '.* FROM ' +
    couch.getName(couch.type.stretchfs) +
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
 * Check existence of a hash (cached)
 * @param {string} hash
 * @return {P}
 */
exports.contentExists = function(hash){
  couch.counter(cb,couch.schema.counter('prism','prismBalance-contentExists'))
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
