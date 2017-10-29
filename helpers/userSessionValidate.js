'use strict';
var P = require('bluebird')
var basicAuth = require('basic-auth-connect')
var debug = require('debug')('oose:userSessionValidate')
var request = require('request-promise')

var couch = require('../helpers/couchbase')
var redis = require('../helpers/redis')()

var config = require('../config')

var auth = basicAuth(config.prism.username,config.prism.password)

//open couch buckets
var couchOOSE = couch.oose()

//make some promises
P.promisifyAll(request)


/**
 * Validate User Session Middleware
 * @param {object} req
 * @param {object} res
 * @param {function} next
 * @return {*}
 */
module.exports = function(req,res,next){
  var token = req.get(config.api.sessionTokenName) || ''
  debug('got token',token)
  //setup the token key
  var tokenKey = couch.schema.ooseToken(token)
  debug('got token key',tokenKey)
  var session = {}
  //without a token lets try basic auth since it can override
  if(!token){
    redis.incr(redis.schema.counter('prism','userSessionValidate:basic'))
    auth(req,res,next)
  } else {
    redis.incr(redis.schema.counter('prism','userSessionValidate:full'))
    couchOOSE.getAsync(tokenKey)
      .then(function(result){
        session = result.value
        redis.incr(redis.schema.counter('prism','userSession:' + session.token))
        req.session = session
        next()
      })
      .catch(function(err){
        res.status(500)
        res.json({message: 'Session validate error', error: err})
      })
  }
}
