'use strict';
var debug = require('debug')('oose:clearHeartbeat')
var infant = require('infant')

var couch = require('../helpers/couchbase')
var logger = require('../helpers/logger')


/**
 * Run the interval
 * @param {function} done
 */
var runInterval = function(done){
  logger.log('info','Starting to clear heartbeat')
  //first lets get all the purchases
  var hbKey = couch.schema.downVote()
  debug('requesting votes',hbKey)
  var qstring = 'DELETE FROM ' + couch.getName(couch.type.HEARTBEAT,true) +
    ' b WHERE META(b).id LIKE $1'
  var query = couch.N1Query.fromString(qstring)
  hbKey = hbKey + '%'
  var couchHeartbeat = couch.heartbeat()
  couchHeartbeat.queryAsync(query,[hbKey])
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
      logger.log('info','Heartbeat clearing complete')
      process.exit()
    })
}

if(require.main === module){
  infant.child(
    'oose:clearHeartbeat',
    function(done){
      //setup the interval for collection from master
      runInterval(done)
    },
    function(done){
      process.nextTick(done)
    }
  )
}

