'use strict';
var couch = require('./couchbase')

var config = require('../config')

//open some buckets
var cb = couch.stretchfs()


/**
 * Update or create slot and then return it
 * @param {string} slotKey
 * @param {object} req
 * @param {string} hash
 * @return {P}
 */
exports.upsertAndGet = function(slotKey,req,hash){
  var host = req.ip
  var port = req.connection.remotePort
  var agent = req.headers['user-agent'] || 'phantom'
  return cb.getAsync(slotKey)
    .catch(function(err){
      if(13 !== err.code) throw err
      var expireSeconds = config.store.slotExpiration || 14400
      var slotParams = {
        hash: hash,
        host: host,
        port: port,
        agent: agent,
        hitCount: 0,
        byteCount: 0,
        hits: {},
        bytes: {},
        lastBucketClearAt: new Date().toJSON(),
        expiresAt: new Date(
          (+new Date() + (expireSeconds * 1000))
        ).toJSON()
      }
      return cb.upsertAsync(slotKey,slotParams,{expiry: expireSeconds})
        .then(function(){
          return cb.getAsync(slotKey)
        })
    })
}
