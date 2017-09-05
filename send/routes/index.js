'use strict';
var ObjectManage = require('object-manage')

var redis = require('../../helpers/redis')()

var config = require('../../config')


/**
 * Homepage
 * @param {object} req
 * @param {object} res
 */
exports.index = function(req,res){
  redis.incr(redis.schema.counter('send','index'))
  res.json({message: 'Welcome to OOSE version ' + config.version})
}


/**
 * Ping pong for health checks
 * @param {object} req
 * @param {object} res
 */
exports.ping = function(req,res){
  redis.incr(redis.schema.counter('send','ping'))
  res.json({pong: 'pong'})
}


/**
 * Print stats
 * @param {object} req
 * @param {object} res
 */
exports.stats = function(req,res){
  redis.incr(redis.schema.counter('send','stat'))
  redis.getKeysPattern(redis.schema.statKeys())
    .then(function(result){
      var stat = new ObjectManage()
      var keys = Object.keys(result.data)
      for(var i = 0; i < keys.length; i++){
        stat.$set(
          keys[i].replace(/:/g,'.').replace('oose.counter.',''),
          result.data[keys[i]]
        )
      }
      res.send(JSON.stringify(stat.$strip(),null,'  '))
    })
}


/**
 * Content routes
 * @type {object}
 */
exports.content = require('./content')
