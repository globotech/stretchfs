'use strict';
var cradle = require('../../helpers/couchdb')
var purchasedb = require('../../helpers/purchasedb')
var redis = require('../../helpers/redis.js')()

var config = require('../../config')


/**
 * Map a purchase token to a usable URI
 * @param {object} req
 * @param {object} res
 */
exports.uri = function(req,res){
  var purchaseCacheCheck = function(token){
    var purchaseUri = ''
    var redisKey = redis.schema.purchaseCacheInternal(token)
    return redis.getAsync(redisKey)
      .then(function(result){
        if(!result){
          //build cache
          var purchase = {}
          var inventory = {}
          return purchasedb.get(token)
            .then(function(result){
              purchase = result
              //get inventory
              return cradle.inventory.getAsync(cradle.schema.inventory(
                purchase.hash,
                config.store.prism,
                config.store.name
              ))
            })
            .then(function(result){
              inventory = result
              if(inventory && purchase &&
                purchase.expirationDate >= (+new Date())
              ){
                purchaseUri = '/../content/' + inventory.relativePath
              } else{
                purchaseUri = '/404'
              }
              return redis.setAsync(redisKey,purchaseUri)
            })
            .then(function(){
              return redis.expireAsync(redisKey,900)
            })
            .then(function(){
              return purchaseUri
            })
        } else {
          return result
        }
      })
      .catch(function(err){
        console.log(err,err.stack)
        return '/500'
      })
  }
  var token = req.params.token
  purchaseCacheCheck(token)
    .then(function(result){
      if('/404' === result) res.status(404)
      if('/403' === result) res.status(403)
      if('/500' === result) res.status(500)
      res.send(result)
    })
}
