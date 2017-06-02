'use strict';
var debug = require('debug')('oose:clearHeartbeat')
var infant = require('infant')

//var config = require('../config')
var cradle = require('../helpers/couchdb')


/**
 * Run the interval
 * @param {function} done
 */
var runInterval = function(done){
  console.log('Starting to clear heartbeat')
  //first lets get all the purchases
  var hbKey = cradle.schema.downVote()
  var votes = []
  debug('requesting votes',hbKey)
  cradle.heartbeat.allAsync({
    startkey: hbKey,
    endkey: hbKey + '\uffff'
  })
    .then(function(result){
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
      //now we just use cradle to save the purchases
      return cradle.heartbeat.saveAsync(votes)
    })
    .then(function(result){
      var deleted = 0
      result.forEach(function(row){
        if(row.ok) deleted++
      })
      console.log('Deletion complete, ' + deleted + ' records removed')
      done()
    })
    .catch(function(err){
      console.log(err.stack)
      done(err)
    })
    .finally(function(){
      console.log('Heartbeat clearing complete')
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

