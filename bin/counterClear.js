'use strict';
var infant = require('infant')

var couch = require('../helpers/couchbase')
var logger = require('../helpers/logger')

//open some buckets
var cb = couch.stretchfs()


/**
 * Run the interval
 * @param {function} done
 */
var runInterval = function(done){
  logger.log('info','Starting to clear counters')
  couch.clearCounters(cb)
    .then(function(){
      logger.log('info','Counters cleared')
      done()
    })
    .catch(function(err){
      console.log(err)
      logger.log('error',err.stack)
      done(err)
    })
    .finally(function(){
      couch.disconnect()
      logger.log('info','Counter clearing complete')
      process.exit()
    })
}

if(require.main === module){
  infant.child(
    'stretchfs:clearCounters',
    function(done){
      //setup the interval for collection from master
      runInterval(done)
    },
    function(done){
      process.nextTick(done)
    }
  )
}
