'use strict';
var debug = require('debug')('oose:clearPurchases')
var infant = require('infant')

var couch = require('../../helpers/couchbase')
var logger = require('../../helpers/logger')


/**
 * Run the interval
 * @param {function} done
 */
var runInterval = function(done){
  logger.log('info','Starting to clear purchases')
  //first lets get all the purchases
  var purchaseKey = couch.schema.purchase()
  debug('requesting purchases',purchaseKey)
  var qstring = 'DELETE FROM ' + couch.getName(couch.type.PURCHASE,true) +
    ' b WHERE META(b).id LIKE $1'
  var query = couch.N1Query.fromString(qstring)
  purchaseKey = purchaseKey + '%'
  var couchPurchase = couch.purchase()
  couchPurchase.queryAsync(query,[purchaseKey])
    .then(function(result){
      var deleted = result.length
      logger.log('info','Deletion complete, ' + deleted + ' records removed')
      done()
    })
    .catch(function(err){
      console.log(err)
      logger.log('error',err.stack)
      done(err)
    })
    .finally(function(){
      couch.disconnect()
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

