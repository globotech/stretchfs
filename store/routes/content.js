'use strict';
var P = require('bluebird')
var debug = require('debug')('oose:store:content')
var devNullStream = require('dev-null')
var fs = require('graceful-fs')
var mime = require('mime')
var mkdirp = require('mkdirp-then')
var path = require('path')
var promisePipe = require('promisepipe')
var hashStream = require('sha1-stream')
var requestStats = require('request-stats')

var api = require('../../helpers/api')
var couch = require('../../helpers/couchbase')
var redis = require('../../helpers/redis')()
var logger = require('../../helpers/logger')
var hashFile = require('../../helpers/hashFile')
var purchasedb = require('../../helpers/purchasedb')

var config = require('../../config')

var rootFolder = path.resolve(config.root)
var contentFolder = path.resolve(rootFolder + '/content')

//open couch buckets
var ooseInventory = couch.inventory()
var oosePeer = couch.peer()

//make some promises
P.promisifyAll(fs)

var createInventory = function(fileDetail,verified){
  if('undefined' === typeof verified) verified = false
  var inventoryKey = couch.schema.inventory(fileDetail.hash)
  var subInventoryKey = couch.schema.inventory(
    fileDetail.hash,
    config.store.prism,
    config.store.name
  )
  var inventory = {value: {}, cas: null}
  var subInventory = {value: {}, cas: null}
  return ooseInventory.getAsync(inventoryKey)
    .then(
      function(result){
        inventory = result
        //update the map on the existing record
        var mapExists = false
        if(!inventory.value.map) inventory.value.map = []
        inventory.value.map.forEach(function(row){
          if(
            row.prism === config.store.prism &&
            row.store === config.store.name
          ){
            mapExists = true
          }
        })
        if(!mapExists){
          inventory.value.map.push({
            prism: config.store.prism,
            store: config.store.name
          })
        }
        //update record
        if(!inventory.value.mimeExtension)
          inventory.value.mimeExtension = fileDetail.ext
        if(!inventory.value.mimeType)
          inventory.value.mimeType = mime.getType(fileDetail.ext)
        if(!inventory.value.relativePath){
          inventory.value.relativePath = hashFile.toRelativePath(
            fileDetail.hash,fileDetail.ext
          )
        }
        if(!inventory.value.minCount)
          inventory.value.minCount = config.inventory.defaultMinCount || 2
        if(!inventory.value.desiredCount){
          inventory.valuu.desiredCount =
            config.inventory.defaultDesiredCount || 2
        }
        inventory.value.count = inventory.value.map.length
        if(!inventory.value.size)
          inventory.value.size = fileDetail.stat.size
        inventory.value.updatedAt = new Date().toJSON()
      },
      function(err){
        if(13 !== err.code) throw err
        inventory.value = {
          hash: fileDetail.hash,
          mimeExtension: fileDetail.ext,
          mimeType: mime.getType(fileDetail.ext),
          relativePath: hashFile.toRelativePath(
            fileDetail.hash,fileDetail.ext
          ),
          size: fileDetail.stat.size,
          count: 1,
          minCount: config.inventory.defaultMinCount || 2,
          desiredCount: config.inventory.defaultDesiredCount || 2,
          map: [
            {prism: config.store.prism, store: config.store.name}
          ],
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
      //setup sub record
      subInventory.value = {
        prism: config.store.prism,
        store: config.store.name,
        relativePath: hashFile.toRelativePath(
          fileDetail.hash,fileDetail.ext
        ),
        hitCount: 0,
        byteCount: 0,
        lastCounterClear: new Date().toJSON(),
        createdAt: new Date().toJSON(),
        updatedAt: new Date().toJSON()
      }
      return ooseInventory.upsertAsync(
        subInventoryKey,subInventory.value,{cas: subInventory.cas})
    })
    .then(function(){
      return ooseInventory.upsertAsync(
        inventoryKey,inventory.value,{cas: inventory.cas})
    })
    .then(function(){
      //set key for compat
      inventory._id = inventoryKey
      return inventory
    })
    .catch(function(err){
      if(12 !== err.code) throw err
      return createInventory(fileDetail,verified)
    })
}

var updateSubInventory = function(fileDetail,inventoryKey,inventory,verified){
  if('undefined' === typeof verified) verified = false
  if(verified){
    inventory.value.verifiedAt = new Date().toJSON()
    inventory.value.verified = true
  }
  //update the map on the existing record
  var mapExists = false
  if(!inventory.value.map) inventory.value.map = []
  inventory.value.map.forEach(function(row){
    if(
      row.prism === config.store.prism &&
      row.store === config.store.name
    ){
      mapExists = true
    }
  })
  if(!mapExists){
    inventory.value.map.push({
      prism: config.store.prism,
      store: config.store.name
    })
  }
  //update record
  if(!inventory.value.mimeExtension)
    inventory.value.mimeExtension = fileDetail.ext
  if(!inventory.value.mimeType)
    inventory.value.mimeType = mime.getType(fileDetail.ext)
  if(!inventory.value.relativePath){
    inventory.value.relativePath = hashFile.toRelativePath(
      fileDetail.hash,fileDetail.ext
    )
  }
  inventory.value.count = inventory.value.map.length
  if(!inventory.value.size)
    inventory.value.size = fileDetail.stat.size
  inventory.value.updatedAt = new Date().toJSON()
  return ooseInventory.upsertAsync(
    inventoryKey,inventory.value,{cas: inventory.cas})
    .then(function(){
      inventory._id = inventoryKey
      return inventory
    })
}

var verifyFile = function(fileDetail,force){
  var sniffStream = {}
  var inventoryKey = ''
  var inventory = {}
  var verifySkipped = false
  var verifiedAt = +new Date()
  inventoryKey = couch.schema.inventory(
    fileDetail.hash,
    config.store.prism,
    config.store.name
  )
  return ooseInventory.getAsync(inventoryKey)
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
        (+new Date() - config.store.verifyExpiration)
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
        return ooseInventory.removeAsync(inventoryKey)
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
            return ooseInventory.removeAsync(inventoryKey)
          })
          .catch(function(){})
      } else if(!verifySkipped) {
        //here we should get the inventory record, update it or create it
        return ooseInventory.getAsync(inventoryKey)
          .then(
            function(result){
              return updateSubInventory(
                fileDetail,inventoryKey,result,verifiedAt)
            },
            //record does not exist, create it
            function(err){
              if(!err || !err.code || 13 !== err.code) throw err
              return createInventory(fileDetail,verifiedAt)
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
 * Put file
 * @param {object} req
 * @param {object} res
 */
exports.put = function(req,res){
  redis.incr(redis.schema.counter('store','content:put'))
  redis.incr(redis.schema.counter('store','content:filesUploaded'))
  var file = req.params.file
  var ext = file.split('.')[1]
  var expectedHash = path.basename(file,path.extname(file))
  var hashType = req.params.hashType || config.defaultHashType || 'sha1'
  var fileDetail = {}
  debug('got new put',file)
  var sniff = hashStream.createStream(hashType)
  var inventoryKey
  sniff.on('data',function(chunk){
    redis.incrby(
      redis.schema.counter('store','content:bytesUploaded'),chunk.length)
  })
  var dest
  hashFile.details(expectedHash,ext)
    .then(function(result){
      fileDetail = result
      fileDetail.ext = ext
      inventoryKey = couch.schema.inventory(
        fileDetail.hash,config.store.prism,config.store.name)
      dest = hashFile.toPath(fileDetail.hash,fileDetail.ext)
      debug(fileDetail.hash,dest)
      return mkdirp(path.dirname(dest))
    })
    .then(function(){
      debug(inventoryKey,'waiting for stream to complete')
      var writeStream = fs.createWriteStream(dest)
      return promisePipe(req,sniff,writeStream)
        .then(
          function(val){return val},
          function(err){throw new Error(err.message)}
        )
    })
    .then(function(){
      if(sniff.hash !== fileDetail.hash){
        fs.unlinkSync(dest)
        throw new Error('Checksum mismatch')
      }
      //get updated file details
      return hashFile.details(sniff.hash,ext)
    })
    .then(function(result){
      fileDetail = result
      //get existing existence record and add to it or create one
      debug('creating inventory record')
      return createInventory(fileDetail)
    })
    .then(function(){
      res.status(201)
      res.json({hash: sniff.hash})
    })
    .catch(function(err){
      logger.log('error', 'Failed to upload content ' + err.message)
      logger.log('error', err.stack)
      fs.unlinkSync(dest)
      return ooseInventory.removeAsync(inventoryKey)
        .then(function(){
          redis.incr(redis.schema.counterError('store','content:put'))
          res.status(500)
          res.json({error: err})
        })
        .catch(function(err){
          logger.log('error', 'Failed to clean up broken inventory record ' +
            err.message)
          logger.log('error', err.stack)
        })
    })
}


/**
 * Download content
 * @param {object} req
 * @param {object} res
 */
exports.download = function(req,res){
  redis.incr(redis.schema.counter('store','content:download'))
  var inventory
  ooseInventory.getAsync(req.body.hash)
    .then(function(result){
      inventory = result.value
      var filePath = path.join(contentFolder,inventory.relativePath)
      //occupy slot on peer
      redis.sadd(redis.schema.peerSlot(),req.ip + ':' + inventory.hash)
      //update hits
      redis.incr(redis.schema.inventoryStat(inventory.hash,'hit'))
      //add to stat collection
      redis.sadd(redis.schema.inventoryStatCollect(),inventory.hash)
      //register to track bytes sent
      var inventoryByteKey = redis.schema.inventoryStat(inventory.hash,'byte')
      requestStats(req,res,function(stat){
        redis.incrby(inventoryByteKey,stat.res.bytes)
        redis.srem(redis.schema.peerSlot(),req.ip + ':' + inventory.hash)
      })
      res.sendFile(filePath)
    })
    .catch(function(err){
      if(13 === err.code){
        redis.incr(
          redis.schema.counterError('store','content:download:notFound'))
        res.status(404)
        res.json({error: err.message})
      } else {
        res.status(500)
        redis.incr(redis.schema.counterError('store','content:download'))
        res.json({message: err.message, error: err})
      }
    })
}


/**
 * Content exists
 * @param {object} req
 * @param {object} res
 */
exports.exists = function(req,res){
  redis.incr(redis.schema.counter('store','content:exists'))
  var hash = req.body.hash
  var ext = req.body.ext
  var singular = !(hash instanceof Array)
  if(singular) hash = [hash + '.' + ext]
  var promises = []
  var hashParts = []
  for(var i = 0; i < hash.length; i++){
    hashParts = hash[i].split('.')
    if(!hashParts) hashParts = [hash[i],'']
    promises.push(hashFile.find(hashParts[0],hashParts[1]))
  }
  P.all(promises)
    .then(function(result){
      var exists = {}
      for(var i = 0; i < hash.length; i++){
        exists[result[i].hash] = {
          exists: result[i].exists,
          ext: result[i].ext
        }
      }
      if(singular){
        res.json({exists: exists[hash[0].split('.')[0]]})
      } else {
        res.json(exists)
      }
    })
}


/**
 * Content remove
 * @param {object} req
 * @param {object} res
 */
exports.remove = function(req,res){
  redis.incr(redis.schema.counter('store','content:remove'))
  var hash = req.body.hash
  var inventoryKey = couch.schema.inventory(hash)
  var subInventoryKey = couch.schema.inventory(
    hash,config.store.prism,config.store.name)
  var fileDetail = {}
  var inventory = {}
  ooseInventory.getAndLockAsync(inventoryKey)
    .then(function(result){
      inventory = result
      //remove the file
      return hashFile.remove(
        inventory.value.hash,inventory.value.mimeExtension)
    })
    .catch(function(err){
      if(13 !== err.code) throw err
      debug('file removal failed',err)
    })
    .then(function(){
      //remove ourselves from the map
      var map = []
      inventory.value.map.forEach(function(row){
        if(row.prism === config.store.prism && row.store === config.store.name){
          return
        }
        map.push(row)
      })
      inventory.value.map = map
      //reset the count
      inventory.value.count = inventory.value.map.length
      if(0 === inventory.value.count){
        if(!config.inventory.keepDeadRecords){
          //if there are no more copies remove the master
          return ooseInventory.removeAsync(inventoryKey)
        } else {
          //keep a ghost record of the old inventory
          inventory.value.map = []
          inventory.value.count = 0
          inventory.value.verified = false
          inventory.value.verifiedAt = null
          inventory.value.removedAt = new Date().toJSON()
          return ooseInventory.upsertAsync(
            inventoryKey,inventory.value,{cas: inventory.cas})
        }
      }
      else{
        //update inventory record
        return ooseInventory.upsertAsync(
          inventoryKey,inventory.value,{cas: inventory.cas})
      }
    })
    .catch(function(err){
      if(13 !== err.code) throw err
      debug('update failed',err)
    })
    .then(function(){
      //now remove the sub record
      return ooseInventory.removeAsync(subInventoryKey)
    })
    .catch(function(err){
      if(13 !== err.code) throw err
      debug('subrecord removal failed',err)
    })
    .then(function(){
      res.json({
        success: 'File removed',
        fileDetail: fileDetail
      })
    })
    .catch(function(err){
      if(13 === err.code){
        redis.incr(redis.schema.counterError('store','content:remove:notFound'))
        res.status(404)
        res.json({error: err.message})
      } else {
        redis.incr(redis.schema.counterError('store','content:remove'))
        res.json({error: err.message, err: err})
      }
    })
}


/**
 * Get detail about a hash
 * @param {object} req
 * @param {object} res
 */
exports.detail = function(req,res){
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
  var hash = req.body.hash
  var inventoryKey = couch.schema.inventory(
    hash,config.store.prism,config.store.name)
  ooseInventory.getAsync(inventoryKey)
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
      res.json(detail)
    })
    .catch(function(err){
      if('File not found' === err.message){
        res.status(404)
        res.json({error: 'File not status', code: 404})
      } else{
        res.status(500)
        res.json({error: 'An uknown error occurred',message: err.message})
        logger.log('error', err.message)
        logger.log('error', err.stack)
      }
    })
}


/**
 * Verify the integrity of a file, invalids are removed immediately
 * @param {object} req
 * @param {object} res
 */
exports.verify = function(req,res){
  var file = req.body.file
  var hash = hashFile.fromPath(file)
  var ext = file.split('.')[1]
  var force = req.body.force || false
  var fileDetail = {}
  hashFile.details(hash,ext)
    .then(function(result){
      fileDetail = result
      return verifyFile(fileDetail,force)
    })
    .then(function(data){
      res.status(data.code || 200)
      res.json(data)
    })
    .catch(function(err){
      if('File not found' === err.message){
        res.status(404)
        res.json({
          error: 'File not found'
        })
      } else {
        logger.log('error', 'File verification failed  '+ err.message)
        logger.log('error', err.stack)
        res.status(500)
        res.json({
          error: err.message,
          stack: err.stack
        })
      }
    })
}


/**
 * Content send (to another store)
 * @param {object} req
 * @param {object} res
 */
exports.send = function(req,res){
  var file = req.body.file
  var hash = hashFile.fromPath(file)
  var ext = file.split('.')[1]
  var nameParts = req.body.store.split(':')
  var storeKey = couch.schema.store(nameParts[0],nameParts[1])
  var storeClient = null
  var store = {}
  var fileDetail = {}
  var verifyDetail = {}
  oosePeer.getAsync(storeKey)
    .then(
      function(result){
        store = result.value
        storeClient = api.setupAccess('store',store)
      },
      function(err){
        if(!err || !err.code || 13 !== err.code) throw err
        throw new Error('Store not found')
      }
    )
    .then(function(){
      return hashFile.details(hash,ext)
    })
    .then(function(result){
      fileDetail = result
      return verifyFile(fileDetail)
    })
    .then(function(result){
      verifyDetail = result
      if('ok' !== result.status){
        throw new Error('Verify failed')
      }
      var rs = fs.createReadStream(
        hashFile.toPath(fileDetail.hash,fileDetail.ext))
      return promisePipe(
        rs,
        storeClient.put({url: storeClient.url('/content/put/' + file)})
      )
    })
    .then(function(){
      res.json({
        success: 'Clone sent',
        file: file,
        store: store,
        fileDetail: fileDetail,
        verifyDetail: verifyDetail
      })
    })
    .catch(function(err){
      logger.log('error', err.message)
      logger.log('error', err.stack)
      res.json({
        error: 'Failed to send clone ' + err.message,
        err: err,
        stack: err.stack,
        file: file,
        store: store,
        details: fileDetail
      })
    })
}


/**
 * Send static files
 * @param {object} req
 * @param {object} res
 */
exports.static = function(req,res){
  //to send static files we have to locate our inventory record
  //then we must send it, that simple dont overthink it
  var hash = req.params.hash
  debug('STATIC','got file static request',hash)
  var inventoryKey = couch.schema.inventory(
    hash,
    config.store.prism,
    config.store.name
  )
  debug('STATIC','checking for inventory',inventoryKey)
  ooseInventory.getAsync(inventoryKey)
    .then(function(result){
      var inventory = result.value
      debug('STATIC','got file inventory, sending content',inventory)
      if(req.query.attach){
        res.header(
          'Content-Disposition',
          'attachment; filename=' + req.query.attach
        )
      }
      var filePath = path.join(contentFolder,inventory.relativePath)
      //occupy slot on peer
      redis.sadd(redis.schema.peerSlot(),req.ip + ':' + hash)
      //update hits
      redis.incr(redis.schema.inventoryStat(hash,'hit'))
      //add to stat collection
      redis.sadd(redis.schema.inventoryStatCollect(),hash)
      //register to track bytes sent
      var inventoryByteKey = redis.schema.inventoryStat(hash,'byte')
      requestStats(req,res,function(stat){
        redis.incrby(inventoryByteKey,stat.res.bytes)
        redis.srem(redis.schema.peerSlot(),req.ip + ':' + hash)
      })
      //send file
      res.sendFile(filePath)
    })
    .catch(function(err){
      if(!err || !err.code || 13 !== err.code) throw err
      res.status(404)
      res.send('404 Not Found')
    })
}


/**
 * Play files with purchases
 * @param {object} req
 * @param {object} res
 */
exports.play = function(req,res){
  var token = req.params.token
  var purchaseUri = ''
  var purchase = {}
  var inventory = {}
  debug('PLAY','got play request',token)
  purchasedb.get(token)
    .then(
      //continue with purchase
      function(result){
        debug('PLAY','got purchase result',token,result)
        purchase = result
        //get inventory
        return ooseInventory.getAsync(couch.schema.inventory(
          purchase.hash,
          config.store.prism,
          config.store.name
        ))
      },
      //purchase not found
      function(err){
        debug('PLAY','no purchase found',token,err.message)
        if(!err || !err.code || 13 !== err.code) throw err
        return false
      }
    )
    .then(function(result){
      result = result.value
      debug('PLAY','got inventory result',token,result)
      inventory = result
      if(inventory && purchase &&
        purchase.expirationDate >= (+new Date())
      )
      {
        purchaseUri = path.join(contentFolder,inventory.relativePath)
      }
      else{
        purchaseUri = '/404'
      }
      debug('PLAY','figured purchase URI',token,purchaseUri)
      return purchaseUri
    })
    .then(function(result){
      debug('PLAY','got play result',result)
      if('/404' === result){
        res.status(404)
        res.send('404 Not Found')
      }
      else if('/403' === result){
        res.status(403)
        res.send('403 Forbidden')
      } else if('/500' === result){
        res.status(500)
        res.send('500 Internal Server Error')
      } else{
        if(req.query.attach){
          res.header(
            'Content-Disposition',
            'attachment; filename=' + req.query.attach
          )
        }
        //occupy slot on peer
        redis.sadd(redis.schema.peerSlot(),
          req.ip + ':' + inventory.hash + ':' + token)
        //update hits
        redis.incr(redis.schema.inventoryStat(purchase.hash,'hit'))
        redis.incr(redis.schema.purchaseStat(token,'hit'))
        //add to stat collection
        redis.sadd(redis.schema.inventoryStatCollect(),purchase.hash)
        redis.sadd(redis.schema.purchaseStatCollect(),token)
        //register to track bytes sent
        var inventoryByteKey = redis.schema.inventoryStat(purchase.hash,'byte')
        var purchaseByteKey = redis.schema.purchaseStat(token,'byte')
        requestStats(req,res,function(stat){
          redis.incrby(purchaseByteKey,stat.res.bytes)
          redis.incrby(inventoryByteKey,stat.res.bytes)
          redis.srem(redis.schema.peerSlot(),
            req.ip + ':' + inventory.hash + ':' +token)
        })
        //send file
        res.sendFile(purchaseUri)
      }
    })
}
