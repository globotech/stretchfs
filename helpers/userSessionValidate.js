'use strict';
var P = require('bluebird')
var basicAuth = require('basic-auth-connect')
var debug = require('debug')('oose:userSessionValidate')
var request = require('request-promise')

var purchasedb = require('../helpers/purchasedb')
var redis = require('../helpers/redis')()

var config = require('../config')

var auth = basicAuth(config.prism.username,config.prism.password)

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
  var session
  debug('got token',token)
  //without a token lets try basic auth since it can override
  if(!token){
    redis.incr(redis.schema.counter('prism','userSessionValidate:basic'))
    auth(req,res,next)
  } else {
    redis.incr(redis.schema.counter('prism','userSessionValidate:full'))
    session = {
      token: purchasedb.generate(),
      ip: req.ip,
      data: ''
    }
    redis.incr(redis.schema.counter('prism','userSession:' + session.token))
    req.session = session
    next()
  }
}
