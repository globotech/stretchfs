'use strict';
var async = require('async')
var childProcess = require('child_process')
var debug = require('debug')('oose:task:inventory')
var os = require('os')
var path = require('path')
var promisePipe = require('promisepipe')
var through2 = require('through2')

var childOnce = require('../helpers/child').childOnce
var file = require('../helpers/file')
var logger = require('../helpers/logger').create('task:inventory')

var config = require('../config')

var flipSlashExp = /\\/g
var newLineExp = /\r\n/g
var rootExp = new RegExp(
  path.resolve(config.root).replace(flipSlashExp,'/'),
  'i'
)
var tmpExp = /tmp/i


/**
 * Decide throttling of the progress messages
 * @param {object} progress
 * @param {boolean} force
 * @return {boolean}
 */
var progressThrottle = function(progress,force){
  var show = false
  var now = +(new Date())
  var lastUpdate = +progress.lastUpdate
  if(force) show = true
  if(!lastUpdate) show = true
  if(now > lastUpdate + progress.rate) show = true
  if(show){
    progress.lastUpdate = new Date()
    return true
  }
  return false
}


/**
 * Show the progress message
 * @param {object} progress
 * @param {boolean} force
 */
var progressMessage = function(progress,force){
  var duration = ((+new Date()) - progress.start) / 1000
  var fps = (progress.fileCount / (duration || 0.1)).toFixed(2)
  if(force || progressThrottle(progress,force)){
    logger.info(
      'Initial inventory read ' + progress.fileCount +
      ' files in ' + duration +
      ' seconds averaging ' + fps + '/fps'
    )
  }
}


/**
 * Process files
 * @param {object} progress
 * @param {string} data
 * @param {function} done
 * @return {void} fire escape
 */
var processFiles = function(progress,data,done){
  //replace any windows newlines
  var complete = function(err){
    if(err) logger.warning(err)
    progressMessage(progress,true)
    done(err)
  }
  data = data.replace(newLineExp,'\n')
  var lines = data
    .split('\n')
    .filter(function(item){return '' !== item})
    .map(function(val){
      return val.replace(flipSlashExp,'/').replace(rootExp,'')
    })
  if(0 === lines.length) return complete()
  async.eachLimit(
    lines,
    config.inventory.concurrency || os.cpus().length || 1,
    function(entry,next){
      //disqualify tmp
      if(entry.match(tmpExp)) return next()
      //inc counters and display progress
      progress.fileCount++
      //get the sha1 from the entry
      var sha1 = file.sha1FromPath(entry)
      if(40 === sha1.length){
        file.redisInsert(sha1,function(err){
          if(err){
            logger.warning(
              'Failed to read ' + sha1 + ' file ' +
              entry + ' ' + err
            )
          } else debug('inserted file',sha1)
          next()
        })
      } else {
        debug('file had invalid sha1',entry)
        logger.warning(
          'Failed to read file ' + entry + ' invalid sha1 returned: ' + sha1
        )
        next()
      }
    },
    complete
  )
}


/**
 * Run inventory
 * @param {function} done
 */
childOnce(
  'oose:inventory',
  function(done){
    if('function' !== typeof done) done = function(){}
    logger.info('Starting to build inventory')
    var progress = {
      start: +(new Date()),
      fileCount: 0,
      lastUpdate: 0,
      rate: 250
    }
    var buffer = ''
    var exitCode = 0
    var windows = 'win32' === process.platform
    var cp
    if(windows){
      debug('on windows')
      cp = childProcess.spawn('cmd',[
          '/c',
          'dir',
          '/a:-d',
          '/s',
          '/b',
          '/o:n'
        ],{cwd: config.root})
    }
    else{
      debug('on linux')
      cp = childProcess.spawn('find',[config.root,'-type','f'])
    }
    cp.on('error',function(err){
      debug('error',err)
      done(err)
    })
    var capture = through2(function(chunk,enc,next){
      debug('stdout',chunk.toString())
      buffer = buffer + chunk.toString()
      next(null,chunk)
    })
    var err = through2(function(chunk,enc,next){
      debug('stderr',chunk.toString())
      next(null,chunk)
    })
    cp.stderr.pipe(err)
    cp.on('close',function(code){
      debug('exited with code',code)
      exitCode = code
    })
    cp.stdout.on('readable',function(){
      var data = cp.stdout.read()
      if(data)
        buffer = buffer + data.toString()
    })
    cp.stdout.on('end',function(code){
      exitCode = code
      debug('done reading files',exitCode)
      processFiles(progress,buffer,function(err){
        logger.info('Inventory complete, read ' +
          (progress.fileCount ? progress.fileCount : 0) + ' files')
        done(err,progress.fileCount)
      })
    })
  }
)
