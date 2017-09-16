'use strict';
var P = require('bluebird')
var debug = require('debug')('oose:store:inventory')
var cp = require('child_process')
var fs = require('graceful-fs')
var mime = require('mime')
var path = require('path')
var ProgressBar = require('progress')

var couch = require('../couchbase')
var logger = require('../logger')

var config = require('../../config')


/**
 * Scan Store Inventory
 *  This aims to be a much more efficient high performance native unix driver
 *  that will work much better in production environments. It will lean on the
 *  advantages of the unix file command and stream that output rather than using
 *  the node implementation of readdirp.
 * @param {function} done
 */
module.exports = function(done){
  var root = path.resolve(config.root)
  if(!fs.existsSync(root))
    throw new Error('Root folder does not exist')

  var contentFolder = path.resolve(root + '/content')

  if(!fs.existsSync(contentFolder))
    throw new Error('Content folder does not exist')


  /**
   * Stat counters
   * @type {{warning: number, error: number, removed: number, valid: number}}
   */
  var counter = {
    warning: 0,
    error: 0,
    invalid: 0,
    valid: 0,
    created: 0,
    updated: 0,
    bytes: 0,
    bytesReceived: 0,
    repaired: 0
  }


  /**
   * Sleep with a promise
   * @param {number} sleepTime
   * @return {P}
   */
  var miniSleep = function(sleepTime){
    return new P(function(resolve){
      setTimeout(function(){
        resolve()
      },+sleepTime)
    })
  }
  debug('starting to scan',contentFolder)
  var buffer = ''
  var cmd = cp.spawn(
    'find',
    [contentFolder,'-type','f'],
    {
      cwd: '/',
      maxBuffer: 4294967296,
      stdio: ['pipe','pipe',process.stderr]
    }
  )
  cmd.stdout.on('data',function(chunk){
    counter.bytesReceived = counter.bytesReceived + chunk.length
    process.stdout.write('Receiving from find ' +
      (counter.bytesReceived / 1024).toFixed(0) + 'kb\r')
    buffer = buffer + '' + chunk.toString()
  })
  cmd.on('close',function(code){
    //clear to a new line now that the data print is done
    process.stdout.write('\n')
    if(code > 0) return done(new Error('Find failed with code ' + code))
    debug('finished find, splitting and starting processing')
    var fileCount = 0
    var progress
    P.try(function(){
      var lines = buffer
        .split('\n')
        .filter(function(item){return '' !== item})
        .map(function(val){
          return path.resolve(val)
        })
      fileCount = lines.length
      logger.log('info', 'Parsed find result into ' + fileCount + ' files')
      progress = new ProgressBar(
        '  scanning [:bar] :current/:total :percent :rate/fps :etas',
        {
          total: fileCount,
          width: 50,
          complete: '=',
          incomplete: '-'
        }
      )
      return lines
    })
    .map(function(filePath){
      filePath = path.posix.resolve(filePath)
      debug('got a hit',filePath)
      var relativePath = path.posix.relative(contentFolder,filePath)
      var linkPath = filePath.replace(/\..+$/,'')
      var stat = fs.statSync(filePath)
      counter.bytes += stat.size
      if(!fs.existsSync(linkPath)){
        counter.repaired++
        debug('repaired link path for',filePath)
        fs.symlinkSync(filePath,linkPath)
      }
      var ext = relativePath.match(/\.(.+)$/)[0]
      var hash = relativePath.replace(/[\\\/]/g,'').replace(/\..+$/,'')
      //skip invalid inventory entries
      if(!hash.match(/^[a-f0-9]{40}$/i)){
        counter.invalid++
        debug(hash,'invalid, resuming stream')
      }
      //otherwise try and insert them into inventory if they are not already
      //there
      else {
        counter.valid++
        debug(hash,'inventory scan found',ext,relativePath,linkPath)
        //since nodes
        var inventoryKey = couch.schema.inventory(
          hash,config.store.prism,config.store.name)
        return couch.inventory.getAsync(inventoryKey)
          .then(
            function(doc){
              debug(hash,'inventory record exists',doc)
            },
            function(err){
              //make sure we only catch 404s and let others bubble
              if(404 !== err.statusCode) throw err
              var doc = {
                store: config.store.name,
                prism: config.store.prism,
                hash: hash,
                mimeExtension: ext,
                mimeType: mime.lookup(ext),
                relativePath: relativePath
              }
              debug(hash,'creating inventory record',doc)
              counter.created++
              return couch.inventory.upsertAsync(inventoryKey,doc)
            }
          )
          .then(function(){
            debug(hash,'inventory updated')
            //sleep the inventory scan
            return miniSleep(config.store.inventoryThrottle)
          })
          .catch(function(err){
            logger.log('error', hash + ' insertion FAILED ' + err.message)
            logger.log('error', err.stack)
            logger.log('error',err)
          })
          .finally(function(){
            progress.tick(1)
          })
      }
    },{concurrency: config.store.inventoryConcurrency})
    .then(function(){
      done(null,counter)
    })
    .catch(function(err){
      logger.log('error', 'file process error' + err)
      done(err)
    })
  })
}
