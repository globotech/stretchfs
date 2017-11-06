'use strict';
var redis = require('../../helpers/redis')()

var config = require('../../config')


/**
 * Homepage
 * @param {object} req
 * @param {object} res
 */
exports.index = function(req,res){
  redis.incr(redis.schema.counter('prism','index'))
  res.json({message: 'Welcome to StretchFS version ' + config.version})
}


/**
 * Ping pong for health checks
 * @param {object} req
 * @param {object} res
 */
exports.ping = function(req,res){
  redis.incr(redis.schema.counter('prism','ping'))
  res.json({pong: 'pong'})
}


/**
 * Stats routes
 * @type {object}
 */
exports.stats = require('./stats')


/**
 * Cache routes
 * @type {object}
 */
exports.cache = require('./cache')


/**
 * Content routes
 * @type {object}
 */
exports.content = require('./content')


/**
 * User routes
 * @type {object}
 */
exports.user = require('./user')


/**
 * Job routes
 * @type {object}
 */
exports.job = require('./job')
