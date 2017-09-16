'use strict';
var P = require('bluebird')
var debug = require('debug')('oose:store:inventory')
var fs = require('graceful-fs')
var mime = require('mime')
var path = require('path')
var readdirp = require('readdirp')

var couchdb = require('../couchbase')
var logger = require('../logger')

var config = require('../../config')


/**
 * Scan Store Inventory
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
  var stream = readdirp({root: contentFolder, fileFilter: '*.*'})
  stream.on('data',function(entry){
    debug('got a hit',entry)
    debug('pausing stream for processing')
    stream.pause()
    var filePath = entry.fullPath
    var relativePath = entry.path
    var linkPath = filePath.replace(/\..+$/,'')
    var stat = entry.stat
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
      stream.resume()
    }
    //otherwise try and insert them into inventory if they are not already
    //there
    else {
      counter.valid++
      debug(hash,'inventory scan found',ext,relativePath,linkPath)
      //since nodes
      var inventoryKey = couchdb.schema.inventory(
        hash,config.store.prism,config.store.name)
      couchdb.inventory.getAsync(inventoryKey)
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
            return couchdb.inventory.upsertAsync(inventoryKey,doc)
          }
        )
        .then(function(){
          debug(hash,'inventory updated')
          //throttle the inventory
          return miniSleep(config.store.inventoryThrottle)
        })
        .catch(function(err){
          logger.log('error', hash + ' insertion FAILED ' + err.message)
          logger.log('error', err.stack)
        })
        .finally(function(){
          debug(hash,'record scan complete, resuming stream')
          stream.resume()
        })
    }
  })
  stream.on('error',function(err){
    done(err)
  })
  stream.on('warn',function(err){
    logger.log('error', 'readdirp warning: ' + err.message)
    logger.log('error', err.stack)
  })
  stream.on('end',function(){
    done(null,counter)
  })
}
