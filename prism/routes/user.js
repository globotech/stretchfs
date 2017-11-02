'use strict';
var bcrypt = require('bcrypt')
var P = require('bluebird')
var Password = require('node-password').Password
var request = require('request-promise')

var couch = require('../../helpers/couchbase')
var redis = require('../../helpers/redis')()

//open couch buckets
var couchOOSE = couch.oose()


//make some promises
P.promisifyAll(bcrypt)
P.promisifyAll(request)


/**
 * User Login
 * @param {object} req
 * @param {object} res
 * @return {*}
 */
exports.login = function(req,res){
  redis.incr(redis.schema.counter('prism','user:login'))
  var tokenType = req.body.tokenType || 'permanent'
  var user = {}
  var session = {}
  var token = null
  var expiry = 0
  var userKey = couch.schema.ooseUser(req.body.name)
  var tokenKey = ''
  P.try(function(){
    //make a login request to couch db
    if(!req.body.name || !req.body.secret){
      throw new Error('Invalid name or secret')
    }
    //validate token type
    if('temporary' !== tokenType && 'permanent' !== tokenType){
      throw new Error('Invalid token type request')
    }
    return couchOOSE.getAsync(userKey)
  })
    .then(function(result){
      user = result
      return bcrypt.compareAsync(req.body.secret,user.value.secret)
    })
    .then(function(match){
      if(!match){
        user.value.failedLoginCount = user.value.failedLoginCount + 1
        user.value.lastFailedLogin = new Date().toJSON()
        return couchOOSE.upsertAsync(userKey,user.value,{cas: user.cas})
          .then(function(){
            throw new Error('Invalid name or secret')
          })
      }
      user.value.lastLogin = new Date().toJSON()
      user.value.loginCount = user.value.loginCount + 1
      return couchOOSE.upsertAsync(userKey,user.value,{cas: user.cas})
    })
    .then(function(){
      //generate session token
      token = new Password({length: 16,special: false}).toString()
      tokenKey = couch.schema.ooseToken(token)
      if('temporary' === tokenType){
        //set the token to live for 24 hours
        expiry = 86400
      }
      session = {
        token: token,
        tokenType: tokenType,
        expiry: expiry,
        ip: req.ip,
        name: req.body.name,
        roles: user.roles,
        data: {}
      }
      //send the session to couchbase
      return couchOOSE.upsertAsync(tokenKey,session,{expiry: expiry})
    })
    .then(function(){
      //return the session to the user
      res.json({
        status: 'ok',
        message: 'Login successful',
        success: 'User logged in',
        session: session
      })
    })
    .catch(function(err){
      res.status(500)
      res.json({
        status: 'error',
        error: err.message,
        err: err,
        message: 'Login failed: ' + err.message
      })
    })
}


/**
 * User Logout
 * @param {object} req
 * @param {object} res
 */
exports.logout = function(req,res){
  redis.incr(redis.schema.counter('prism','user:logout'))
  var tokenKey = couch.schema.ooseToken(req.session.token)
  couchOOSE.removeAsync(tokenKey)
    .then(function(){
      res.json({
        success: 'User logged out',
        data: ''
      })
    })
}


/**
 * Session validate
 * @param {object} req
 * @param {object} res
 */
exports.sessionValidate = function(req,res){
  redis.incr(redis.schema.counter('prism','user:sessionValidate'))
  //the middleware will have already validated us
  res.json({
    success: 'Session valid',
    session: req.session
  })
}
