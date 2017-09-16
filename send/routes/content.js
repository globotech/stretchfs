'use strict';
var P = require('bluebird')
var debug = require('debug')('oose:send:content')
var fs = require('graceful-fs')
var path = require('path')

var couchdb = require('../../helpers/couchbase')
var redis = require('../../helpers/redis')()
var logger = require('../../helpers/logger')
var purchasedb = require('../../helpers/purchasedb')

var config = require('../../config')

var rootFolder = path.resolve(config.root)
var contentFolder = path.resolve(rootFolder + '/content')

//make some promises
P.promisifyAll(fs)


/**
 * Send static files
 * @param {object} req
 * @param {object} res
 */
exports.static = function(req,res){
  //to send static files we have to locate our inventory record
  //then we must send it, that simple dont overthink it
  var hash = req.params.hash
  debug('STATIC','got file static request',hash)
  var inventoryKey = couchdb.schema.inventory(
    hash,
    config.send.prism,
    config.send.store
  )
  debug('STATIC','checking for inventory',inventoryKey)
  couchdb.inventory.getAsync(inventoryKey)
    .then(function(result){
      debug('STATIC','got file inventory, sending content',result)
      if(req.query.attach){
        res.header(
          'Content-Disposition',
          'attachment; filename=' + req.query.attach
        )
      }
      res.sendFile(path.join(contentFolder,result.relativePath))
    })
    .catch(function(err){
      if(404 !== err.statusCode) throw err
      res.status(404)
      res.send('404 Not Found')
    })
}


/**
 * Play files with purchases
 * @param {object} req
 * @param {object} res
 */
exports.play = function(req,res){
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
            .then(
              //continue with purchase
              function(result){
                debug('PLAY','got purchase result',token,result)
                purchase = result
                //get inventory
                return couchdb.inventory.getAsync(couchdb.schema.inventory(
                  purchase.hash,
                  config.send.prism,
                  config.send.store
                ))
              },
              //purchase not found
              function(err){
                debug('PLAY','no purchase found',token,err.message)
                if(404 !== err.statusCode) throw err
                return false
              }
            )
            .then(function(result){
              debug('PLAY','got inventory result',token,result)
              inventory = result
              if(inventory && purchase &&
                purchase.expirationDate >= (+new Date())
              ){
                purchaseUri = path.join(contentFolder,inventory.relativePath)
              } else{
                purchaseUri = '/404'
              }
              debug('PLAY','figured purchase URI',token,purchaseUri)
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
        logger.log('error', err)
        logger.log('error', err.stack)
        return '/500'
      })
  }
  var token = req.params.token
  debug('PLAY','got play request',token)
  purchaseCacheCheck(token)
    .then(function(result){
      debug('PLAY','got play result',result)
      if('/404' === result){
        res.status(404)
        res.send('404 Not Found')
      }
      else if('/403' === result){
        res.status(403)
        res.send('403 Forbidden')
      } else if('/500' === result){
        res.status(500)
        res.send('500 Internal Server Error')
      } else{
        if(req.query.attach){
          res.header(
            'Content-Disposition',
            'attachment; filename=' + req.query.attach
          )
        }
        res.sendFile(result)
      }
    })
}
