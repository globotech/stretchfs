'use strict';
var P = require('bluebird')
var debug = require('debug')('shredder:worker:dispatch')
var fs = require('fs')
var shredder = require('shredder-sdk')

var MaxConcurrencyError = shredder.MaxConcurrencyError

var job = require('./helpers/job')
var request = require('request')
var config = require('../config')
var intervalID
var UserError = shredder.UserError
var nano = require('../helpers/couchdb')
var handler = require('./handler')


request = P.promisify(request)


/**
 * Here we abort a job that is running
 * @param {Object} jobInstance
 * @return {P}
 */
var handleCallback = function(jobInstance){
  console.log('handleCallback',jobInstance)
  if(
    !jobInstance.description ||
    !jobInstance.description.callback ||
    !jobInstance.description.callback.request
  )
    return true
  var req = jobInstance.description.callback.request
  req.json = jobInstance
  return P.try(function(){
    return P.all([request(req).catch(function(){})])
  })
}


/**
 * Here we abort a job that is running
 * @param {Object} jobInstance
 * @return {P}
 */
var dispatchJobAbort = function(jobInstance){
  return handler.abort(jobInstance)
    .then(function(){
      jobInstance.status = 'processing_abort'
      jobInstance.statusDescription =
        'Processing the abort operation on the worker'
      return job.save(jobInstance)
    }).then(function(savedJob){
      return handleCallback(savedJob)
    })
}


/**
 * Here we retry a job
 * @param {Object} jobInstance
 * @return {P}
 */
var dispatchJobRetry = function(jobInstance){
  return handler.retry(jobInstance)
    .then(function(){
      jobInstance.status = 'retry'
      jobInstance.statusDescription =
        'Processing the retry operation on the worker'
      return job.save(jobInstance)
    }).then(function(savedJob){
      return handleCallback(savedJob)
    })
}


/**
 * Here we remove a job
 * @param {Object} jobInstance
 * @return {P}
 */
var dispatchJobRemove = function(jobInstance){
  return handler.remove(jobInstance)
  .then(function(removing){
    debug('Job removed')
    //This one is gone, so just delete the data registry
    if(!removing)
      return nano.shredder.destroyAsync(jobInstance._id, jobInstance._rev)
    return null
  })
}


/**
 * Here we want to actually dispatch a job to a worker and start it
 * @param {Object} jobInstance
 * @return {P}
 */
var dispatchJob = function(jobInstance){
  debug(jobInstance.handle,'Handler create called')
  return handler.create(jobInstance,'queued','Starting job')
    .then(function(){
      debug(jobInstance.handle,'Job created')
      return handler.start(jobInstance)
    })
    .then(function(){
      debug(jobInstance.handle,'Job started')
    })
    .catch(UserError,function(err){
      jobInstance.status = 'error'
      jobInstance.statusDescription = 'Failed to dispatch job: ' + err.message
      return job.save(jobInstance).then(function(savedJob){
        return handleCallback(savedJob)
      })
    })
    .catch(SyntaxError,function(err){
      jobInstance.status = 'error'
      jobInstance.statusDescription =
        'Failed to parse job description: ' + err.message
      return job.save(jobInstance).then(function(savedJob){
        return handleCallback(savedJob)
      })
    })
}


/**
 * Here a worker reports an aborted job
 * @param {string} handle
 * @return {P}
 */
exports.workerAbort = function(handle){
  return job.getByHandle(handle).then(function(jobInstance){
    if(!jobInstance)return
    jobInstance.status = 'aborted'
    jobInstance.worker = null
    jobInstance.statusDescription = 'Worker has aborted the job'
    return job.save(jobInstance)
  }).then(function(savedJob){
    return handleCallback(savedJob)
  })
}


/**
 * Here a worker reports an error in a job
 * @param {string} handle
 * @param {string} error
 * @return {P}
 */
exports.workerError = function(handle, error){
  return job.getByHandle(handle).then(function(jobInstance){
    if(!jobInstance)return
    jobInstance.status = 'error'
    jobInstance.worker = null
    jobInstance.statusDescription = error
    return job.save(jobInstance)
  }).then(function(savedJob){
    return handleCallback(savedJob)
  })
}


/**
 * Here a worker reports a completed job
 * @param {string} handle
 * @return {P}
 */
exports.workerComplete = function(handle){
  return job.getByHandle(handle)
    .then(function(nJob){
      if(!nJob)return
      nJob.completedAt = +(new Date())
      nJob.status = 'complete'
      nJob.statusDescription = 'The job has been completed'
      return job.save(nJob)
    })
    .then(function(nJob){
      return handleCallback(nJob)
    })
    .then(function(){
      return job.getByHandle(handle)
    })
    .then(function(nJob){
      nJob.status = 'queued_cleanup'
      return job.save(nJob)
    })
}


/**
 * Here a worker reports a removed job
 * @param {string} handle
 * @return {P}
 */
exports.workerRemove = function(handle){
  return job.getByHandle(handle).then(function(jobInstance){
    return job.remove(jobInstance)
  })
}


/**
 * Here a worker reports an archived job
 * @param {string} handle
 * @return {P}
 */
exports.workerArchive = function(handle){
  return job.getByHandle(handle).then(function(jobInstance){
    if(!jobInstance)return
    jobInstance.status = 'archived'
    jobInstance.worker = null
    jobInstance.statusDescription = 'Job resources removed, it is now archived.'
    return job.save(jobInstance)
  }).then(function(savedJob){
    return handleCallback(savedJob)
  })
}


/**
 * Here a worker reports a started job
 * @param {object} nJob
 * @return {P}
 */
exports.workerStart = function(nJob){
  return handleCallback(nJob)
}


/**
 * Find Jobs by Worker
 * @return {P}
 */
var findJobsByWorker = function(){
  debug(config.worker.name,'querying for jobs')
  //abort any jobs queued for abortion on this worker and category
  return nano.shredder.viewAsync('jobs','by_worker', {
    key: config.worker.name,
    include_docs: true
  })
    .then(function(result){
      return result.rows
    })
    .map(function(result){
      return result.doc
    })
}


/**
 * Find available jobs
 * @return {P}
 */
var checkForAvailableJobs = function(){
  return nano.shredder.viewAsync('jobs','available',{include_docs: true})
    .then(function(doc){
      //I'll be working on the first one.
      if(doc.rows.length){
        var newJob = doc.rows[0].doc
        newJob.worker = config.worker.name
        return nano.shredder.insertAsync(newJob)
          .then(function(job){
            return job
          },function(){
            return []
          })
      } else {
        return []
      }
  },function(){
    //Empty array
    return []
  })
}


/**
 * Dispatch jobs based on a category
 * @return {P}
 */
var dispatchCategory = function(){
  debug(config.worker.name,'dispatch')
  var processing = 0
  return findJobsByWorker()
    .each(function(jobInstance){
      debug(jobInstance.handle,'Dispatching for',jobInstance.status)
      switch(jobInstance.status){
        case 'queued_abort': {
          debug(config.worker.name,'got job for abort',jobInstance.handle)
          return dispatchJobAbort(jobInstance)
        }
        case 'removed':{
          debug(config.worker.name,'got job for remove',jobInstance.handle)
          return dispatchJobRemove(jobInstance)
        }
        case 'queued_retry':{
          debug(config.worker.name,'got own job for retry',jobInstance.handle)
          return dispatchJobRetry(jobInstance)
        }
        case 'queued':{
          debug(config.worker.name,'got job for start',jobInstance.handle)
          return dispatchJob(jobInstance)
        }
        case 'processing':{
          processing++
          //update status
          var status = JSON.parse(fs.readFileSync(
            job.folder(jobInstance.handle) + '/status.json'
          ))
          jobInstance.status = status.status
          jobInstance.statusDescription = status.statusDescription
          jobInstance.stepTotal = status.stepTotal
          jobInstance.stepComplete = status.stepComplete
          jobInstance.frameDescription = status.frameDescription
          jobInstance.frameTotal = status.frameTotal
          jobInstance.frameComplete = status.frameComplete
          return job.save(jobInstance)
        }
      }
    })
    .then(function(){
      var slotsUsed = processing
      var slotsMax = config.worker.concurrency
      var slotsAvailable = slotsMax - slotsUsed
      debug('Total slots, ' + slotsUsed + ' used, ' +
        slotsAvailable + ' available')
      //check if we are already processing the maximum amount of jobs
      if(slotsUsed >= slotsMax)
        throw new MaxConcurrencyError('No slots available')
      //if we have jobs to schedule let us lock the table now
      debug(config.worker.name,'querying for jobs to start')
      return checkForAvailableJobs()
    })
    .catch(MaxConcurrencyError,function(err){
      debug('Worker ' + config.worker.name,err.message)
    })
}


/**
 * Run overall dispatch operation
 * @return {P}
 */
var dispatch = function(){
  debug('dispatch starting')
  return dispatchCategory()
}


/**
 * Start dispatching
 * @param {function} done
 * @return {null}
 */
exports.start = function(done){
  intervalID = setInterval(dispatch,config.worker.dispatchFrequency || 11000)
  return done()
}


/**
 * Stop dispatching
 * @param {function} done
 * @return {null}
 */
exports.stop = function(done){
  clearInterval(intervalID)
  return done()
}
