'use strict';
var P = require('bluebird')
var debug = require('debug')('oose:job:supervisor')
var fs = require('graceful-fs')
var infant = require('infant')
var mkdirp = require('mkdirp-then')
var request = require('request-promise')
var rimraf = require('rimraf-promise')

var config = require('../../config')
var couch = require('../../helpers/couchbase')
var interval
var jobHelper = require('../../helpers/job')
var jobsProcessing = {}
var maxExecutionTime

//identify ourselves
var workerKey = couch.schema.store(config.store.prism,config.store.name)
debug('coming up with a new identity for job processing',workerKey)

//open some buckets
var ooseJob = couch.job()

//make some promises
P.promisifyAll(fs)
P.promisifyAll(infant)


/**
 * Notify of Job Abortion
 * @param {string} handle
 * @param {string} status
 * @param {statusDescription} statusDescription
 * @param {boolean} silent - when true (default: false) will not send callback
 * @return {P}
 */
var jobNotification = function(handle,status,statusDescription,silent){
  if('undefined' === typeof silent) silent = false
  var jobResult = {}
  return ooseJob.getAsync(handle)
    .then(function(result){
      jobResult = result
      jobResult.value.status = status
      jobResult.value.statusDescription = statusDescription
      //notify database of our change
      return ooseJob.upsertAsync(handle,jobResult.value,{cas: jobResult.cas})
    })
    .then(function(){
      //notify our callbacks
      if(!silent){
        //parse out the job description
        var description = jobResult.value.description
        //make sure they have a subscription url
        if(!description.callback || !description.callback.request)
          return jobResult
        var req = description.callback.request
        req.json = jobResult.value
        //we want to send a notification back to our consumer
        return request(req)
          .catch(function(err){
            debug('failed to issue callback request',err)
          })
      }
    })
}


/**
 * Find Jobs
 * @param {string} status
 * @param {string} category
 * @param {number} limit
 * @param {boolean} prioritize
 * @return {P}
 */
var findJobs = function(status,category,limit,prioritize){
  debug('querying for ' + status + ' ' + category + ' jobs',limit,prioritize)
  var qstring = 'SELECT b.* FROM ' +
    couch.getName(couch.type.JOB,true) + ' b ' +
    'WHERE b.status = $1 ' +
    (category ? ' AND b.category = $2' : '') +
    (prioritize ? ' ORDER BY priority ASC' : '') +
    (limit ? ' LIMIT ' + limit : '')
  var query = couch.N1Query.fromString(qstring)
  return ooseJob.queryAsync(query,[status,category])
}


/**
 * Find Jobs by Worker
 * @param {object} workerKey
 * @param {string} status
 * @param {string} category
 * @param {number} limit
 * @param {boolean} prioritize
 * @return {P}
 */
var findJobsByWorker = function(workerKey,status,category,limit,prioritize){
  debug(workerKey,
    'querying for ' + status + ' ' + category + ' jobs',limit,prioritize)
  var qstring = 'SELECT b.* FROM ' +
    couch.getName(couch.type.JOB,true) + ' b ' +
    'WHERE b.workerKey = $1 AND b.status = $2 ' +
    (category ? ' AND b.category = $3' : '') +
    (prioritize ? ' ORDER BY priority ASC' : '') +
    (limit ? ' LIMIT ' + limit : '')
  var query = couch.N1Query.fromString(qstring)
  return ooseJob.queryAsync(query,[workerKey,status,category])
}


/**
 * Kills all the processes, we don't want process leaking.
 * @param {string} handle
 * @param {string} jobFolder
 * @return {*}
 */
var cleanupProcesses = function(handle,jobFolder){
  var jobPIDs;
  if(jobFolder){
    try {
      if(!fs.existsSync(jobFolder + '/pids.json')) return
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
    promises.push(rimraf(jobHelper.folder(handle)))
    //tell master the job has been aborted
    promises.push(
      jobNotification(handle,'aborted','Worker has aborted the job'))
  }
  return P.all(promises)
}


/**
 * Find jobs that need aborted and kill them (destroying their folders)
 * @return {P}
 */
var superviseJobAbort = function(){
  return findJobsByWorker(workerKey,'queued_abort')
    .then(function(result){
      debug('found abort jobs',result)
      return result
    })
    .each(function(job){
      var promises = []
      var jobFolder = jobHelper.folder(job.handle)
      //kill the job process
      cleanupProcesses(job.handle,jobFolder)
      //destroy the job folder
      promises.push(rimraf(jobFolder))
      //tell master the job has been aborted
      promises.push(jobNotification('aborted','Abortion request successful'))
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
  return findJobsByWorker(workerKey,'processing')
    .then(function(result){
      debug('found processing jobs',result)
      return result
    })
    .each(function(job){
      var jobKey = couch.schema.job(job.handle)
      //check the runtime of the job and kill it if needed
      var jobTime
      var jobFolder = jobHelper.folder(job.handle)
      var time = Math.floor(Date.now() /1000)
      jobTime = Math.floor(+(new Date(job.startedAt)) /1000)
      if(jobTime + jobTime.maxExecutionTime < time){
        return ooseJob.getAsync(jobKey)
          .then(function(result){
            result.value.status = 'queued_error'
            result.value.statusDescription =
              'Time exceeded for this job to finish.'
            result.value.error = 'Time exceeded for this job to finish.'
            result.value.erroredAt = new Date().toJSON()
            return ooseJob.upsertAsync(jobKey,result.value,{cas: result.cas})
          })
      }
      if(fs.existsSync(jobFolder + '/crash')){
        return ooseJob.getAsync(jobKey)
          .then(function(result){
            result.value.status = 'queued_error'
            result.value.statusDescription =
              'The job was found crashed'
            result.value.error = fs.readFileSync(jobFolder + '/crash')
            result.value.erroredAt = new Date().toJSON()
            return ooseJob.upsertAsync(jobKey,result.value,{cas: result.cas})
          })
      }
    })
    .then(function(){
      debug('processing jobs checked')
    })
}


/**
 * Find jobs that have reported errors and kill them (destroying their folders)
 * @return {P}
 */
var superviseJobError = function(){
  return findJobsByWorker(workerKey,'queued_error')
    .then(function(result){
      debug('found queued error jobs',result)
      return result
    })
    .each(function(job){
      debug('found job for queued error',job)
      var handle = job.handle
      var jobFolder = jobHelper.folder(handle)
      var error = job.error
      //kill the job process
      if(jobsProcessing[handle]){
        cleanupProcesses(handle,jobFolder)
        delete jobsProcessing[handle]
      }
      //destroy the job folder
      return rimraf(jobFolder)
        .then(function(){
          //tell master the job has been reported an error
          return jobNotification(handle,'error',JSON.stringify(error))
        })
    })
    .then(function(){
      debug('jobs have been cleaned up from errors and errors reported')
    })
    .catch(function(err){
      console.log('crash',err)
    })
}


/**
 * Find jobs that are complete and notify the master
 * @return {P}
 */
var superviseJobComplete = function(){
  return findJobsByWorker(workerKey,'queued_complete')
    .then(function(result){
      debug('found queued complete jobs',result)
      return result
    })
    .each(function(job){
      debug('found job for completion',job)
      var handle = job.handle
      var jobFolder = jobHelper.folder(job.handle)
      //kill the job process (for good measure)
      if(jobsProcessing[handle]){
        cleanupProcesses(handle,jobFolder)
        //remove the job process from the list
        delete jobsProcessing[handle]
      }
      //remove the completion flag
      return ooseJob.getAsync(couch.schema.job(handle))
        .then(function(result){
          result.value.status = 'cleanup'
          result.value.completedAt = new Date().toJSON()
          return ooseJob.upsertAsync(handle,result.value,{cas: result.cas})
        })
        .then(function(){
          //tell master the job has been completed
          return jobNotification(
            handle,'complete','Job processing complete')
        })
    })
    .then(function(){
      debug('jobs completed processed and notified')
    })
}


/**
 * Find jobs that need to be removed, kill processes,
 * remove the directory and notify the master
 * @return {P}
 */
var superviseJobRemove = function(){
  return findJobsByWorker(workerKey,'queued_remove')
    .then(function(result){
      debug('found removal jobs',result)
      return result
    })
    .each(function(job){
      debug('found job for removal',job)
      var handle = job.handle
      var jobFolder = jobHelper.folder(job.handle)
      //kill the job process (for good measure)
      if(jobsProcessing[handle]){
        cleanupProcesses(handle,jobFolder)
        //remove the job process from the list
        delete jobsProcessing[handle]
      }
      //destroy the job folder
      return rimraf(jobFolder)
        .then(function(){
          return ooseJob.removeAsync(handle)
        })
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
  return findJobsByWorker(workerKey,'cleanup')
    .then(function(result){
      debug('found cleanup jobs',result)
      return result
    })
    .each(function(job){
      debug('found job for cleanup check',job.handle)
      var now = +(new Date())
      var handle
      var completed
      var jobFolder
      jobFolder = jobHelper.folder(job.handle)
      handle = job.handle
      completed = +(new Date(job.completedAt))
      //check if the cleanup timeout has expired
      if(now < (completed + config.job.timeout.cleanup)) return
      //destroy the folder if the timeout has expired
      debug('performing job cleanup',job.handle)
      return rimraf(jobFolder)
        .then(function(){
          //tell master the job has been archived
          jobNotification(
            handle,'archived','Job resources removed, it is now archived.',true)
        })
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
  return findJobsByWorker(workerKey,'queued_retry')
    .then(function(result){
      debug('found retru jobs',result)
      return result
    })
    .each(function(job){
      debug('found job for retry',job)
      var refireJob = function(jobFolder,handle,description){
        return rimraf(jobFolder)
          .then(function(){
            return mkdirp(jobFolder)
          })
          .then(function(){
            return P.all([
              fs.writeFileAsync(jobFolder + '/handle',handle),
              fs.writeFileAsync(jobFolder + '/description.json',description),
              fs.writeFileAsync(jobFolder + '/start','start')
            ])
          })
      }
      var promises = []
      var handle = job.handle
      var description = job.description
      var jobFolder = jobHelper.folder(handle)
      //kill the job just in case
      cleanupProcesses(handle,jobFolder)
      //destroy the job folder and create a new one
      promises.push(refireJob(jobFolder,handle,description))
      return P.all(promises)
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
  return findJobsByWorker(workerKey,'queued_start')
    .then(function(result){
      debug('found start jobs',result)
      return result
    })
    .each(function(job){
      debug('found job for start',job)
      var startJob = function(jobFolder,handle,description){
        var jobKey = couch.schema.job(handle)
        return rimraf(jobFolder)
          .then(function(){
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
            var status = {
              status: 'processing',
              statusDescription: 'Processing job',
              stepTotal: stepTotal,
              stepComplete: 0,
              frameTotal: 1,
              frameComplete: 0,
              frameDescription: 'Idle'
            }
            return P.all([
              fs.writeFileAsync(jobFolder + '/handle',handle),
              fs.writeFileAsync(jobFolder + '/processing',handle),
              fs.writeFileAsync(
                jobFolder + '/description.json',JSON.stringify(description)),
              fs.writeFileAsync(
                jobFolder + '/status.json',JSON.stringify(status))
            ])
          })
          .then(function(){
            //update database
            return ooseJob.getAsync(jobKey)
          })
          .then(function(result){
            result.value.status = 'processing'
            result.value.statusDescription = 'The worker is starting'
            result.value.startedAt = new Date().toJSON()
            return ooseJob.upsertAsync(jobKey,result.value,{cas: result.cas})
          })
          .then(function(){
            //actually finally start the process to handle the job
            var env = {
              'JOB_FOLDER': jobFolder,
              'JOB_HANDLE': handle,
              'PATH' : process.env.PATH
            }
            if(process.env.DEBUG){
              env.DEBUG = process.env.DEBUG
            }
            if(process.env.NODE_DEBUG){
              env.NODE_DEBUG = process.env.NODE_DEBUG
            }
            if(process.env.OOSE_CONFIG){
              env.OOSE_CONFIG = process.env.OOSE_CONFIG
            }
            jobsProcessing[handle] = infant.parent(
              './worker',
              {
                fork: {
                  env: env
                },
                respawn: false
              }
            )
            return jobsProcessing[handle].startAsync()
          })
      }
      var handle = job.handle
      var description = job.description
      var jobFolder = jobHelper.folder(handle)
      //kill the job just in case
      if(jobsProcessing[handle])
        jobsProcessing[handle].kill('SIGKILL')
      //destroy the job folder and create a new one
      return startJob(jobFolder,handle,description)
    })
    .then(function(){
      debug('jobs started')
    })
}


/**
 * Get the assignable job limit
 * @return {number}
 */
var getAssignableLimit = function(){
  return findJobsByWorker(workerKey,'processing')
    .then(function(result){
      var total = config.job.concurrency
      var used = result.length
      var avail = total - used
      if(avail < 0) avail = 0
      return avail
    })
}


/**
 * Assign jobs to this worker
 * @return {P}
 */
var superviseJobAssign = function(){
  return getAssignableLimit()
    .then(function(limit){
      if(0 === limit){
        throw new Error('Worker busy')
      }
      return findJobs('queued',null,limit,true)
    })
    .then(function(result){
      debug('got assignable jobs',result)
      return result
    })
    .each(function(job){
      return ooseJob.getAndLockAsync(job.handle)
        .then(function(result){
          result.value.status = 'queued_start'
          result.value.workerName = config.store.name
          result.value.workerKey = workerKey
          return ooseJob.upsertAsync(job.handle,result.value,{cas: result.cas})
        })
    })
    .then(function(){
      debug('job assignment complete')
    })
    .catch(function(err){
      if('Worker busy' === err.message){
        debug('worker full, skipping assignment')
      } else {
        throw err
      }
    })
}


/**
 * Run overall supervise operation
 * @return {P}
 */
var supervise = function(){
  debug('supervise starting')
  var startTime = +(new Date())
  var stepTime = +(new Date())
  var endTime
  var duration
  var printTimer = function(name){
    endTime = +(new Date())
    duration = endTime - stepTime
    debug('supervise ' + name + ' completed in ' + duration + ' ms')
    stepTime = +(new Date())
  }
  return superviseJobAbort()
    .then(function(){
      printTimer('abort')
      return superviseJobRemove()
    })
    .then(function(){
      printTimer('remove')
      return superviseJobProcessing()
    })
    .then(function(){
      printTimer('processing')
      return superviseJobError()
    })
    .then(function(){
      printTimer('erroneous')
      return superviseJobComplete()
    })
    .then(function(){
      printTimer('complete')
      return superviseJobCleanup()
    })
    .then(function(){
      printTimer('cleanup')
      return superviseJobRetry()
    })
    .then(function(){
      printTimer('retry')
      return superviseJobStart()
    })
    .then(function(){
      printTimer('start')
      return superviseJobAssign()
    })
    .then(function(){
      printTimer('assign')
      stepTime = startTime
      printTimer('has')
    })
}

if(require.main === module){
  infant.child(
    'shredder:' + config.store.name + ':supervisor',
    function(done){
      debug('set interval')
      maxExecutionTime = config.job.maxExecutionTime
      interval = setInterval(supervise,config.job.superviseFrequency)
      //do initial supervise during startup
      debug('doing initial supervise')
      supervise()
        .then(function(){
          debug('initial supervise complete')
          done()
        })
        .catch(done)
    },
    function(done){
      //stop supervise loop
      clearInterval(interval)
      debug('cleared interval')
      //abort all jobs
      debug('aborting any active jobs')
      abortProcessingJobs()
        .then(function(){
          done()
        })
        .catch(done)
    }
  )
}
