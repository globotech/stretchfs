'use strict';
var P = require('bluebird')
var cp = require('child_process')
var debug = require('debug')('oose:job:worker')
var fs = require('graceful-fs')
var infant = require('infant')
var promisePipe = require('promisepipe')
var request = require('request')

var couch = require('../../helpers/couchbase')

var config = require('../../config')

//open some buckets
var ooseJob = couch.job()

//make some promises
P.promisifyAll(infant)
var requestP = P.promisify(request)

//setup job environment
var jobData = {}
var jobFolder = process.env.JOB_FOLDER
var jobHandle = process.env.JOB_HANDLE
var jobLog = ''
var jobLogLastUpdate = new Date().toJSON()
var jobLogInterval
var jobLogFrequency = 7500
var statusInterval
var statusFrequency = 5000

//placeholders
var jobDescription = {}
var jobStatus = {}
var jobPIDs = []


/**
 * Adds a job pid to pids.json file
 * @param {number} pid
 */
var addJobPID = function(pid){
  debug(jobHandle,'adding pid',pid)
  if(jobPIDs.indexOf(pid) === -1){
    jobPIDs.push(pid)
    fs.writeFileSync(jobFolder + '/pids.json',JSON.stringify(jobPIDs))
  }
}


/**
 * Removes a job pid to pids.json file
 * @param {number} pid
 */
var removeJobPID = function(pid){
  debug(jobHandle,'remove pid',pid)
  var pos = jobPIDs.indexOf(pid)
  if(pos !== -1){
    jobPIDs.splice(pos, 1)
    fs.writeFileSync(jobFolder + '/pids.json',JSON.stringify(jobPIDs))
  }
}


/**
 * Actually send the status to the db
 * @return {P}
 */
var sendStatus = function(){
  debug(jobHandle,'send status',jobStatus.status,jobStatus.statusDescription)
  var jobKey = couch.schema.job(jobHandle)
  return ooseJob.getAsync(jobKey)
    .then(function(result){
      result.value.status = jobStatus.status
      result.value.statusDescription = jobStatus.statusDescription
      result.value.stepTotal = jobStatus.stepTotal
      result.value.stepComplete = jobStatus.stepComplete
      result.value.frameTotal = jobStatus.frameTotal
      result.value.frameComplete = jobStatus.frameComplete
      result.value.frameDescription = jobStatus.frameDescription
      return ooseJob.upsertAsync(jobKey,result.value,{cas: result.cas})
    })
    .catch(function(err){
      if(12 === err.code) return sendStatus()
      else throw err
    })
}
//start the status sending loop
statusInterval = setInterval(sendStatus,statusFrequency)


/**
 * Send job log to db
 * @return {P}
 */
var sendJobLog = function(){
  var jobKey = couch.schema.job(jobHandle)
  return ooseJob.getAsync(jobKey)
    .then(function(result){
      result.value.log = jobLog
      result.value.lastLogUpdate = jobLogLastUpdate
      return ooseJob.upsertAsync(jobKey,result.value,{cas: result.cas})
    })
    .catch(function(err){
      if(12 === err.code) return sendJobLog()
      else throw err
    })
}
//start the log sending loop
jobLogInterval = setInterval(sendJobLog,jobLogFrequency)

//setup logging
var log = function(message){
  //skip empty messages
  if(!message) return
  debug(jobHandle,'log',message)
  if(!message.match(/\n/)) message = message + '\n'
  jobLog = jobLog + message
  jobLogLastUpdate = new Date().toJSON()
}


/**
 * Async graceful error handler
 * @param {object} err
 * @return {P}
 */
var errorHandlerAsync = function(err){
  //stop the status updater
  clearInterval(statusInterval)
  //stop the log handler
  clearInterval(jobLogInterval)
  debug(jobHandle,'error',err)
  //put into an error instance regardless
  if(!(err instanceof Error)) err = new Error(err)
  //now update the database with the error
  var jobKey = couch.schema.job(jobHandle)
  return ooseJob.getAndLockAsync(jobKey)
    .then(function(result){
      result.value.status = 'queued_error'
      result.value.statusDescription = err.message
      result.value.error = err
      result.value.erroredAt = new Date().toJSON()
      result.value.log = jobLog
      result.value.lastLogUpdate = jobLogLastUpdate
      return ooseJob.upsertAsync(jobKey,result.value,{cas: result.cas})
    })
    .then(function(){
      //send the error to the upstream log
      console.log(err.stack)
      //log to the job log
      return log(err.stack + '\n')
    })
    .then(function(){
      //kill the process with an erroneous status
      process.exit(1)
    })
}


/**
 * Sync crash error handler
 * @param {object} err
 */
var errorHandlerSync = function(err){
  //stop the status updater
  clearInterval(statusInterval)
  debug(jobHandle,'error',err)
  //put into an error instance regardless
  if(!(err instanceof Error)) err = new Error(err)
  //now update the database with the error
  fs.writeFileSync(jobFolder + '/crash',JSON.stringify({error: err}))
  //send the error to the upstream log
  console.log(err.stack)
  //kill the process with an erroneous status
  process.exit(1)
}

//setup error handler
//--------------------
//Just as a note for anyone looking at this file:
//this is the right way to handle this despite what the node documentation says
//at http://nodejs.org/api/process.html#process_event_uncaughtexception each
//job is in its own process to be a completely separate domain so it is
//safe to handle errors at the root of the domain. furthermore we will be
//exiting immediately after the exception is written to disk, however it is
//necessary to write the exception and stack trace to an error file so that the
//supervisor may read the error and transmit it back to the master as well as
//clean up our folder to prevent any file / memory leaks
process.on('uncaughtException',errorHandlerSync)

//read job files
jobDescription = JSON.parse(
  fs.readFileSync(jobFolder + '/description.json'))
jobStatus = JSON.parse(
  fs.readFileSync(jobFolder + '/status.json')
)

//set an overall execution timeout
setTimeout(function(){
  errorHandlerAsync(new Error('Processing timeout exceeded'))
},jobDescription.timeout || config.job.timeout.process)


/**
 * Take a string a populate job data
 * @param {string} str
 * @return {string}
 */
var populateJobData = function(str){
  var keys = Object.keys(jobData)
  var key
  var value
  for(var i = 0; i < keys.length; i++){
    key = keys[i]
    value = jobData[key]
    str = str.replace('#{' + key + '}',value)
  }
  return str
}


/**
 * Populate job data from an object
 * @param {object} obj
 * @return {object}
 */
var populateJobDataObject = function(obj){
  var keys = Object.keys(obj)
  for(var i = 0; i < keys.length; i++){
    if(null === obj[keys[i]]) continue
    if('object' === typeof obj[keys[i]])
      obj[keys[i]] = populateJobDataObject(obj[keys[i]])
    else
      obj[keys[i]] = populateJobData(obj[keys[i]])
  }
  return obj
}


/**
 * Populate job data from an array
 * @param {Array} arr
 * @return {Array}
 */
var populateJobDataArray = function(arr){
  for(var i = 0; i < arr.length; i++){
    arr[i] = populateJobData(arr[i])
  }
  return arr
}

var jobObtainResource = function(req){
  debug(jobHandle,'obtain resource',req)
  //convert to an array if not already
  if(!(req.request instanceof Array))
    req.request = [{request: req.request}]
  //worker extracted data
  //worker the last request options to keep it out of the array
  var lastReq = req.request.pop()
  var intermediateParse = function(item){
    return function(res,body){
      if('object' === typeof item.parse){
        var keys = Object.keys(item.parse)
        var key
        var exp
        var matches
        for(var i = 0; i < keys.length; i++){
          key = keys[i]
          if(item.parse[key] instanceof Array)
            exp = new RegExp(item.parse[key][0],item.parse[key][1])
          else
            exp = new RegExp(item.parse[key])
          matches = body.match(exp)
          if(matches[1])
            jobData[key] = matches[1]
        }
      }
    }
  }
  //process the request chain
  return P.try(function(){
    return req.request
  })
    .each(function(item){
      var opts = populateJobDataObject(item.request)
      debug(jobHandle,'resource request',opts)
      return log('Making intermediate resource request: ' + opts.url + '\n')
        .then(function(){
          return requestP(opts)
        })
        .spread(intermediateParse(item))
    })
    .then(function(){
      return populateJobDataObject(lastReq)
    })
    .catch(errorHandlerAsync)
}

var jobObtainResources = function(){
  debug(jobHandle,'resource obtainment started')
  log('Starting to obtain resources\n')
  var resource = jobDescription.resource || []
  var promises = []
  var req
  var ws
  var pipeRequest = function(ws){
    return function(opts){
      var lastStatusWrite = 0
      var req = request(opts.request)
      req.on('response',function(res){
        jobStatus.frameDescription = 'Downloading ' + opts.request.url
        jobStatus.frameComplete = 0
        jobStatus.frameTotal = res.headers['content-length'] || 0
      })
      req.on('data',function(chunk){
        jobStatus.frameComplete += chunk.length
        //write every 64k
        if(jobStatus.frameComplete - lastStatusWrite >= 65536){
          lastStatusWrite = jobStatus.frameComplete
        }
      })
      req.on('complete',function(){
        jobStatus.frameComplete = jobStatus.frameTotal
        jobStatus.stepComplete++
      })
      return promisePipe(req,ws)
    }
  }
  for(var i = 0; i < resource.length; i++){
    req = resource[i]
    log('Obtaining resource:' + req.name + '\n')
    ws = fs.createWriteStream(jobFolder + '/' + req.name)
    promises.push(
      jobObtainResource(req)
        .then(pipeRequest(ws))
    )
  }
  return P.all(promises)
    .then(function(){
      debug(jobHandle,'resources obtained')
      log('Resources have been obtained\n')
    })
    .catch(errorHandlerAsync)
}

var jobAugmentResources = function(){
  debug(jobHandle,'starting augment')
  log('Starting to augment resources\n')
  var augment = jobDescription.augment || []
  return P.try(function(){
    return augment
  })
    .each(function(cmd){
      return new P(function(resolve,reject){
        if(config.job.programs.indexOf(cmd.program) < 0)
          throw new Error('Unsupported program used ' + cmd.program)
        //make a status update
        jobStatus.frameDescription =
          'Augment: ' + cmd.program + ' ' + cmd.args.join(' ')
        jobStatus.frameComplete = 0
        jobStatus.frameTotal = 1
        //start the process
        var proc = cp.spawn(
          cmd.program,
          populateJobDataArray(cmd.args),
          {cwd: jobFolder}
        )
        var pid = proc.pid
        addJobPID(pid)
        var stdout = ''
        proc.stdout.on('data', function(data){
          stdout += data.toString()
        })
        proc.stderr.on('data', function(data){
          stdout += data.toString()
        })
        proc.on('error',function(){
          removeJobPID(pid)
          reject()
        })
        proc.on('close',function(code){
          removeJobPID(pid)
          //log stdout
          log(stdout+'\n')
          if(code > 0){
            var errMsg = cmd.program + ' exited with code: ' + code
            if(stdout) errMsg += ' :' + stdout
            reject(errMsg)
          }
          else {
            //update status
            jobStatus.frameComplete = 1
            jobStatus.stepComplete++
            //move on
            resolve()
          }
        })
      })
    })
    .then(function(){
      debug(jobHandle,'augment complete')
      log('Resource augmentation complete\n')
    })
    .catch(errorHandlerAsync)
}

var jobProcessComplete = function(){
  //shutdown the status updater
  clearInterval(statusInterval)
  //shutdown the log updater
  clearInterval(jobLogInterval)
  var jobKey = couch.schema.job(jobHandle)
  return ooseJob.getAndLockAsync(jobKey)
    .then(function(result){
      result.value.status = 'queued_complete'
      result.value.statusDescription = 'Job has been processed successfully'
      result.value.stepTotal = 1
      result.value.stepComplete = jobStatus.stepTotal
      result.value.frameDescription = 'Job processing complete'
      result.value.frameTotal = jobStatus.stepTotal
      result.value.frameComplete = jobStatus.stepTotal
      result.value.log = jobLog
      result.value.logLastUpdate = jobLogLastUpdate
      return ooseJob.upsertAsync(jobKey,result.value,{cas: result.cas})
    })
}

var jobProcess = function(){
  debug(jobHandle,'starting to process job')
  return jobObtainResources()
    .then(function(){
      return jobAugmentResources()
    })
    .then(function(){
      return jobProcessComplete()
    })
    .then(function(){
      log('Job processing complete\n')
      debug(jobHandle,'job process complete')
    })
    .catch(errorHandlerAsync)
}


if(require.main === module){
  infant.child(
    'oose:' + config.store.name + ':job:' + jobHandle,
    function(){
      jobProcess()
        .then(function(){
          process.exit(0)
        })
    },
    function(done){
      //stop the status updater
      clearInterval(statusInterval)
      process.nextTick(done)
    }
  )
}
