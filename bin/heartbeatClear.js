'use strict';
var debug = require('debug')('stretchfs:clearHeartbeat')
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
  var clause = {}
  clause.from = ' FROM ' + couch.getName(couch.type.STRETCHFS,true)
  clause.where = ' WHERE META().id LIKE $1'
  var query = couch.N1Query.fromString('DELETE' + clause.from + clause.where)
  hbKey = hbKey + '%'
  var cb = couch.stretchfs()
  cb.queryAsync(query,[hbKey])
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
    'stretchfs:clearHeartbeat',
    function(done){
      //setup the interval for collection from master
      runInterval(done)
    },
    function(done){
      process.nextTick(done)
    }
  )
}
