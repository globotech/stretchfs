'use strict';
var P = require('bluebird')
var fs = require('graceful-fs')
var infant = require('infant')
var mkdirp = require('mkdirp-then')
var rimraf = require('rimraf-promise')
var shredder = require('shredder-sdk')
var config = require('../config')
var dispatch = require('./dispatch')
var job = require('./helpers/job')
var UserError = shredder.UserError

//make some promises
P.promisifyAll(fs)
P.promisifyAll(infant)


/**
 * Create job
 * @param {object} nJob
 * @param {string} status
 * @param {string} statusDescription
 * @return {P}
 */
exports.create = function(nJob,status,statusDescription){
  var handle = nJob.handle
  var description = nJob.description
  var jobFolder = job.folder(handle)
  if(!status) status = 'processing'
  if(!statusDescription) statusDescription = 'Processing job'
  return P.try(function(){
    if(!handle) throw new UserError('No Job handle provided')
    if('object' !== typeof description)
      throw new UserError('No Job description provided')
    //destroy job folder if it exists
    return rimraf(jobFolder)
  })
  .then(function(){
    //setup job folder
    return mkdirp(jobFolder)
  })
  .then(function(){
    var stepTotal = 0
    if(description.resource){
      stepTotal += description.resource.length
    }
    if(description.augment){
      stepTotal += description.augment.length
    }
    nJob.status = status
    nJob.statusDescription = statusDescription
    nJob.stepTotal = stepTotal
    var jobStatus = {
      status: status,
      statusDescription: statusDescription,
      stepTotal: stepTotal,
      stepComplete: 0,
      frameTotal: 1,
      frameComplete: 0,
      frameDescription: 'Idle'
    }
    var time = {
      start:Math.floor(Date.now() /1000),
      maxExecutionTime: description.maxExecutionTime ?
        description.maxExecutionTime : config.worker.maxExecutionTime
    }
    var promises = [
      fs.writeFileAsync(jobFolder + '/handle',handle),
      fs.writeFileAsync(jobFolder + '/processing',handle),
      fs.writeFileAsync(jobFolder + '/time',JSON.stringify(time)),
      fs.writeFileAsync(
        jobFolder + '/description.json',
        JSON.stringify(description)
      ),
      fs.writeFileAsync(
        jobFolder + '/status.json',JSON.stringify(jobStatus)),
      job.save(nJob)
    ]
    if('processing' === status)
      promises.push(dispatch.workerStart(nJob))
    return P.all(promises)
  })
}


/**
 * Job detail
 * @param {object} nJob
 * @return {P}
 */
exports.detail = function(nJob){
  //deprecated function
  return nJob
}


/**
 * Update job
 * @param {object} nJob
 * @return {P}
 */
exports.update = function(nJob){
  var handle = nJob.handle
  var description = nJob.description
  var jobFolder = job.folder(handle)
  return P.try(function(){
    if(!handle) throw new UserError('No Job handle provided')
    if('object' !== typeof description)
      throw new UserError('No Job description provided')
    if(fs.existsSync(jobFolder + '/processing'))
      throw new UserError('Job has already been started, modified not allowed')
    //write job description
    return P.all([
      fs.writeFileAsync(
        jobFolder + '/description.json',
        JSON.stringify(description)
      ),
      fs.writeFileAsync(jobFolder + '/handle',handle)
    ])
  })
}


/**
 * Remove job
 * @param {object} nJob
 * @return {P}
 */
exports.remove = function(nJob){
  var handle = nJob.handle
  var jobFolder = job.folder(handle)
  var removing = false
  return P.try(function(){
    if(!handle) throw new UserError('No Job handle provided')

    //check if the job is being processed
    // if so, signal the job to halt w/e it's doing.
    if(fs.existsSync(jobFolder + '/processing')){
      removing = true
      nJob.status = 'queued_remove'
      return job.save(nJob)
    }else{
      //destroy job folder if it exists
      return rimraf(jobFolder)
    }
  })
    .then(function(){
      return removing
    })
}


/**
 * Start job
 * @param {object} nJob
 * @return {P}
 */
exports.start = function(nJob){
  nJob.status = 'queued_start'
  return job.save(nJob)
}


/**
 * Abort job
 * @param {object} nJob
 * @return {P}
 */
exports.abort = function(nJob){
  nJob.status = 'queued_abort_ready'
  return job.save(nJob)
}


/**
 * Retry job
 * @param {object} nJob
 * @return {*}
 */
exports.retry = function(nJob){
  nJob.status = 'queued_retry_ready'
  return job.save(nJob)
}

