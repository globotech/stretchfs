'use strict';
var P = require('bluebird')
var request = require('request-promise')

var purchasedb = require('../../helpers/purchasedb')
var redis = require('../../helpers/redis')()


//make some promises
P.promisifyAll(request)


/**
 * User Login
 * @param {object} req
 * @param {object} res
 */
exports.login = function(req,res){
  redis.incr(redis.schema.counter('prism','user:login'))
  //make a login request to couch db
  if(!req.body.username || !req.body.password){
    res.status(401)
    res.json({error: 'Invalid username or password'})
  } else {
    //establish session?
    var session = {
      success: 'User logged in',
      session: {
        token: purchasedb.generate(),
        ip: req.ip,
        data: ''
      }
    }
    req.session = session
    res.json(session)
  }
}


/**
 * User Logout
 * @param {object} req
 * @param {object} res
 */
exports.logout = function(req,res){
  redis.incr(redis.schema.counter('prism','user:logout'))
  res.json({
    success: 'User logged out',
    data: ''
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
