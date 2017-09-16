'use strict';
var debug = require('debug')('oose:clearHeartbeat')
var infant = require('infant')

//var config = require('../config')
var couchdb = require('../helpers/couchbase')
var logger = require('../helpers/logger')


/**
 * Run the interval
 * @param {function} done
 */
var runInterval = function(done){
  logger.log('info','Starting to clear heartbeat')
  //first lets get all the purchases
  var hbKey = couchdb.schema.downVote()
  var votes = []
  debug('requesting votes',hbKey)
  couchdb.heartbeat.listAsync({
    startkey: hbKey,
    endkey: hbKey + '\uffff',
    include_docs: true
  })
    .then(function(result){
      result = result.rows
      debug('vote result; votes: ',result.length)
      //this gives us the purchase keys and to my understanding we just have
      //to update these to deleted now
      var vote = {}
      for(var i = 0; i < result.length; i++){
        vote = result[i]
        votes.push({
          _id: vote.id,
          _rev: vote.value.rev,
          _deleted: true
        })
      }
      debug('saving deletion of vote',votes.length,votes[0])
      //now we just use couchdb to save the purchases
      return votes
    })
    .each(function(vote){
      return couchdb.heartbeat.upsertAsync(vote._id,vote)
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

