'use strict';
var P = require('bluebird')
var debug = require('debug')('oose:store:inventory')
var fs = require('graceful-fs')
var infant = require('infant')
var path = require('path')
var ProgressBar = require('progress')

var config = require('../config')
var couchdb = require('../helpers/couchbase')
var logger = require('../helpers/logger')

//make some promises
P.promisifyAll(fs)


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
  return couchdb.inventory.viewAsync('inventory/byStore',{
    startkey: [config.store.name],
    endkey: [config.store.name,'\uffff']
  })
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
        .map(function(result){
          progress.tick()
          var record = result.value
          var filePath = path.posix.resolve(contentFolder,record.relativePath)
          //check if file path exists
          if(fs.existsSync(filePath)){
            counter.valid++
          } else {
            counter.invalid++
            return couchdb.inventory.destroyAsync(record._id,record._rev)
              .catch(function(){
                counter.warning++
              })
          }
        })
    })
    .then(function(){
      return counter
    })
}


/**
 * Run the inventory scan
 * @param {function} done
 */
var runInterval = function(done){
  logger.log('info', 'Starting to verify store inventory with remote')
  var scanStart = +new Date()
  var scanEnd = scanStart + 1000
  var duration = 0
  verifyInventoryAsync()
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
      logger.log('error', err.stack)
      logger.log('error', 'Inventory Verification Error: ' + err.message)
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
    'oose:' + config.store.name + ':verifyInventory',
    function(done){
      //do immediate scan
      runInterval(done)
    },
    function(done){
      process.nextTick(done)
      process.exit(0)
    }
  )
}

