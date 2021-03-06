'use strict';
var P = require('bluebird')
var debug = require('debug')('stretchfs:purchase')
var moment = require('moment')
var Password = require('node-password').Password

var couch = require('./couchbase')

var config = require('../config')

//open some buckets
var cb = couch.stretchfs()


var Purchase = function(){
  //construct purchase
}


/**
 * Get purchase by token, will also be used for exists
 * @param {string} token
 * @return {promise}
 */
Purchase.prototype.get = function(token){
  //get token
  var purchaseKey = couch.schema.purchase(token)
  return P.try(function(){
    debug(purchaseKey,'get')
    return cb.getAsync(purchaseKey)
  })
    .then(function(result){
      result = result.value
      debug(purchaseKey,'get result',result)
      return result
    })
}


/**
 * Check if purchase token exists
 * @param {string} token
 * @return {promise}
 */
Purchase.prototype.exists = function(token){
  debug(token,'exists')
  return this.get(token)
    .then(function(result){
      debug(token,'exists result',result)
      return (result)
    })
    .catch(function(err){
      debug(token,'exists error',err)
      return false
    })
}


/**
 * Create purchase with information
 * @param {string} token
 * @param {object} params
 * @param {integer} life
 * @return {promise}
 */
Purchase.prototype.create = function(token,params,life){
  //create purchase
  var purchaseKey = couch.schema.purchase(token)
  debug(token,'create')
  if(!life) life = parseInt(config.purchase.life)
  return P.try(function(){
    params.life = life
    params.afterLife = parseInt(config.purchase.afterLife)
    params.expirationDate = (+new Date()) + life
    params.createdAt = new Date().toJSON()
    return cb.upsertAsync(purchaseKey,params,{
      expiry: life + parseInt(config.purchase.afterLife)
    })
  })
    .then(function(result){
      debug(token,'create result',result)
      return result
    })
}


/**
 * Update purchase with information
 * @param {string} token
 * @param {object} params
 * @return {promise}
 */
Purchase.prototype.update = function(token,params){
  //update purchase
  var that = this
  var purchaseKey = couch.schema.purchase(token)
  debug(token,'update')
  return P.try(function(){
    return that.get(token)
  })
    .then(function(result){
      if(result){
        debug(token,'update result received, udpating',result,params)
        params.updatedAt = new Date().toJSON()
        return cb.upsertAsync(purchaseKey,params,{cas: result.cas})
      } else{
        debug(token,'doesnt exist, creating',result,params)
        that.create(token,params)
      }
    })
}


/**
 * Remove purchase
 * @param {string} token
 * @return {promise}
 */
Purchase.prototype.remove = function(token){
  //remove purchase
  debug(token,'remove')
  var purchaseKey = couch.schema.purchase(token)
  return cb.removeAsync(purchaseKey)
}


/**
 * Generate a new Purchase token
 * @param {string} zone
 * @return {string}
 */
Purchase.prototype.generate = function(zone){
  //the new purchase tokens are not going to be random and they are going to be
  //shorter this will save space storing keys and make look ups faster
  //they will also contain information about sharding the purchase into various
  //couch servers and databases to improve truncating and cleanup due to couch
  //limitations in the blockchain like key structure
  //the key will form like this
  // <zone 1 char a-z0-9><date in YYYYmmdd><random string 11 chars a-z0-9>
  //this will result in a 20 char string
  //the zone sharding will work by using a map in the configuration file that
  //will map zone identifiers with couch configurations, if no configuration
  //exists for a particular zone it will fall through to the default couch
  //configuration
  //databases will be named using stretchfs-purchase-<zone><date>
  //example purchase token
  // a20161110a7ch2nx9djn
  //example database name
  // stretchfs-purchase-a20161110
  //now for token generation, this will involve first finding out what zone our
  //particular prism is on, that will popular the first char, then we will
  //find the date and finally generate the salt
  if(!zone)
    zone = config.prism.purchaseZone || 'a'
  var date = moment().format('YYYYMMDD')
  var salt = new Password({length: 11, special: false}).toString()
  var token = zone.slice(0,1) + date.slice(0,8) + salt.slice(0,11)
  debug('generated token',token)
  return token
}


/**
 * Export a singleton
 * @type {Purchase}
 */
module.exports = new Purchase()
