'use strict';
var P = require('bluebird')
var debug = require('debug')('stretchfs:store:inventory')
var fs = require('graceful-fs')
var infant = require('infant')
var os = require('os')
var path = require('path')
var prettyBytes = require('pretty-bytes')
var ProgressBar = require('progress')

var couch = require('../../helpers/couchbase')
var inventoryHelper = require('../../helpers/inventory')
var logger = require('../../helpers/logger')

var config = require('../../config')

var interval

//open some buckets
var cb = couch.stretchfs()

//make some promises
P.promisifyAll(fs)

//determine inventory driver
var scanInventory
if(os.platform().match(/(darwin|linux|freebsd|sunos)/i)){
  //this is the high performance unix driver that uses find
  scanInventory = require('../../helpers/inventoryScanUnix.js')
} else {
  //the native drive will work everywhere and is perfect for small to mid
  //size installations and development
  scanInventory = require('../../helpers/inventoryScanNative.js')
}

//make the function a promise
var scanInventoryAsync = P.promisify(scanInventory)


//make the function a promise
var verifyInventoryAsync = function(){
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
    valid: 0
  }
  debug('starting to verify',contentFolder)
  var qstring = 'SELECT META().id AS _id, ' +
    couch.getName(couch.type.stretchfs) + '.* FROM ' +
    couch.getName(couch.type.stretchfs) + ' WHERE ARRAY_CONTAINS(`map`,$1)'
  var query = couch.N1Query.fromString(qstring)
  query.consistency(couch.N1Query.Consistency.REQUEST_PLUS)
  return cb.queryAsync(query,[config.store.name])
    .then(function(result){
      var fileCount = result.length
      var progress = new ProgressBar(
        '  scanning [:bar] :current/:total :percent :rate/fps :etas',
        {
          total: fileCount,
          width: 50,
          complete: '=',
          incomplete: '-'
        }
      )
      return P.try(function(){return result})
        .map(function(record){
          progress.tick()
          //check if file path exists
          if(!record || !record.relativePath ||
            !fs.existsSync(path.resolve(
              contentFolder,record.relativePath))
          ){
            counter.invalid++
            if(!record) return
            return inventoryHelper.removeStoreInventory(record.hash)
              .catch(function(){
                counter.warning++
              })
          } else {
            counter.valid++
          }
        })
    })
    .then(function(){
      couch.disconnect()
      return counter
    })
}


/**
 * Run the inventory scan
 * @param {function} done
 */
var runInterval = function(done){
  logger.log('info', 'Starting to examine store inventory')
  var scanStart = +new Date()
  var scanEnd = scanStart + 1000
  var duration = 0
  scanInventoryAsync()
    .then(function(counter){
      scanEnd = +new Date()
      duration = ((scanEnd - scanStart) / 1000).toFixed(2)
      logger.log('info', 'Inventory scan complete in ' + duration + ' seconds')
      logger.log('info', '  ' +
        counter.valid + ' valid ' +
        prettyBytes(counter.bytes) + ' ' +
        counter.created + ' created ' +
        counter.updated + ' updated ' +
        counter.repaired + ' repaired ' +
        counter.invalid + ' invalid ' +
        counter.warning + ' warnings ' +
        counter.error + ' errors'
      )
    })
    .then(function(){
      return verifyInventoryAsync()
    })
    .then(function(counter){
      scanEnd = +new Date()
      duration = ((scanEnd - scanStart) / 1000).toFixed(2)
      logger.log('info', 'Inventory verification complete in ' +
        duration + ' seconds')
      logger.log('info', '  ' +
        counter.valid + ' valid ' +
        counter.invalid + ' invalid ' +
        counter.warning + ' warnings ' +
        counter.error + ' errors'
      )
    })
    .catch(function(err){
      logger.log('error',err.stack)
      logger.log('error', 'Inventory Scan Error: ' + err.message)
    })
    .finally(function(){
      //register the next run semi randomly to try and percolate the inventory
      //scans to run apart from each other to stop the mini dos on g322
      //var timeToNextRun = (duration * random.integer(1,50)) * 1000
      //setTimeout(runInterval,timeToNextRun)
      done()
      process.exit()
    })
}

if(require.main === module){
  infant.child(
    'stretchfs:' + config.store.name + ':scanInventory',
    function(done){
      //do immediate scan
      runInterval(done)
    },
    function(done){
      clearInterval(interval)
      debug('cleared inventory interval')
      process.nextTick(done)
      process.exit(0)
    }
  )
}

