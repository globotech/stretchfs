'use strict';
var couch = require('../../helpers/couchbase')
var purchasedb = require('../../helpers/purchase')
var logger = require('../../helpers/logger')

var config = require('../../config')

//open couch buckets
var cb = couch.stretchfs()


/**
 * Map a purchase token to a usable URI
 * @param {object} req
 * @param {object} res
 */
exports.uri = function(req,res){
  var purchaseValidate = function(token){
    var purchaseUri = ''
    var purchase = {}
    var inventory = {}
    return purchasedb.get(token)
      .then(function(result){
        purchase = result
        //get inventory
        return cb.getAsync(couch.schema.inventory(
          purchase.hash,
          config.store.name
        ))
      })
      .then(function(result){
        inventory = result.value
        if(inventory && purchase &&
          purchase.expirationDate >= (+new Date())
        ){
          purchaseUri = '/../content/' + inventory.relativePath
        } else{
          purchaseUri = '/404'
        }
        return purchaseUri
      })
      .catch(function(err){
        logger.log('error', err)
        logger.log('error', err.stack)
        return '/500'
      })
  }
  var token = req.params.token
  purchaseValidate(token)
    .then(function(result){
      if('/404' === result) res.status(404)
      if('/403' === result) res.status(403)
      if('/500' === result) res.status(500)
      res.send(result)
    })
}
