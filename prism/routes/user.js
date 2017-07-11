'use strict';
var P = require('bluebird')
var oose = require('oose-sdk')
var request = require('request-promise')

var logger = require('../../helpers/logger')
var redis = require('../../helpers/redis')()

var config = require('../../config')
var couchLoginUrl =
  config.couchdb.options.secure ? 'https://' : 'http://' +
  config.couchdb.host + ':' +
  config.couchdb.port + '/_session'
var UserError = oose.UserError

//make some promises
P.promisifyAll(request)


/**
 * User Login
 * @param {object} req
 * @param {object} res
 */
exports.login = function(req,res){
  redis.incr(redis.schema.counter('prism','user:login'))
  var sessionToken
  //make a login request to couch db
  if(!req.body.username || !req.body.password){
    res.status(401)
    res.json({error: 'Invalid username or password'})
  } else {
    request({
      url: couchLoginUrl,
      method: 'POST',
      resolveWithFullResponse: true,
      json: true,
      //headers: {
      //  HOST: config.couchdb.host + ':' + config.couchdb.port
      //},
      body: {
        name: req.body.username,
        password: req.body.password
      }
    })
      .then(function(result){
        //i would think we are going to get a 401 for bad logins and then 200
        //for good logins, we will find out
        if(200 !== result.statusCode)
          throw new Error('Invalid login response ' + result.statusCode)
        //need our session token from the session
        if(!result.headers['set-cookie'])
          throw new Error('No cookie sent in response')
        //now i think we need to query the session itself
        sessionToken = result.headers['set-cookie'][0].split(';')[0]
        return request({
          url: couchLoginUrl,
          json: true,
          method: 'GET',
          resolveWithFullResponse: true,
          headers: {
            Cookie: sessionToken
          }
        })
      })
      .then(function(result){
        if(200 !== result.statusCode){
          throw new Error(
            'Failed to query session information ' + result.body.toJSON())
        }
        //establish session?
        var session = {
          success: 'User logged in',
          session: {
            token: sessionToken,
            ip: req.ip,
            data: result.body
          }
        }
        req.session = session
        res.json(session)
      })
      .catch(UserError,function(err){
        redis.incr(redis.schema.counterError('prism','user:login:invalid'))
        res.json({error: err.message})
      })
      .catch(function(err){
        redis.incr(redis.schema.counterError('prism','user:login:invalid'))
        if(!err.message.match('invalid user or password')) throw err
        res.status(500)
        res.json({error: 'Invalid username or password to master'})
      })
      .catch(function(err){
        if(401 === err.statusCode){
          res.status(401)
          res.json({error: 'Invalid username or password'})
        } else {
          res.status(500)
          res.json({error: 'Login failed with an error'})
          logger.log('error', err)
          logger.log('error', err.stack)
        }
      })
  }
}


/**
 * User Logout
 * @param {object} req
 * @param {object} res
 */
exports.logout = function(req,res){
  redis.incr(redis.schema.counter('prism','user:logout'))
  //make a login request to couch db
  request({
    url: couchLoginUrl,
    method: 'DELETE',
    json: true,
    headers: {
      Cookie: req.session.token
    }
  })
    .then(function(body){
      res.json({
        success: 'User logged out',
        data: body
      })
    })
    .catch(function(err){
      redis.incr(redis.schema.counterError('prism','user:logout'))
      res.json({error: err.message})
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
