'use strict';
var debug = require('debug')('oose:clearPurchases')
var infant = require('infant')

//var config = require('../config')
var couchdb = require('../helpers/couchdb')
var logger = require('../helpers/logger')


/**
 * Run the interval
 * @param {function} done
 */
var runInterval = function(done){
  logger.log('info','Starting to clear purchases')
  //first lets get all the purchases
  var purchaseKey = couchdb.schema.purchase()
  var purchases = []
  debug('requesting purchases',purchaseKey)
  couchdb.purchase.allAsync({
    startkey: purchaseKey,
    endkey: purchaseKey + '\uffff'
  })
    .then(function(result){
      debug('purchase result; purchases: ',result.length)
      //this gives us the purchase keys and to my understanding we just have
      //to update these to deleted now
      var purchase = {}
      for(var i = 0; i < result.length; i++){
        purchase = result[i]
        purchases.push({
          _id: purchase.id,
          _rev: purchase.value.rev,
          _deleted: true
        })
      }
      debug('saving deletion of purchases',purchases.length,purchases[0])
      //now we just use couchdb to save the purchases
      return couchdb.purchase.insertAsync(purchases)
    })
    .then(function(result){
      var deleted = 0
      result.forEach(function(row){
        if(row.ok) deleted++
      })
      logger.log('info','Deletion complete, ' + deleted + ' records removed')
      done()
    })
    .catch(function(err){
      logger.log('error',err.stack)
      done(err)
    })
    .finally(function(){
      logger.log('info','Purchase clearing complete')
      process.exit()
    })
}

if(require.main === module){
  infant.child(
    'oose:clearPurchases',
    function(done){
      //setup the interval for collection from master
      runInterval(done)
    },
    function(done){
      process.nextTick(done)
    }
  )
}

