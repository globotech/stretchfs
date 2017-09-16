'use strict';
var P = require('bluebird')
var debug = require('debug')('shredder:worker:supervisor')
var fs = require('graceful-fs')
var glob = P.promisify(require('glob'))
var infant = require('infant')
var path = require('path')
var rimraf = require('rimraf-promise')

var config = require('../config')
var interval
var handler = require('./handler')
var job = require('./helpers/job')
var jobsProcessing = {}
var nano = require('../helpers/couchdb')
var maxExecutionTime
var dispatch = require('./dispatch')

//make some promises
P.promisifyAll(fs)
P.promisifyAll(infant)


/**
 * Kills all the processes, we don't want process leaking.
 * @param {string} handle
 * @param {string} jobFolder
 */
var cleanupProcesses = function(handle,jobFolder){
  var jobPIDs;
  if(jobFolder){
    try {
      jobPIDs = JSON.parse(
        fs.readFileSync(jobFolder + '/pids.json').toString('utf-8'))
      if(jobPIDs && jobPIDs.length){
        for(var i = 0; i < jobPIDs.length; i++){
          debug('Killing child process ' + jobPIDs[i])
          process.kill(jobPIDs[i],'SIGKILL')
        }
      }
    } catch(e){}
  }

  //kill the job just in case
  if(jobsProcessing[handle])
    jobsProcessing[handle].kill('SIGKILL')
}


/**
 * Abort any jobs that are currently processing
 * @return {P}
 */
var abortProcessingJobs = function(){
  var promises = []
  var keys = Object.keys(jobsProcessing)
  var handle
  for(var i = 0; i < keys.length; i++){
    handle = keys[i]
    //kill the running process
    cleanupProcesses(handle)
    //destroy the folder containing the job
    promises.push(rimraf(job.folder(handle)))
    //mark the job aborted
    promises.push(dispatch.workerAbort(handle))
  }
  return P.all(promises)
}


/**
 * Find jobs that need aborted and kill them (destroying their folders)
 * @return {P}
 */
var superviseJobAbort = function(){
  return nano.shredder.viewAsync(
    'jobs',
    'by_status',
    {key: 'queued_abort_ready', include_docs: true}
  )
    .then(function(result){
      return result.rows
    })
    .map(function(result){
      return result.doc
    })
    .each(function(nJob){
      var promises = []
      var jobFolder = job.folder(nJob.handle)
      //kill the job process
      cleanupProcesses(nJob.handle,jobFolder)
      //destroy the job folder
      promises.push(rimraf(jobFolder))
      //mark the job aborted
      promises.push(dispatch.workerAbort(nJob.handle))
      return P.all(promises)
    })
    .then(function(){
      debug('jobs aborted')
    })
}


/**
 * Find jobs that are been processed and see if they are within processing time.
 * If not, error them.
 * @return {P}
 */
var superviseJobProcessing = function(){
  return nano.shredder.viewAsync(
    'jobs',
    'by_status',
    {key: 'processing', include_docs: true}
  )
    .then(function(result){
      return result.rows
    })
    .map(function(result){
      return result.doc
    })
    .each(function(nJob){
      var promises = []
      var jobFolder = job.folder(nJob.handle)
      var jobTime = new Date()
      if(fs.existsSync(jobFolder + '/time'))
        jobTime = JSON.parse(fs.readFileSync(jobFolder + '/time')
          .toString('utf-8').trim())
      if(jobTime.start + jobTime.maxExecutionTime < +(new Date())){
        if(fs.existsSync(jobFolder + '/processing'))
          fs.unlink(jobFolder + '/processing')
        promises.push(fs.writeFileAsync(
          jobFolder + '/error','Time exceeded for this job to finish.'))
      }
      return P.all(promises)
    })
    .then(function(){
      debug('jobs aborted')
    })
}


/**
 * Find jobs that have reported errors and kill them (destroying their folders)
 * @return {P}
 */
var superviseJobError = function(){
  return glob(config.root + '/**/error')
    .then(function(result){
      debug('found erroneous jobs',result)
      var promises = []
      var file
      var handle
      var jobFolder
      var error
      for(var i = 0; i < result.length; i++){
        file = result[i]
        jobFolder = path.dirname(file)
        handle = file.handle
        error = fs.readFileSync(jobFolder + '/error').toString('utf-8').trim()
        //kill the job process
        if(jobsProcessing[handle]){
          cleanupProcesses(handle,jobFolder)
          delete jobsProcessing[handle]
        }
        //destroy the job folder
        promises.push(rimraf(jobFolder))
        //the job had an error
        promises.push(dispatch.workerError(handle,error))
      }
      return P.all(promises)
    })
    .then(function(){
      debug('jobs have been cleaned up from errors and errors reported')
    })
}


/**
 * Find jobs that are complete and notify the master
 * @return {P}
 */
var superviseJobComplete = function(){
  return nano.shredder.viewAsync(
    'jobs',
    'by_status',
    {key: 'complete', include_docs: true}
  )
    .then(function(result){
      return result.rows
    })
    .map(function(result){
      return result.doc
    })
    .each(function(nJob){
      //skip jobs that have already been handled
      if(nJob.completedAt) return
      var jobFolder = job.folder(nJob.handle)
      //kill the job process (for good measure)
      if(jobsProcessing[nJob.handle]){
        cleanupProcesses(nJob.handle,jobFolder)
        //remove the job process from the list
        delete jobsProcessing[nJob.handle]
      }
      return dispatch.workerComplete(nJob.handle)
    })
    .then(function(){
      debug('jobs completed')
    })
}


/**
 * Find jobs that need to be removed, kill processes,
 * remove the directory and notify the master
 * @return {P}
 */
var superviseJobRemove = function(){
  return nano.shredder.viewAsync(
    'jobs',
    'by_status',
    {key: 'queued_remove', include_docs: true}
  )
    .then(function(result){
      return result.rows
    })
    .map(function(result){
      return result.doc
    })
    .each(function(nJob){
      var promises = []
      var jobFolder = job.folder(nJob.handle)
      //kill the job process (for good measure)
      if(jobsProcessing[nJob.handle]){
        cleanupProcesses(nJob.handle,jobFolder)
        //remove the job process from the list
        delete jobsProcessing[nJob.handle]
      }
      //destroy the job folder
      promises.push(rimraf(jobFolder))
      promises.push(dispatch.workerRemove(nJob.handle))
      return P.all(promises)
    })
    .then(function(){
      debug('jobs removed')
    })
}


/**
 * Find jobs that are stale and need cleaned up
 * @return {P}
 */
var superviseJobCleanup = function(){
  return nano.shredder.viewAsync(
    'jobs',
    'by_status',
    {key: 'queued_cleanup', include_docs: true}
  )
    .then(function(result){
      return result.rows
    })
    .map(function(result){
      return result.doc
    })
    .each(function(nJob){
      var promises = []
      var jobFolder = job.folder(nJob.handle)
      var completed = nJob.completedAt
      //check if the cleanup timeout has expired
      if(+(new Date()) < (completed + config.worker.job.timeout.cleanup)){
        return
      }
      //destroy the folder if the timeout has expired
      promises.push(rimraf(jobFolder))
      //the job has been archived
      promises.push(dispatch.workerArchive(nJob.handle))
      return P.all(promises)
    })
    .then(function(){
      debug('jobs cleaned up')
    })
}


/**
 * Find jobs that are ready for a retry
 * @return {P}
 */
var superviseJobRetry = function(){
  return nano.shredder.viewAsync(
    'jobs',
    'by_status',
    {key: 'queued_retru_ready', include_docs: true}
  )
    .then(function(result){
      return result.rows
    })
    .map(function(result){
      return result.doc
    })
    .each(function(nJob){
      var jobFolder = job.folder(nJob.handle)
      //kill the job just in case
      cleanupProcesses(nJob.handle,jobFolder)
      //destroy the job folder and create a new one
      return handler.create(nJob)
    })
    .then(function(){
      debug('jobs setup to be retried')
    })
}


/**
 * Find jobs that are ready to be started
 * @return {P}
 */
var superviseJobStart = function(){
  return nano.shredder.viewAsync(
    'jobs',
    'by_status',
    {key: 'queued_start', include_docs: true}
  )
    .then(function(result){
      return result.rows
    })
    .map(function(result){
      return result.doc
    })
    .each(function(nJob){
      var startJob = function(nJob){
        var jobFolder = job.folder(nJob.handle)
        nJob.status = 'processing'
        nJob.statusDescription = 'Processing Job'
        fs.writeFileSync(jobFolder + '/processing','processing')
        return handler.create(nJob,'processing','Processing Job')
          .then(function(){
            //actually finally start the process to handle the job
            jobsProcessing[nJob.handle] = infant.parent(
              './job',
              {
                fork: {
                  env: {
                    'JOB_FOLDER': jobFolder,
                    'JOB_HANDLE': nJob.handle,
                    'SHREDDER_CONFIG': process.env.SHREDDER_CONFIG,
                    'PATH' : process.env.PATH
                  }
                },
                respawn: false
              }
            )
            return jobsProcessing[nJob.handle].startAsync()
          })
      }
      //kill the job just in case
      if(jobsProcessing[nJob.handle])
        jobsProcessing[nJob.handle].kill('SIGKILL')
      //destroy the job folder and create a new one
      return startJob(nJob)
    })
    .then(function(){
      debug('jobs started')
    })
}


/**
 * Run overall supervise operation
 * @return {P}
 */
var supervise = function(){
  debug('supervise starting')
  return superviseJobAbort()
    .then(function(){
      return superviseJobRemove()
    })
    .then(function(){
      return superviseJobProcessing()
    })
    .then(function(){
      return superviseJobError()
    })
    .then(function(){
      return superviseJobComplete()
    })
    .then(function(){
      return superviseJobCleanup()
    })
    .then(function(){
      return superviseJobRetry()
    })
    .then(function(){
      return superviseJobStart()
    })
    .then(function(){
      debug('supervise complete')
    })
}

if(require.main === module){
  infant.child(
    'shredder:' + config.worker.name + ':supervisor',
    function(done){
      debug('set interval')
      maxExecutionTime = config.worker.maxExecutionTime
      interval = setInterval(supervise,config.worker.superviseFrequency)
      //do initial supervise during startup
      return dispatch.start(done)
    },
    function(done){
      //stop supervise loop
      clearInterval(interval)
      debug('cleared interval')
      //abort all jobs
      debug('aborting any active jobs')
      abortProcessingJobs()
        .then(function(){
          return dispatch.stop(done)
        })
        .catch(done)
    }
  )
}
