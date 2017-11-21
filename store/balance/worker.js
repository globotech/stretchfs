'use strict';
//var P = require('bluebird')
var debug = require('debug')('stretchfs:balance:worker')
var child = require('infant').child

var couch = require('../../helpers/couchbase')

var config = require('../../config')

var runInterval

//open some buckets
//var couchInventory = couch.inventory()
//var couchStretch = couch.stretchfs()

//number of concurrent jobs
var allowedJobCount = config.inventory.balance.concurrency || 1

//active job holder
var activeJobs = []


/**
 * Count active jobs and return
 * @return {number}
 */
var countActiveJobs = function(){
  var count = 0
  activeJobs.forEach(function(row){
    if('error' !== row.status && 'cleanup' !== row.status){
      count++
    }
  })
  return count
}

/**
 * Find jobs that are ready to be started
 * @return {P}
 */
var findJobsToStart = function(){

}


/**
 * Start a job and return the active job record
 * @param {object} row
 * @return {object}
 */
var startJob = function(row){

}


/**
 * Iterate the list of active jobs and remove jobs marked for cleanup or error
 * @return {P}
 */
var cleanupActiveJobs = function(){

}


/**
 * Balance worker run
 * @return {P}
 */
var workerRun= function(){
  debug('starting balance worker run')
  return
  var activeJobCount = countActiveJobs()
  return findJobsToStart(allowedJobCount - activeJobCount)
    .each(function(row){
      activeJobs.push(startJob(row))
    })
    .then(function(){
      return cleanupActiveJobs()
    })
    .then(function(){
      debug('balance worker run complete')
    })
}


/**
 * Start main
 * @param {function} done
 */
exports.start = function(done){
  debug('starting balance worker')
  runInterval = setInterval(workerRun,config.inventory.balance.workerFrequency)
  process.nextTick(done)
}


/**
 * Stop main
 * @param {function} done
 */
exports.stop = function(done){
  clearInterval(runInterval)
  couch.disconnect()
  process.nextTick(done)
}

if(require.main === module){
  child(
    'stretchfs:balance:worker',
    function(done){
      exports.start(done)
    },
    function(done){
      exports.stop(done)
    }
  )
}
