'use strict';
var couch = require('../../helpers/couchbase')

var config = require('../../config')

//open some buckets
var cb = couch.stretchfs()


/**
 * Homepage
 * @param {object} req
 * @param {object} res
 */
exports.index = function(req,res){
  couch.counter(cb,couch.schema.counter('prism','index'))
  res.json({message: 'Welcome to StretchFS version ' + config.version})
}


/**
 * Ping pong for health checks
 * @param {object} req
 * @param {object} res
 */
exports.ping = function(req,res){
  res.json({pong: 'pong'})
}


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
