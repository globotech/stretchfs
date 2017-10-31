'use strict';
var P = require('bluebird')
var cp = require('child_process')
var debug = require('debug')('oose:job:worker')
var fs = require('graceful-fs')
var infant = require('infant')
var promisePipe = require('promisepipe')
var request = require('request')

var config = require('../../config')

//make some promises
P.promisifyAll(infant)
var requestP = P.promisify(request)

//setup job environment
var jobData = {}
var jobFolder = process.env.JOB_FOLDER
var jobHandle = process.env.JOB_HANDLE
var jobLog = jobFolder + '/log'

//placeholders
var jobDescription = {}
var jobStatus = {}
var jobPIDs = []


/**
 * Adds a job pid to pids.json file
 * @param {number} pid
 */
var addJobPID = function(pid){
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
  var pos = jobPIDs.indexOf(pid)
  if(pos !== -1){
    jobPIDs.splice(pos, 1)
    fs.writeFileSync(jobFolder + '/pids.json',JSON.stringify(jobPIDs))
  }
}


/**
 * Write the status.json
 */
var writeStatus = function(){
  fs.writeFileSync(jobFolder + '/status.json',JSON.stringify(jobStatus))
}

//setup logging
fs.writeFileSync(jobLog,'Created Log\n')
//var logStream = fs.createWriteStream(jobLog)
var log = fs.openSync(jobLog,'a')

var errorHandler = function(err){
  //put into an error instance regardless
  if(!(err instanceof Error)) err = new Error(err)
  //now write the error file
  fs.writeFileSync(
    jobFolder + '/error',
    'Job processing has crashed!\n' + err.stack + '\n'
  )
  if(jobStatus){
    jobStatus.status = 'error'
    jobStatus.statusDescription = err.message
    writeStatus()
  }
  //send the error to the upstream log
  console.log(err.stack)
  //log to the job log
  fs.writeSync(log,err.stack + '\n')
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
process.on('uncaughtException',errorHandler)

//read job files
jobDescription = JSON.parse(
  fs.readFileSync(jobFolder + '/description.json'))
jobStatus = JSON.parse(
  fs.readFileSync(jobFolder + '/status.json')
)

//set an overall execution timeout
setTimeout(function(){
  errorHandler(new Error('Processing timeout exceeded'))
},jobDescription.timeout || config.worker.job.timeout.process)


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
      fs.writeSync(log,
        'Making intermediate resource request: ' + opts.url + '\n')
      return requestP(opts)
        .spread(intermediateParse(item))
    })
    .then(function(){
      return populateJobDataObject(lastReq)
    })
}

var jobObtainResources = function(){
  fs.writeSync(log,'Starting to obtain resources\n')
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
        writeStatus()
      })
      req.on('data',function(chunk){
        jobStatus.frameComplete += chunk.length
        //write every 64k
        if(jobStatus.frameComplete - lastStatusWrite >= 65536){
          lastStatusWrite = jobStatus.frameComplete
          writeStatus()
        }
      })
      req.on('complete',function(){
        jobStatus.frameComplete = jobStatus.frameTotal
        jobStatus.stepComplete++
        writeStatus()
      })
      return promisePipe(req,ws)
    }
  }
  for(var i = 0; i < resource.length; i++){
    req = resource[i]
    fs.writeSync(log,'Obtaining resource:' + req.name + '\n')
    ws = fs.createWriteStream(jobFolder + '/' + req.name)
    promises.push(
      jobObtainResource(req)
        .then(pipeRequest(ws))
    )
  }
  return P.all(promises)
    .then(function(){
      fs.writeSync(log,'Resources have been obtained\n')
    })
}

var jobAugmentResources = function(){
  fs.writeSync(log,'Starting to augment resources\n')
  var augment = jobDescription.augment || []
  return P.try(function(){
    return augment
  })
    .each(function(cmd){
      return new P(function(resolve,reject){
        if(config.worker.job.programs.indexOf(cmd.program) < 0)
          throw new Error('Unsupported program used ' + cmd.program)
        //make a status update
        jobStatus.frameDescription =
          'Augment: ' + cmd.program + ' ' + cmd.args.join(' ')
        jobStatus.frameComplete = 0
        jobStatus.frameTotal = 1
        writeStatus()
        //start the process
        var proc = cp.spawn(
          cmd.program,
          populateJobDataArray(cmd.args),
          {cwd: jobFolder}
        )
        var pid = proc.pid
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
          fs.writeSync(log,stdout+'\n')
          if(code > 0){
            var errMsg = cmd.program + ' exited with code: ' + code
            if(stdout) errMsg += ' :' + stdout
            reject(errMsg)
          }
          else {
            //update status
            jobStatus.frameComplete = 1
            jobStatus.stepComplete++
            writeStatus()
            //move on
            resolve()
          }
        })
        addJobPID(pid)
      })
    })
    .then(function(){
      fs.writeSync(log,'Resource augmentation complete\n')
    })
}

var jobProcessComplete = function(){
  jobStatus.status = 'complete'
  jobStatus.statusDescription = 'Job has been processed successfully'
  jobStatus.stepTotal = 1
  jobStatus.stepComplete = jobStatus.stepTotal
  jobStatus.frameDescription = 'Job processing complete'
  jobStatus.frameTotal = jobStatus.stepTotal
  jobStatus.frameComplete = jobStatus.stepTotal
  writeStatus()
  return fs.unlinkAsync(jobFolder + '/processing')
}

var jobProcess = function(){
  debug('starting to process job')
  return jobObtainResources()
    .then(function(){
      return jobAugmentResources()
    })
    .then(function(){
      return jobProcessComplete()
    })
    .then(function(){
      return fs.writeFileAsync(jobFolder + '/complete','complete')
    })
    .then(function(){
      fs.writeSync(log,'Job processing complete\n')
      fs.closeSync(log)
      debug('job process complete')
    })
    .catch(function(e){
      errorHandler(e)
    })
}


if(require.main === module){
  infant.child(
    'shredder:' + config.worker.name + ':job:' + jobHandle,
    function(){
      jobProcess()
        .then(function(){
          process.exit(0)
        })
    },
    function(done){
      process.nextTick(done)
    }
  )
}
