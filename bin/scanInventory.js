'use strict';
var P = require('bluebird')
var debug = require('debug')('oose:store:inventory')
var fs = require('graceful-fs')
var infant = require('infant')
var os = require('os')
var prettyBytes = require('pretty-bytes')

var config = require('../config')
var logger = require('../helpers/logger')

var interval

//make some promises
P.promisifyAll(fs)

//determine inventory driver
var scanInventory
if(os.platform().match(/(darwin|linux|freebsd|sunos)/i)){
  //this is the high performance unix driver that uses find
  scanInventory = require('../helpers/inventory/unix.js')
} else {
  //the native drive will work everywhere and is perfect for small to mid
  //size installations and development
  scanInventory = require('../helpers/inventory/native.js')
}

//make the function a promise
var scanInventoryAsync = P.promisify(scanInventory)


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
    'oose:' + config.store.name + ':scanInventory',
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

