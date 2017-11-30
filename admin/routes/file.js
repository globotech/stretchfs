'use strict';
var crypto = require('crypto')
var debug = require('debug')('gump')
var fs = require('graceful-fs')
var mime = require('mime')
var mkdirp = require('mkdirp')
var Password = require('node-password').Password
var pathHelper = require('path')
var promisePipe = require('promisepipe')
var temp = require('temp')
var through2 = require('through2')

var couch = require('../../helpers/couchbase')

var fileHelper = require('../helpers/file')
var prism = require('../helpers/prismConnect')

var config = require('../../config')
var duplicateNameExp = /\(\d+\)$/

//open some buckets
var cb = couch.stretchfs()


/**
 * File List
 * @param {object} req
 * @param {object} res
 */
exports.list = function(req,res){
  var path = fileHelper.decode(req.query.path)
  fileHelper.findChildren(path,req.query.search)
    .then(function(result){
      res.render('file/list',{
        path: path,
        pathEncoded: fileHelper.encode(path),
        files: result,
        search: req.query.search
      })
    })
    .catch(function(err){
      console.log(err)
      req.flash('error','Failed to list files: ' + err.message)
      res.redirect('/')
    })
}


/**
 * Process action for index
 * @param {object} req
 * @param {object} res
 */
exports.listAction = function(req,res){
  P.try(function(){
    return req.body.remove || []
  })
    .each(function(item){
      return fileHelper.remove(item)
    })
    .then(function(){
      req.flash('success','Item(s) removed successfully')
      res.redirect('/file/list?path=' + req.query.path)
    })
    .catch(function(err){
      console.log(err)
      req.flash('error','Failed to remove item ' + err.message)
    })
}


/**
 * Remove file
 * @param {object} req
 * @param {object} res
 */
exports.remove = function(req,res){
  fileHelper.remove(req.body.path)
    .then(function(){
      req.flash('success','File removed successfully')
      res.redirect('/file/list')
    })
    .catch(function(err){
      console.log(err)
      req.flash('error','Failed to remove file ' + err.message)
    })
}


/**
 * Upload a file
 * @param {object} req
 * @param {object} res
 */
exports.upload = function(req,res){
  var body = {}
  var promises = []
  //normalize path and deal with god mode
  var path = fileHelper.decode(req.query.path)
  //setup temp folder
  if(!fs.existsSync(config.admin.tmpDir))
    mkdirp.sync(config.admin.tmpDir)
  //url creators
  var adminBaseUrl = function(){
    if(config.admin.baseUrl) return config.admin.baseUrl
    return 'http://' + (config.admin.host || '127.0.0.1') +
      ':' + (config.admin.port || 5973)
  }
  //import functions
  var sendToJob = function(file,next){
    var description = {
      callback: {
        request: config.admin.prism.callback
      },
      resource: [
        {
          name: 'video.mp4',
          request: {
            method: 'get',
            url: adminBaseUrl() + '/tmp/' + pathHelper.basename(file.tmp)
          }
        }
      ],
      augment: [
        {
          program: 'ffmpeg',
          args: ['-i','video.mp4','-ss','00:00:30',
                 '-f','image2','-vframes','1','-y','preview.jpeg']
        }
      ]
    }
    debug(file.hash,'job description created',description)
    prism.jobCreate(description,5,'augment')
      .then(function(result){
        debug(file.hash,'job created',result)
        file.handle = result.handle
        return shredder.jobStart(file.importJob)
      })
      .then(function(){
        debug(file.hash,'job started')
        next()
      })
      .catch(next)
  }
  var sendToStorage = function(file,next){
    debug(file.hash,'starting to send to StretchFS')
    prism.contentRetrieve({
      url: adminBaseUrl() + '/tmp/' + pathHelper.basename(file.tmp),
      rejectUnauthorized: false
    })
      .then(function(){
        next()
      })
      .catch(next)
      .finally(function(){
        debug(file.hash,'removing tmp file')
        return fs.unlinkAsync(file.tmp)
      })
  }
  var processFile = function(file){
    debug(file.filename,'starting to process uploaded file')
    var writable = fs.createWriteStream(file.tmp)
    var shasum = crypto.createHash('sha1')
    var fileParams
    var fileKey
    //setup a sniffer to capture the sha1 for integrity
    var sniff = through2(
      function(chunk,enc,next){
        try {
          file.size = file.size + chunk.length
          shasum.update(chunk)
          next(null,chunk)
        } catch(err){
          next(err)
        }
      }
    )
    //execute the pipe and save the file or error out the promise
    promisePipe(file.readable,sniff,writable)
      .then(function(){
        file.hash = shasum.digest('hex')
        debug(file.filename,'successfully stored tmp file with hash',file.hash)
        if(file.mimetype.match(/^video\//i)){
          debug(file.hash,'sending to shredder as its audio/video')
          return sendToJob(file)
        }
        else{
          debug(file.hash,'sending directly to oose')
          return sendToStorage(file)
        }
      })
      .then(function(){
        debug(file.hash,'ensuring parent folder exists in gump tree')
        return fileHelper.mkdirp(path)
      })
      .then(function(){
        var currentPath = path.slice(0)
        currentPath.push(file.filename)
        //lets figure out if the path is already taken
        var nameIterator = 0
        return promiseWhile(
          function(){
            return fileHelper.pathexists(currentPath)
          },
          function(){
            nameIterator++
            debug(
              file.hash,
              'file name used, incrementing new name',
              nameIterator
            )
            currentPath.pop()
            var ext = pathHelper.extname(file.filename)
            var basename = pathHelper.basename(file.filename,ext)
            if(basename.match(duplicateNameExp))
              basename = basename.replace(
                duplicateNameExp,'(' + nameIterator + ')'
              )
            else basename += ' (' + nameIterator + ')'
            file.filename = basename + ext
            currentPath.push(file.filename)
          }
        )
      })
      .then(function(){
        fileKey = couch.schema.file(fileHelper.encode(currentPath))
        fileParams = {
          handle: file.handle ||
          new Password({length: 12, special: false}).toString(),
          name: file.filename,
          tmp: file.tmp,
          hash: file.hash,
          size: file.size,
          path: currentPath,
          mimeType: file.mimeType,
          status: 'ok'
        }
        return cb.upsertAsync(fileKey,fileParams)
      })
      .then(function(){
        file.promise.resolve()
      })
      .catch(function(err){
        console.log(err)
        file.promise.reject(err)
      })
  }
  //busboy handling
  req.pipe(req.busboy)
  req.busboy.on('field',function(key,value){
    body[key] = value
  })
  req.busboy.on('file',function(fieldname,readable,filename,encoding,mimetype){
    var promise = new P()
    var file = {
      promise: promise,
      tmp: temp.path({dir: config.gump.tmpDir}) + '_' + filename,
      fieldname: fieldname,
      readable: readable,
      filename: filename,
      size: 0,
      encoding: encoding,
      mimetype: mimetype,
      sha1: '',
      importJob: ''
    }
    promises.push(promise)
    processFile(file)
  })
  req.busboy.on('finish',function(){
    P.all(promises)
      .then(function(){
        res.json({
          status: 'ok',
          code: 0,
          message: 'Files uploaded successfully'
        })
      })
      .catch(function(err){
        console.log(err)
        res.json({
          status: 'error',
          code: 1,
          message: err
        })
      })
  })
}


/**
 * Create folder
 * @param {object} req
 * @param {object} res
 */
exports.folderCreate = function(req,res){
  var path = fileHelper.decode(req.query.path)
  fileHelper.mkdirp(path)
    .then(function(){
      req.flash('success','Folder created successfully')
      res.redirect('/file/list?path=' + req.query.path)
    })
    .catch(function(err){
      console.log(err)
      req.flash('error','Failed to create folder ' + err.message)
    })
}


/**
 * File details
 * @param {object} req
 * @param {object} res
 */
exports.detail = function(req,res){
  var fileKey = couch.schema.file(req.query.path)
  cb.getAsync(fileKey)
    .then(function(result){
      res.render('file/detail',{
        file: result
      })
    })
}


/**
 * Job update
 * @param {object} req
 * @param {object} res
 * @return {*}
 */
exports.jobUpdate = function(req,res){
  debug('got job update',req.body)
  if(!req.body || !req.body.handle){
    res.json({error: 'no handle sent'})
    return
  }
  var handle = req.body.handle
  var file
  fileHelper.findByHandle(handle)
    .then(function(result){
      file = result
      if(!file.value.job) file.value.job = {}
      file.value.job.status = req.body.status
      file.value.job.message = req.body.statusDescription
      file.value.job.stepsComplete = req.body.stepComplete
      file.value.job.stepsTotal = req.body.stepTotal
      file.value.job.framesComplete = req.body.frameComplete
      file.value.job.framesTotal = req.body.frameTotal
    })
    .then(function(){
      if('complete' !== file.shredder.status) return
      file.status = 'ok'
      //remove tmp file
      if(fs.existsSync(file.value.tmp)) fs.unlinkSync(file.value.tmp)
      //import the files to oose
      var resource = {}
      prism.jobContentExists(handle,'video.mp4')
        .then(function(result){
          if(!result) return
          return prism.contentRetrieve({
            url: prism.jobContentUrl(handle,'video.mp4'),
            rejectUnauthorized: false
          })
        })
        .then(function(result){
          if(result) resource.video = result.hash
          return prism.jobContentExists(handle,'preview.jpeg')
        })
        .then(function(result){
          if(!result) return
          return prism.contentRetrieve({
            url: prism.jobContentUrl(handle,'preview.jpeg'),
            rejectUnauthorized: false
          })
        })
        .then(function(result){
          if(result) resource.preview = result.hash
          file.value.resource = resource
        })
    })
    .then(function(){
      if('error' !== file.shredder.status) return
      if(fs.existsSync(file.tmp)) fs.unlinkSync(file.tmp)
    })
    .then(function(){
      res.json({success: 'Update successful'})
    })
    .catch(function(err){
      console.log('Job update failed',handle,err)
      return res.json({error: err})
    })
}


/**
 * Download redirect
 * @param {object} req
 * @param {object} res
 */
exports.download = function(req,res){
  var file, url
  fileHelper.findByHandle(req.query.handle)
    .then(function(result){
      file = result
      return prism.contentPurchase(
        file.value.hash,mime.extension(file.value.mimeType))
    })
    .then(function(result){
      url = prism.urlPurchase(result,file.name)
      console.log(url)
      res.redirect(302,url)
    })
}


/**
 * Embed Video from File
 * @param {object} req
 * @param {object} res
 */
exports.embed = function(req,res){
  var file
  var purchase
  fileHelper.findByHandle(req.params.handle)
    .then(function(result){
      file = result
      return prism.contentPurchase(
        file.value.hash,
        mime.getExtension(file.value.name),
        config.admin.prism.referer
      )
    })
    .then(function(result){
      purchase = result
      var purchaseUrl = prism.urlPurchase(purchase,file.value.name)
      var previewUrl = prism.urlStatic(file.value.hash,file.value.name)
      res.render('file/embed',{
        file: file,
        purchase: purchase,
        videoUrl: purchaseUrl,
        previewUrl: previewUrl
      })
  })
}
