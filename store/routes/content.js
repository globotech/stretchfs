'use strict';
var P = require('bluebird')
var debug = require('debug')('stretchfs:store:content')
var devZeroStream = require('dev-zero-stream')
var fs = require('graceful-fs')
var mkdirp = require('mkdirp-then')
var path = require('path')
var promisePipe = require('promisepipe')
var hashStream = require('sha1-stream')
var requestStats = require('request-stats')

var api = require('../../helpers/api')
var couch = require('../../helpers/couchbase')
var inventory = require('../../helpers/inventory')
var logger = require('../../helpers/logger')
var hashFile = require('../../helpers/hashFile')
var purchasedb = require('../../helpers/purchasedb')
var slotHelper = require('../../helpers/slot')

var config = require('../../config')

var rootFolder = path.resolve(config.root)
var contentFolder = path.resolve(rootFolder + '/content')

//open couch buckets
var cb = couch.stretchfs()

//make some promises
P.promisifyAll(fs)


/**
 * Put file
 * @param {object} req
 * @param {object} res
 */
exports.put = function(req,res){
  couch.counter(cb,couch.schema.counter('store','content:put'))
  couch.counter(cb,couch.schema.counter('store','content:filesUploaded'))
  var file = req.params.file
  var ext = file.split('.')[1]
  var expectedHash = path.basename(file,path.extname(file))
  var hashType = req.params.hashType || config.defaultHashType || 'sha1'
  var fileDetail = {}
  debug('got new put',file)
  var sniff = hashStream.createStream(hashType)
  var inventoryKey
  sniff.on('data',function(chunk){
    couch.counter(cb,
      couch.schema.counter('store','content:bytesUploaded'),chunk.length)
  })
  var dest
  hashFile.details(expectedHash,ext)
    .then(function(result){
      fileDetail = result
      fileDetail.ext = ext
      inventoryKey = couch.schema.inventory(fileDetail.hash,config.store.name)
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
      return inventory.createStoreInventory(fileDetail)
    })
    .then(function(){
      res.status(201)
      res.json({hash: sniff.hash})
    })
    .catch(function(err){
      logger.log('error', 'Failed to upload content ' + err.message)
      logger.log('error', err.stack)
      fs.unlinkSync(dest)
      return cb.removeAsync(inventoryKey)
        .then(function(){
          couch.counter(cb,couch.schema.counterError('store','content:put'))
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
 * Content exists
 * @param {object} req
 * @param {object} res
 */
exports.exists = function(req,res){
  couch.counter(cb,couch.schema.counter('store','content:exists'))
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
 * Get detail about a hash
 * @param {object} req
 * @param {object} res
 */
exports.detail = function(req,res){
  inventory.detailStore(req.body.hash)
    .then(function(result){
      res.json(result)
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
      return inventory.verifyFile(fileDetail,force)
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
  var storeKey = couch.schema.store(req.body.store)
  var storeClient = null
  var store = {}
  var fileDetail = {}
  cb.getAsync(storeKey)
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
        fileDetail: fileDetail
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
 * Content remove
 * @param {object} req
 * @param {object} res
 */
exports.remove = function(req,res){
  couch.counter(cb,couch.schema.counter('store','content:remove'))
  inventory.removeStoreInventory(req.body.hash)
    .then(function(){
      res.json({
        success: 'File removed'
      })
    })
    .catch(function(err){
      if(13 === err.code){
        couch.counter(cb,
          couch.schema.counterError('store','content:remove:notFound'))
        res.status(404)
        res.json({error: err.message})
      } else {
        couch.counter(cb,couch.schema.counterError('store','content:remove'))
        res.json({error: err.message, err: err})
      }
    })
}


/**
 * Content Export Functions Below
 * !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
 */


/**
 * Download content
 * @param {object} req
 * @param {object} res
 */
exports.download = function(req,res){
  couch.counter(cb,couch.schema.counter('store','content:download'))
  var hash = req.body.hash
  var ext = req.body.ext
  var detail
  var inventoryKey = couch.schema.inventory(hash)
  var slotKey = couch.schema.slot(
    req.ip,
    req.connection.remotePort,
    req.headers['user-agent'],
    hash
  )
  slotHelper.upsertAndGet(slotKey,req,hash)
    .then(function(){
      return hashFile.details(hash,ext)
    })
    .then(function(result){
      detail = result
      var filePath = detail.path
      //update hits
      couch.mutateIn(cb,inventoryKey,'counter','hitCount',1)
      couch.mutateIn(cb,inventoryKey,'counter','hits.' + config.store.name,1)
      couch.mutateIn(cb,slotKey,'counter','hitCount',1)
      couch.mutateIn(cb,slotKey,'counter','hits.' + config.store.name,1)
      //register to track bytes sent
      requestStats(req,res,function(stat){
        //inventory counter
        couch.mutateIn(cb,inventoryKey,'counter','byteCount',stat.res.bytes)
        couch.mutateIn(cb,inventoryKey,'counter',
          'bytes.' + config.store.name,stat.res.bytes)
        //slot counter
        couch.mutateIn(cb,slotKey,'counter','byteCount',stat.res.bytes)
        couch.mutateIn(cb,slotKey,'counter',
          'bytes.' + config.store.name,stat.res.bytes)
      })
      res.sendFile(filePath)
    })
    .catch(function(err){
      if(13 === err.code){
        couch.counter(cb,
          couch.schema.counterError('store','content:download:notFound'))
        res.status(404)
        res.json({error: err.message})
      } else {
        res.status(500)
        couch.counter(cb,couch.schema.counterError('store','content:download'))
        res.json({message: err.message, error: err})
      }
    })
}


/**
 * Speed test
 * @param {object} req
 * @param {object} res
 */
exports.speedTest = function(req,res){
  var size = req.query.size || '1m'
  var originalSize = size
  //convert size from friendly denominations
  if(size.match(/g/i)) size = parseInt(size) * 1000000000
  else if(size.match(/m/i)) size = parseInt(size) * 1000000
  else if(size.match(/k/i)) size = parseInt(size) * 1000
  else size = parseInt(size)
  if(!size){
    size = 1000000
    originalSize = '1m'
  }
  //limit size to 1g
  if(size > 1000000000) size = 1000000000
  //stream back some zeros for them fast
  var stream = devZeroStream(size)
  res.setHeader('Content-disposition',
    'attachment; filename=test' + originalSize + '.bin')
  res.setHeader('Content-type','application/octet-stream')
  stream.pipe(res)
}


/**
 * Get some Pizza
 * @param {object} req
 * @param {object} res
 */
exports.pizza = function(req,res){
  res.send('<html><head><title>Pizza</title></head>' +
    '<body style="margin: 0; padding: 0">' +
    '<img src="' +
    fs.readFileSync(__dirname + '/../../test/assets/pizza.txt') +
    '"/></body></html>'
  )
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
  var inventory = {}
  var inventoryKey = couch.schema.inventory(hash)
  debug('STATIC','checking for inventory',inventoryKey)
  var slotKey = couch.schema.slot(
    req.ip,
    req.connection.remotePort,
    req.headers['user-agent'],
    hash
  )
  debug('STATIC','got slot key',slotKey)
  cb.getAsync(inventoryKey)
    .then(function(result){
      inventory = result.value
      return slotHelper.upsertAndGet(slotKey,req,hash)
    })
    .then(function(){
      debug('STATIC','got file inventory, sending content',inventory)
      if(req.query.attach){
        res.header(
          'Content-Disposition',
          'attachment; filename=' + req.query.attach
        )
      }
      var filePath = path.join(contentFolder,inventory.relativePath)
      //update hits
      couch.mutateIn(cb,inventoryKey,'counter','hitCount',1)
      couch.mutateIn(cb,inventoryKey,'counter','hits.' + config.store.name,1)
      couch.mutateIn(cb,slotKey,'counter','hitCount',1)
      couch.mutateIn(cb,slotKey,'counter','hits.' + config.store.name,1)
      //register to track bytes sent
      requestStats(req,res,function(stat){
        //inventory counter
        couch.mutateIn(cb,inventoryKey,'counter','byteCount',stat.res.bytes)
        couch.mutateIn(cb,inventoryKey,'counter',
          'bytes.' + config.store.name,stat.res.bytes)
        //slot counter
        couch.mutateIn(cb,slotKey,'counter','byteCount',stat.res.bytes)
        couch.mutateIn(cb,slotKey,'counter',
          'bytes.' + config.store.name,stat.res.bytes)
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
  var slotKey = null
  var inventoryKey = null
  var purchaseKey = token
  purchasedb.get(token)
    .then(
      //continue with purchase
      function(result){
        debug('PLAY','got purchase result',token,result)
        purchase = result
        //get inventory
        slotKey = couch.schema.slot(
          req.ip,
          req.connection.remotePort,
          req.headers['user-agent'],
          purchase.hash
        )
        debug('PLAY','got slot key',token,slotKey)
        inventoryKey = couch.schema.inventory(purchase.hash)
        debug('PLAY','got inventory key',token,inventoryKey)
        return slotHelper.upsertAndGet(slotKey,req,purchase.hash)
          .then(function(){
            return cb.getAsync(inventoryKey)
          })
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
        //update hits
        couch.mutateIn(cb,inventoryKey,'counter','hitCount',1)
        couch.mutateIn(cb,inventoryKey,'counter','hits.' + config.store.name,1)
        couch.mutateIn(cb,slotKey,'counter','hitCount',1)
        couch.mutateIn(cb,slotKey,'counter','hits.' + config.store.name,1)
        //purchase hits
        couch.mutateIn(cb,purchaseKey,'counter','hitCount',1)
        //register to track bytes sent
        requestStats(req,res,function(stat){
          //inventory counter
          couch.mutateIn(cb,inventoryKey,'counter','byteCount',stat.res.bytes)
          couch.mutateIn(cb,inventoryKey,'counter',
            'bytes.' + config.store.name,stat.res.bytes)
          //slot counter
          couch.mutateIn(cb,slotKey,'counter','byteCount',stat.res.bytes)
          couch.mutateIn(cb,slotKey,'counter',
            'bytes.' + config.store.name,stat.res.bytes)
          //purchase counter
          couch.mutateIn(cb,purchaseKey,'counter','byteCount',stat.res.bytes)
        })
        //send file
        res.sendFile(purchaseUri)
      }
    })
}
