'use strict';
var debug = require('debug')('stretchfs:inventory')
var devNullStream = require('dev-null')
var fs = require('graceful-fs')
var hashStream = require('sha1-stream')
var mime = require('mime')
var promisePipe = require('promisepipe')

var couch = require('./couchbase')
var hashFile = require('./hashFile')
var logger = require('./logger')

var config = require('../config')

//open couch buckets
var couchInventory = couch.inventory()


/**
 * Create master inventory record
 * @param {string} hash
 * @param {string} extension
 * @return {P}
 */
exports.createMasterInventory = function(hash,extension){
  var inventoryKey = couch.schema.inventory(hash)
  var inventory = {
    hash: hash,
    mimeExtension: extension,
    map: [],
    desiredMap: [],
    hitCount: 0,
    hits: {},
    byteCount: 0,
    bytes: {},
    activityScore: 0,
    size: 0,
    copies: 0,
    desiredCopies: config.inventory.copiesOnWrite || 2,
    cacheCopies: [],
    rules: config.inventory.defaultRules,
    relativePath: hashFile.toRelativePath(hash,extension),
    lastBucketClear: new Date().toJSON(),
    lastBalancedAt: null,
    createdAt: new Date().toJSON(),
    updatedAt: new Date().toJSON()
  }
  return couchInventory.upsertAsync(inventoryKey,inventory,{cas: null})
}


/**
 * Create inventory record from the store level
 * @param {object} fileDetail
 * @param {object} verified
 * @return {P}
 */
exports.createStoreInventory = function(fileDetail,verified){
  if('undefined' === typeof verified) verified = false
  var inventoryKey = couch.schema.inventory(fileDetail.hash)
  var inventory = {value: {}, cas: null}
  return couchInventory.getAsync(inventoryKey)
    .then(
      function(result){
        inventory = result
        //update record
        if(!inventory.value.mimeExtension)
          inventory.value.mimeExtension = fileDetail.ext
        if(!inventory.value.mimeType)
          inventory.value.mimeType = mime.getType(fileDetail.ext)
        //update the map on the existing record
        var mapExists = false
        if(!inventory.value.map) inventory.value.map = []
        inventory.value.map.forEach(function(row){
          if(row === config.store.name) mapExists = true
        })
        if(!mapExists){
          inventory.value.map.push(config.store.name)
        }
        //metrics
        if(!inventory.value.size)
          inventory.value.size = fileDetail.stat.size
        inventory.value.copies = inventory.value.map.length
        if(!inventory.value.rules)
          inventory.value.rules = config.inventory.defaultRules
        if(!inventory.value.relativePath){
          inventory.value.relativePath = hashFile.toRelativePath(
            fileDetail.hash,fileDetail.ext
          )
        }
        inventory.value.updatedAt = new Date().toJSON()
      },
      function(err){
        if(13 !== err.code) throw err
        inventory.value = {
          hash: fileDetail.hash,
          mimeExtension: fileDetail.ext,
          mimeType: mime.getType(fileDetail.ext),
          map: [config.store.name],
          desiredMap: [config.store.name],
          size: fileDetail.stat.size,
          copies: 1,
          desiredCopies: config.inventory.copiesOnWrite || 2,
          cacheCopies: [],
          rules: config.inventory.defaultRules,
          relativePath: hashFile.toRelativePath(
            fileDetail.hash,fileDetail.ext
          ),
          createdAt: new Date().toJSON(),
          updatedAt: new Date().toJSON()
        }
      }
    )
    .then(function(){
      //set verification
      if(verified){
        inventory.value.verified = true
        inventory.value.verifiedAt = new Date().toJSON()
      }
      return couchInventory.upsertAsync(
        inventoryKey,inventory.value,{cas: inventory.cas})
    })
    .then(function(){
      //set key for compat
      inventory._id = inventoryKey
      return inventory
    })
    .catch(function(err){
      if(12 !== err.code) throw err
      return exports.createStoreInventory(fileDetail,verified)
    })
}


/**
 * Update store inventory
 * @param {object} fileDetail
 * @param {string} inventoryKey
 * @param {object} inventory
 * @param {string} verified
 * @return {P}
 */
exports.updateStoreInventory = function(
  fileDetail,inventoryKey,inventory,verified
){
  if('undefined' === typeof verified) verified = false
  if(verified){
    inventory.value.verifiedAt = new Date().toJSON()
    inventory.value.verified = true
  }
  //update the map on the existing record
  var mapExists = false
  if(!inventory.value.map) inventory.value.map = []
  inventory.value.map.forEach(function(row){
    if(row === config.store.name) mapExists = true
  })
  if(!mapExists){
    inventory.value.map.push(config.store.name)
  }
  //update record
  if(!inventory.value.mimeExtension)
    inventory.value.mimeExtension = fileDetail.ext
  if(!inventory.value.mimeType)
    inventory.value.mimeType = mime.getType(fileDetail.ext)
  if(!inventory.value.size)
    inventory.value.size = fileDetail.stat.size
  inventory.value.copies = inventory.value.map.length
  if(!inventory.value.relativePath){
    inventory.value.relativePath = hashFile.toRelativePath(
      fileDetail.hash,fileDetail.ext
    )
  }
  inventory.value.updatedAt = new Date().toJSON()
  return couchInventory.upsertAsync(
    inventoryKey,inventory.value,{cas: inventory.cas})
    .then(function(){
      inventory._id = inventoryKey
      return inventory
    })
    .catch(function(err){
      if(12 !== err.code) throw err
      return exports.updateStoreInventory(
        fileDetail,inventoryKey,inventory,verified)
    })
}


/**
 * Verify file on store
 * @param {object} fileDetail
 * @param {boolean} force
 * @return {P}
 */
exports.verifyFile = function(fileDetail,force){
  var sniffStream = {}
  var inventoryKey = ''
  var inventory = {}
  var verifySkipped = false
  var verifiedAt = +new Date()
  inventoryKey = couch.schema.inventory(fileDetail.hash)
  return couchInventory.getAsync(inventoryKey)
    .then(
      function(result){
        inventory = result.value
      },
      function(){}
    )
    .then(function(){
      //skip reading the file if possible
      if(!fileDetail.exists) return
      if(inventory && inventory.verifiedAt && false === force &&
        +new Date(inventory.verifiedAt) >
        (+new Date() - config.inventory.verifyExpiration)
      ){
        verifySkipped = true
        return
      }
      //at this point read the file and verify
      var readStream = fs.createReadStream(fileDetail.path)
      sniffStream = hashStream.createStream(fileDetail.type)
      var writeStream = devNullStream()
      return promisePipe(readStream,sniffStream,writeStream)
    })
    .then(function(){
      //validate the file, if it doesnt match remove it
      if(!fileDetail.exists){
        return couchInventory.removeAsync(inventoryKey)
          .catch(function(err){
            if(!err || !err.code || 13 !== err.code){
              logger.log('error',
                'Failed to delete inventory record for missing file ' +
                err.message)
              logger.log('error', err.stack)
            } else {
              throw new Error('File not found')
            }
          })
      } else if(!verifySkipped && sniffStream.hash !== fileDetail.hash){
        return hashFile.remove(fileDetail.hash)
          .then(function(){
            return couchInventory.removeAsync(inventoryKey)
          })
          .catch(function(){})
      } else if(!verifySkipped) {
        //here we should get the inventory record, update it or create it
        return couchInventory.getAsync(inventoryKey)
          .then(
            function(result){
              return exports.updateStoreInventory(
                fileDetail,inventoryKey,result,verifiedAt)
            },
            //record does not exist, create it
            function(err){
              if(!err || !err.code || 13 !== err.code) throw err
              return exports.createStoreInventory(fileDetail,verifiedAt)
            }
          )
      }
    })
    .then(function(){
      return {
        success: 'Verification complete',
        code: 200,
        status: verifySkipped ? 'ok' :
          (sniffStream.hash === fileDetail.hash ? 'ok' : 'fail'),
        expectedHash: fileDetail.hash,
        actualHash: verifySkipped ? fileDetail.hash : sniffStream.hash,
        verifySkipped: verifySkipped,
        verified: verifySkipped || sniffStream.hash === fileDetail.hash,
        verifiedAt: verifiedAt
      }
    })
    .catch(function(err){
      return {
        error: err.message || 'Verification failed',
        code: 'File not found' === err.message ? 404 : 500,
        message: err.message,
        err: err,
        status: verifySkipped ? 'ok' :
          (sniffStream.hash === fileDetail.hash ? 'ok' : 'fail'),
        expectedHash: fileDetail.hash,
        actualHash: verifySkipped ? fileDetail.hash : sniffStream.hash,
        verifySkipped: verifySkipped,
        verified: verifySkipped || sniffStream.hash === fileDetail.hash,
        verifiedAt: verifiedAt
      }
    })
}


/**
 * Inventory detail for store content/detail
 * @param {string} hash
 * @return {P}
 */
exports.detailStore = function(hash){
  var detail = {
    hash: '',
    mimeExtension: '.bin',
    mimeType: 'application/octet-stream',
    relativePath: '',
    prism: '',
    store: '',
    size: 0,
    hashDetail: {
      hash: '',
      ext: '',
      type: '',
      exists: false,
      stat: {
        dev: 0,
        mode: 0,
        nlink: 0,
        uid: 0,
        gid: 0,
        rdev: 0,
        blksize: 0,
        ino: 0,
        size: 0,
        blocks: 0,
        atime: null,
        mtime: null,
        ctime: null,
        birthtime: null
      }
    }
  }
  var inventoryKey = couch.schema.inventory(hash,config.store.name)
  return couchInventory.getAsync(inventoryKey)
    .then(function(result){
      var record = result.value
      if(!record) throw new Error('File not found')
      detail.hash = record.hash
      detail.mimeExtension = record.mimeExtension
      detail.mimeType = record.mimeType
      detail.relativePath = record.relativePath
      detail.prism = record.prism
      detail.store = record.store
      return hashFile.details(record.hash,record.ext)
    })
    .then(function(result){
      detail.hashDetail = result
      detail.size = detail.hashDetail.stat.size
      return detail
    })
}


/**
 * Remove store inventory record
 * @param {string} hash
 * @return {P}
 */
exports.removeStoreInventory = function(hash){
  var inventoryKey = couch.schema.inventory(hash)
  var inventory = {}
  return couchInventory.getAsync(inventoryKey)
    .then(function(result){
      inventory = result
      //remove the file
      return hashFile.remove(
        inventory.value.hash,inventory.value.mimeExtension)
    })
    .then(function(){
      //remove ourselves from the map
      inventory.value.map = inventory.value.map.filter(function(row){
        return row !== config.store.name
      })
      //reset the copy count
      inventory.value.copies = inventory.value.map.length
      if(0 === inventory.value.copies){
        if(!config.inventory.keepDeadRecords){
          //if there are no more copies remove the master
          return couchInventory.removeAsync(inventoryKey)
        } else {
          //keep a ghost record of the old inventory
          inventory.value.map = []
          inventory.value.copies = 0
          inventory.value.verified = false
          inventory.value.verifiedAt = null
          inventory.value.removedAt = new Date().toJSON()
          return couchInventory.upsertAsync(
            inventoryKey,inventory.value,{cas: inventory.cas})
        }
      } else {
        //update inventory record
        return couchInventory.upsertAsync(
          inventoryKey,inventory.value,{cas: inventory.cas})
      }
    })
    .catch(function(err){
      if(12 === err.code){
        return exports.removeStoreInventory(hash)
      } else if(13 === err.code){
        debug('removal failed file not found server',err)
      } else if('File not found' === err.message){
        debug('removal failed file not found client',err)
      } else {
        debug('removal failed unknown',err)
        throw err
      }
    })
}
