'use strict';
var P = require('bluebird')
var debug = require('debug')('oose:purchasedb')
var moment = require('moment')
var oose = require('oose-sdk')
var Password = require('node-password').Password

var UserError = oose.UserError

var couchbase = require('./couchbase')

var config = require('../config')


/**
 * Wrap couch calls to enumerate
 * @param {string} token
 * @return {object}
 */
var couchWrap = function(token){
  //here need to enumerate couch servers and choose the right connection
  //using the token to set the proper zone and database then returning the
  //configured couch object that can be used to work with the purchases as
  //if they were local
  //so first things first lets see if we have a connection to this zoned server
  if(!token.match(/^[a-z]{1}[0-9]{8}/))
    return null
  var now = new Date()
  var year = +token.slice(1,5)
  if(year !== now.getFullYear() && year !== (now.getFullYear() -1))
    return null
  return couchbase.purchase
}


var PurchaseDb = function(){
  //construct purchase db, couch is connectionless so not much to do here
}


/**
 * Get purchase by token, will also be used for exists
 * @param {string} token
 * @return {promise}
 */
PurchaseDb.prototype.get = function(token){
  //get token
  var couch
  return P.try(function(){
    debug(token,'get')
    couch = couchWrap(token)
    debug(token,'couch wrapped')
    if(!couch) throw new UserError('Could not validate purchase token')
    return couch.getAsync(token)
  })
    .then(function(result){
      debug(token,'get result',result)
      return result
    })
}


/**
 * Check if purchase token exists
 * @param {string} token
 * @return {promise}
 */
PurchaseDb.prototype.exists = function(token){
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
 * @return {promise}
 */
PurchaseDb.prototype.create = function(token,params){
  //create purchase
  var couch
  debug(token,'create')
  return P.try(function(){
    couch = couchWrap(token)
    if(!couch) throw new UserError('Could not validate purchase token')
    debug(token,'couch wrapped')
    return couch.upsertAsync(token,params)
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
PurchaseDb.prototype.update = function(token,params){
  //update purchase
  var that = this
  var couch
  debug(token,'update')
  return P.try(function(){
    couch = couchWrap(token)
    if(!couch) throw new UserError('Could not validate purchase token')
    debug(token,'couch wrapped getting')
    return that.get(token)
  })
    .then(function(result){
      if(result){
        debug(token,'update result received, udpating',result,params)
        return couch.upsertAsync(token,params)
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
PurchaseDb.prototype.remove = function(token){
  //remove purchase
  debug(token,'remove')
  return this.get(token)
    .then(function(result){
      debug(token,'remove result',result)
      if(result){
        debug(token,'remove exists, removing')
        return couchWrap(token).removeAsync(token)
      } else {
        debug(token,'remove doesnt exist do nothing')
        //otherwise it doesn't exist... cool
      }
    })
}


/**
 * Generate a new Purchase token
 * @param {string} zone
 * @return {string}
 */
PurchaseDb.prototype.generate = function(zone){
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
  //databases will be named using oose-purchase-<zone><date>
  //example purchase token
  // a20161110a7ch2nx9djn
  //example database name
  // oose-purchase-a20161110
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
 * @type {PurchaseDb}
 */
module.exports = new PurchaseDb()
