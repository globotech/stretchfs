'use strict';
var P = require('bluebird')
var debug = require('debug')('oose:staff')
var moment = require('moment')
var oose = require('oose-sdk')
var Password = require('node-password').Password

var UserError = oose.UserError

var couchbase = require('./couchbase')

var config = require('../config')

var cbClient = couchbase.staff()

var Staff = function(){
  //construct staff db, couch is connectionless so not much to do here
}


/**
 * Get staff by name, will also be used for exists
 * @param {string} name
 * @return {promise}
 */
Staff.prototype.get = function(name){
  //get token
  return P.try(function(){
    debug(name,'get')
    return cbClient.getAsync(name)
  })
    .then(function(result){
      result = result.value
      debug(name,'get result',result)
      return result
    })
}


/**
 * Check if staff record exists
 * @param {string} name
 * @return {promise}
 */
Staff.prototype.exists = function(name){
  debug(name,'exists')
  return this.get(name)
    .then(function(result){
      debug(name,'exists result',result)
      return (result)
    })
    .catch(function(err){
      debug(name,'exists error',err)
      return false
    })
}


/**
 * Create staff with information
 * @param {string} name
 * @param {object} params
 * @return {promise}
 */
Staff.prototype.create = function(name,params){
  //create staff
  debug(name,'create')
  return P.try(function(){
    return cbClient.upsertAsync(name,params)
  })
    .then(function(result){
      debug(name,'create result',result)
      return result
    })
}


/**
 * Update staff with information
 * @param {string} name
 * @param {object} params
 * @return {promise}
 */
Staff.prototype.update = function(name,params){
  //update staff
  var that = this
  debug(name,'update')
  return P.try(function(){
    return that.get(name)
  })
    .then(function(result){
      if(result){
        debug(name,'update result received, updating',result,params)
        return cbClient.upsertAsync(name,params)
      } else{
        debug(name,'doesnt exist, creating',result,params)
        that.create(name,params)
      }
    })
}


/**
 * Remove staff
 * @param {string} name
 * @return {promise}
 */
Staff.prototype.remove = function(name){
  //remove staff
  debug(name,'remove')
  return this.get(name)
    .then(function(result){
      debug(name,'remove result',result)
      if(result){
        debug(name,'remove exists, removing')
        return cbClient.removeAsync(name)
      } else {
        debug(name,'remove doesnt exist do nothing')
        //otherwise it doesn't exist... cool
      }
    })
}


/**
 * Check plaintext against pwhash
 * @param {string} email
 * @param {string} plainPassword
 * @return {string}
 */
Staff.prototype.login = function(email,plainPassword){
  debug('login password check',email)
  return true
}


/**
 * Generate a new Purchase token
 * @param {string} zone
 * @return {string}
 */
Staff.prototype.generate = function(zone){
  debug('generated token',token)
  return token
}


/**
 * Export a singleton
 * @type {Staff}
 */
module.exports = new Staff()
