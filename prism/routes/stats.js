'use strict';
var ObjectManage = require('object-manage')

var redis = require('../../helpers/redis')()


/**
 * Print stats
 * @param {object} req
 * @param {object} res
 */
exports.sendJSON = function(req,res){
  redis.incr(redis.schema.counter('prism','stat'))
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
 * Stats push/reporting endpoint
 * @param {object} req
 * @param {object} res
 */
exports.receiveJSON = function(req,res){
  redis.incr(redis.schema.counter('prism','statsReceive'))
  console.log(req)
  res.send(JSON.stringify({what:'ever'}))
}
