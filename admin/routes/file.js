'use strict';
var P = require('bluebird')
var Busboy = require('busboy')
var crypto = require('crypto')
var debug = require('debug')('stretchfs:admin:file')
var fileType = require('file-type')
var fs = require('graceful-fs')
var mime = require('mime')
var mkdirp = require('mkdirp')
var ObjectManage = require('object-manage')
var Password = require('node-password').Password
var pathHelper = require('path')
var promisePipe = require('promisepipe')
var request = require('request')
var temp = require('temp')
var through2 = require('through2')
var validator = require('validator')

var couch = require('../../helpers/couchbase')
var logger = require('../../helpers/logger')
var promiseWhile = require('../../helpers/promiseWhile')

var fileHelper = require('../helpers/file')
var prism = require('../helpers/prismConnect')

var config = require('../../config')
var duplicateNameExp = /\(\d+\)$/

//open some buckets
var cb = couch.stretchfs()

//make some promises
P.promisifyAll(request)


/**
 * Create file
 * @param {object} file
 * @return {P}
 */
var createFile = function(file){
  var fileKey = couch.schema.file(file.path)
  var fileParams = {
    handle: file.handle ||
      new Password({length: 12, special: false}).toString(),
    name: file.name,
    tmp: file.tmp,
    hash: file.hash,
    size: file.size,
    path: file.path,
    mimeType: file.mimeType,
    mimeExtension: file.mimeExtension,
    status: file.status,
    job: file.job,
    createdAt: new Date().toJSON(),
    updatedAt: new Date().toJSON()
  }
  return cb.upsertAsync(fileKey,fileParams)
}


/**
 * Save a file
 * @param {string} handle
 * @param {object} data
 * @return {P}
 */
var saveFile = function(handle,data){
  var fileKey
  var file = {}
  return fileHelper.findByHandle(handle)
    .then(function(result){
      fileKey = result[0]._id
      return cb.getAsync(fileKey)
    })
    .then(function(result){
      file = result
      if(data.name) file.value.name = data.name
      if(data.mimeType) file.value.mimeType = data.mimeType
      if(data.mimeExtension) file.value.mimeExtension = data.mimeExtension
      return cb.upsertAsync(fileKey,result.value,{cas: result.cas})
    })
}


/**
 * Save a job update to the file
 * @param {string} handle
 * @param {object} data
 * @param {boolean} handleCompletion
 * @return {P}
 */
var jobUpdate = function(handle,data,handleCompletion){
  if(!handleCompletion) handleCompletion = false
  var file
  var fileKey
  return fileHelper.findByHandle(handle)
    .then(function(result){
      fileKey = result[0]._id
      return cb.getAsync(fileKey)
    })
    .then(function(result){
      file = result
      if(!file.value.job) file.value.job = {}
      file.value.job.status = data.status
      file.value.job.statusDescription = data.statusDescription
      file.value.job.manifest = data.manifest
      file.value.job.workerName = data.workerName
      file.value.job.workerKey = data.workerKey
      file.value.job.stepsComplete = data.stepComplete
      file.value.job.stepsTotal = data.stepTotal
      file.value.job.framesComplete = data.frameComplete
      file.value.job.framesTotal = data.frameTotal
      file.value.job.framesDescription = data.framesDescription
      file.value.job.log = data.log
      file.value.job.lastLogUpdate = data.lastLogUpdate
      if(data.completedAt)
        file.value.job.completedAt = data.completedAt
      if(!(handleCompletion && 'complete' === file.value.job.status)) return
      if(!prism.helperConnected){
        throw new Error('Prism connection not established cannot' +
          ' process job update')
      }
      //remove tmp file
      if(fs.existsSync(file.value.tmp)) fs.unlinkSync(file.value.tmp)
      //import the files to oose
      var resource = {}
      if('video' === file.type){
        return prism.jobContentExists(handle,'video.mp4')
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
            return resource
          })
      } else {
        //this code will handle import hooks for standard files
        return prism.jobContentExists(handle,'file.' + file.value.mimeExtension)
          .then(function(result){
            if(result){
              return prism.contentRetrieve({
                url: prism.jobContentUrl(handle,'file.' +
                  file.value.mimeExtension),
                rejectUnauthorized: false
              })
                .then(function(result){
                  resource.file = result.hash
                  return resource
                })
            }
          })
      }
    })
    .then(function(result){
      file.value.resource = result || {}
      file.value.status = 'ok'
      file.value.job.status = 'finished'
      if(!file.value.hash && result.file) file.value.hash = result.file
      var updateFile = function(){
        return cb.getAsync(fileKey)
          .then(function(result){
            var up = new ObjectManage(result.value)
            up.$load(file.value)
            up = up.$strip()
            return cb.upsertAsync(fileKey,up,{cas: result.cas})
          })
          .catch(function(err){
            if(12 !== err.code) throw err
            return updateFile()
          })
      }
      return updateFile()
    })
    .then(function(){
      if('error' !== file.value.job.status) return
      //remove tmp file on error report
      if(fs.existsSync(file.value.tmp)) fs.unlinkSync(file.value.tmp)
    })
    .then(function(){
      //update db
      return cb.upsertAsync(fileKey,file.value,{cas: file.cas})
    })
}


/**
 * Generate admin panel base url
 * @return {string}
 */
var adminBaseUrl = function(){
  if(config.admin.baseUrl) return config.admin.baseUrl
  return 'http://' + (config.admin.host || '127.0.0.1') +
    ':' + (config.admin.port || 5973)
}


/**
 * Send file to job system for processing
 * @param {object} file
 * @return {P}
 */
var sendToJob = function(file){
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
        resource: 'preview.jpeg',
        program: 'ffmpeg',
        args: ['-i','video.mp4','-ss','00:00:30',
               '-f','image2','-vframes','1','-y','preview.jpeg']
      }
    ]
  }
  debug(file.hash,'job description created',description)
  return prism.jobCreate(description,5,'augment')
    .then(function(result){
      debug(file.hash,'job created',result)
      file.handle = result.handle
      return prism.jobStart(file.handle)
    })
    .then(function(){
      debug(file.hash,'job started')
    })
}


/**
 * Send file to backend storage
 * @param {object} file
 * @return {P}
 */
var sendToStorage = function(file){
  debug(file.hash,'starting to send to StretchFS')
  return prism.contentRetrieve({
    url: adminBaseUrl() + '/tmp/' + pathHelper.basename(file.tmp),
    rejectUnauthorized: false
  })
    .catch(function(err){
      console.log('Failed to send to backend',err)
    })
    .finally(function(){
      debug(file.hash,'removing tmp file')
      return fs.unlinkAsync(file.tmp)
    })
}


/**
 * Import to job
 * @param {string} url
 * @param {string} ext
 * @param {string} mimeType
 * @return {P}
 */
var importToJob = function(url,ext,mimeType){
  var handle = ''
  var description = {
    callback: {
      request: config.admin.prism.callback
    },
    resource: [
      {
        name: 'file.' + ext.replace('.',''),
        request: {
          method: 'get',
          url: url
        }
      }
    ]
  }
  var jobType = 'resource'
  if(mimeType.match(/video/i)){
    jobType = 'augment'
    description.resource[0].name = 'video.mp4'
    description.augment = [
      {
        program: 'ffmpeg',
        args: ['-i','video.mp4','-ss','00:00:30',
               '-f','image2','-vframes','1','-y','preview.jpeg']
      }
    ]
  }
  return prism.jobCreate(description,10,jobType)
    .then(function(result){
      handle = result.handle
      return prism.jobStart(handle)
    })
    .then(function(){
      return handle
    })
    .catch(function(err){
      console.log(err)
      logger.log('Failed to import file to job system ' + err.message)
    })
}


/**
 * File List
 * @param {object} req
 * @param {object} res
 */
exports.list = function(req,res){
  var path = fileHelper.decode(req.query.path)
  var jsonOutput = false
  if(req.query.json) jsonOutput = true
  var ensureConsistency = false
  if(jsonOutput) ensureConsistency = fileHelper.ENSURE_CONSISTENCY
  fileHelper.findChildren(path,req.query.search,ensureConsistency)
    .then(function(result){
      var params = {
        path: path,
        folderPath: fileHelper.encode(path),
        files: result,
        search: req.query.search
      }
      if(jsonOutput){
        params.status = 'ok'
        params.message = 'List success'
        res.json(params)
      } else {
        res.render('file/list',params)
      }
    })
    .catch(function(err){
      console.log(err)
      if(jsonOutput){
        res.json({
          error: err,
          status: 'error',
          message: err.message
        })
      } else {
        req.flash('error','Failed to list files: ' + err.message)
        res.redirect('/')
      }
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
 * Export files via ajax
 * @param {object} req
 * @param {object} res
 */
exports.export = function(req,res){
  //export files
  P.try(function(){
    return req.body.fileList || []
  })
    .map(function(path){
      var fileKey = couch.schema.file(path)
      return cb.getAsync(fileKey)
        .then(function(result){
          return result.value
        })
    })
    .then(function(results){
      res.json({
        status: 'ok',
        message: 'Files exported',
        baseUrl: config.admin.baseUrl,
        fileList: results
      })
    })
    .catch(function(err){
      console.log(err.stack)
      logger.log('File export failed ' + err.message)
      res.status(500)
      res.render('error',{error: err.message})
    })
}


/**
 * Move folder list
 * @param {object} req
 * @param {object} res
 */
exports.moveList = function(req,res){
  var path = req.body.folderPath || ',,'
  var skip = req.body.skip || []
  //grab the folder list
  fileHelper.findFolders(path,skip)
    .then(function(result){
      res.json({
        status: 'ok',
        message: 'Folder list found',
        folderList: result
      })
    })
    .catch(function(err){
      console.log(err)
      logger.log('error','Failed to list folders' +
          ' for move: ' + err.message,err)
      res.status(500)
      res.json({
        status: 'error',
        message: 'Failed to list folders for move: ' + err.message,
        error: err
      })
    })
}


/**
 * Move files and folders to destination
 * @param {object} req
 * @param {object} res
 */
exports.moveTo = function(req,res){
  var folderList = req.body.folderList || []
  var fileList = req.body.fileList || []
  var destinationPath = req.body.destinationPath
  var destination = fileHelper.decode(destinationPath)
  P.try(function(){
    return folderList.concat(fileList)
  })
    .each(function(path){
      var filePathName = fileHelper.decode(path).pop()
      var destPath = fileHelper.recode(destination)
      destPath.push(filePathName)
      var newPath = fileHelper.encode(destPath)
      var fileKey = couch.schema.file(path)
      var fileKeyNew = couch.schema.file(newPath)
      var file
      //dont act on files that arent moving
      if(newPath === path) return
      return cb.getAsync(fileKey)
        .then(function(result){
          file = result
          //update new path
          file.value.path = newPath
          //create the new file
          return cb.upsertAsync(fileKeyNew,file.value)
        })
        .then(function(){
          //remove the old file
          return cb.removeAsync(fileKey,{cas: file.cas})
        })
    })
    .then(function(){
      res.json({
        status: 'ok',
        message: 'Files and folders moved',
        destinationPath: destinationPath,
        folderList: folderList,
        fileList: fileList
      })
    })
    .catch(function(err){
      if(err.stack){
        logger.log('error','Failed to list folders for' +
          ' move: ' + err.message,err)
      }
      if(err.stack) logger.log('error', err.stack,err)
      res.status(500)
      res.json({
        status: 'error',
        message: 'Could not move files or folders',
        error: err
      })
    })
}


/**
 * Remove file
 * @param {object} req
 * @param {object} res
 */
exports.remove = function(req,res){
  var removeCount = 0
  var jsonOutput = false
  if(req.query.json) jsonOutput = true
  if(req.body.path) req.body.remove = [req.body.path]
  if(!(req.body.remove instanceof Array)) req.body.remove = [req.body.remove]
  P.try(function(){
    return req.body.remove
  })
    .each(function(item){
      return fileHelper.remove(item)
        .then(function(){
          removeCount++
        })
    })
    .then(function(){
      if(jsonOutput){
        res.json({
          status: 'ok',
          message: removeCount + ' File(s) removed successfully',
          count: removeCount
        })
      } else {
        req.flash('success',removeCount + ' File(s) removed successfully')
        res.redirect('/file/list')
      }
    })
    .catch(function(err){
      console.log(err)
      if(jsonOutput){
        res.json({
          status: 'error',
          message: err.message,
          error: err
        })
      } else {
        req.flash('error','Failed to remove file ' + err.message)
      }
    })
}


/**
 * Upload a file
 * @param {object} req
 * @param {object} res
 */
exports.upload = function(req,res){
  var body = {}
  var filePromises = []
  if(!prism.helperConnected){
    throw new Error('No connection to prism established cannot upload')
  }
  //normalize path and deal with god mode
  var path = fileHelper.decode(req.query.path)
  //setup temp folder
  if(!fs.existsSync(config.admin.tmpFolder))
    mkdirp.sync(config.admin.tmpFolder)
  var processFile = function(file){
    debug(file.filename,'starting to process uploaded file')
    var writable = fs.createWriteStream(file.tmp)
    var shasum = crypto.createHash('sha1')
    var fileParams
    var firstChunk
    var currentPath = []
    //setup a sniffer to capture the sha1 for integrity
    var sniff = through2(
      function(chunk,enc,next){
        try {
          if(!firstChunk) firstChunk = chunk
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
        //use first chunk to detect mime
        var mimeInfo = fileType(firstChunk)
        if(mimeInfo && mimeInfo.mime){
          file.mimetype = mimeInfo.mime
          file.extension = mimeInfo.ext
        }
        file.hash = shasum.digest('hex')
        debug(file.filename,'successfully stored tmp file with hash',file.hash)
        if(file.mimetype.match(/^video\//i)){
          debug(file.hash,'sending to job as its audio/video')
          file.jobFiled = true
          return sendToJob(file)
        }
        else{
          debug(file.hash,'sending directly to oose')
          file.jobFiled = false
          return sendToStorage(file)
        }
      })
      .then(function(){
        debug(file.hash,'ensuring parent folder exists in tree')
        return fileHelper.mkdirp(path)
      })
      .then(function(){
        currentPath = path.slice(0)
        currentPath.push(file.filename)
        //lets figure out if the path is already taken
        var nameIterator = 0
        var nameTaken = true
        return promiseWhile(
          function(){
            return nameTaken
          },
          function(){
            return fileHelper.pathExists(currentPath)
              .then(function(result){
                if(!result){
                  nameTaken = false
                } else {
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
              })
          }
        )
      })
      .then(function(){
        fileParams = {
          handle: file.handle ||
            new Password({length: 12, special: false}).toString(),
          name: file.filename,
          tmp: file.tmp,
          hash: file.hash,
          size: file.size,
          path: fileHelper.encode(currentPath),
          mimeType: file.mimetype,
          mimeExtension: file.extension,
          status: 'ok',
          createdAt: new Date().toJSON(),
          updatedAt: new Date().toJSON()
        }
        if(file.jobFiled){
          fileParams.status = 'processing'
          fileParams.job = {status: 'staged'}
        }
        return createFile(fileParams)
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
  var busboy = new Busboy({
    headers: req.headers,
    highWaterMark: 65536, //64K
    limits: {
      fileSize: 2147483648 //2GB
    }
  })
  busboy.on('field',function(key,value){
    debug('upload got field',key,value)
    body[key] = value
  })
  busboy.on('file',function(fieldname,readable,filename,encoding,mimetype){
    filePromises.push(new P(function(resolve,reject){
      mimetype = mime.getType(filename)
      var file = {
        promise: {
          resolve: resolve,
          reject: reject
        },
        tmp: temp.path({dir: config.admin.tmpFolder}) + '_' + filename,
        fieldname: fieldname,
        readable: readable,
        filename: filename,
        size: 0,
        encoding: encoding,
        mimetype: mimetype,
        extension: mime.getExtension(mimetype),
        hash: '',
        job: {}
      }
      processFile(file)
    }))
  })
  busboy.on('finish',function(){
    P.all(filePromises)
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
  req.pipe(busboy)
}


/**
 * Create folder
 * @param {object} req
 * @param {object} res
 */
exports.folderCreate = function(req,res){
  var jsonOutput = false
  if(req.query.json) jsonOutput = true
  var path = fileHelper.decode(req.query.path || req.body.path)
  fileHelper.mkdirp(path)
    .then(function(result){
      if(jsonOutput){
        res.json({
          status: 'ok',
          message: 'Folder created successfully',
          folder: result
        })
      } else {
        req.flash('success','Folder created successfully')
        res.redirect('/file/list?path=' + req.query.path)
      }
    })
    .catch(function(err){
      console.log(err)
      if(jsonOutput){
        req.json({
          status: 'error',
          message: err.message,
          error: err
        })
      } else {
        req.flash('error','Failed to create folder ' + err.message)
      }
    })
}


/**
 * File details
 * @param {object} req
 * @param {object} res
 */
exports.detail = function(req,res){
  var detailShort = false
  if(req.query.short) detailShort = true
  var handle = req.query.handle || req.params.handle
  fileHelper.findByHandle(handle)
    .then(function(result){
      var file = result[0]
      res.render('file/' + (detailShort ? 'detailShort' : 'detail'),{
        baseUrl: config.admin.baseUrl,
        file: file,
        fileHelper: fileHelper,
        detailShort: detailShort,
        urlStatic: req.protocol + ':' + prism.urlStatic(file.hash,file.name)
      })
    })
    .catch(function(err){
      res.render('error',{error: err})
    })
}


/**
 * Job update
 * @param {object} req
 * @param {object} res
 * @return {*}
 */
exports.jobUpdate = function(req,res){
  var handle = req.body.handle
  debug('got job update',req.body)
  if(!req.body || !req.body.handle){
    res.json({error: 'no handle sent'})
    return
  }
  jobUpdate(handle,req.body,true)
    .then(function(){
      res.json({success: 'Update successful'})
    })
    .catch(function(err){
      console.log('Job update failed',handle,err)
      return res.json({error: err})
    })
}


/**
 * Save a file
 * @param {object} req
 * @param {object} res
 */
exports.save = function(req,res){
  saveFile(req.body.handle,req.body)
    .then(function(result){
      res.json({
        status: 'ok',
        message: 'File saved successfully',
        file: result
      })
    })
    .catch(function(err){
      console.log('File save failed',err)
      res.json({
        status: 'error',
        message: 'File saved failed',
        error: err
      })
    })
}


/**
 * Download redirect
 * @param {object} req
 * @param {object} res
 */
exports.download = function(req,res){
  var file = {}
  var url = ''
  var attach = true
  if(req.query.direct) attach = false
  fileHelper.findByHandle(req.query.handle)
    .then(function(result){
      if(!prism.helperConnected){
        throw new Error('Prism connection not established cannot download')
      }
      file = result[0]
      if(!req.query.sendFile && !req.query.direct){
        //show a download page
        res.render('file/download',{file: file})
      } else {
        return prism.contentPurchase(
          file.hash,
          file.mimeExtension,
          config.admin.prism.referrer
        )
          .then(function(result){
            url = req.protocol + ':' + prism.urlPurchase(result,file.name)
            if(attach){
              url += '?attach=' + encodeURIComponent(file.name)
            }
            res.redirect(302,url)
          })
      }

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
      if(!prism.helperConnected){
        throw new Error('Prism connection not established cannot download')
      }
      file = result[0]
      return prism.contentPurchase(
        file.resource.video,
        file.mimeExtension,
        config.admin.prism.referrer
      )
    })
    .then(function(result){
      purchase = result
      var purchaseUrl = prism.urlPurchase(purchase,file.name)
      var previewUrl = prism.urlStatic(
        file.resource.preview,
        'preview.jpeg'
      )
      res.render('file/embed',{
        file: file,
        purchase: purchase,
        resources: {
          video: purchaseUrl,
          preview: previewUrl
        }
      })
  })
}


/**
 * File detail full
 * @param {object} req
 * @param {object} res
 */
exports.detailFull = function(req,res){
  //var file = {}
  File.find({
    where: {id: req.query.id, UserId: req.session.user.id}
  })
    .then(function(result){
      if(!result) throw new UserError('File Not Found')
      //instead of rendering something here it should redirect to the proper
      //page
      if('video' === result.type){
        res.redirect(301,'/watch/' + result.jobHandle)
      } else {
        res.redirect(301,'/view/' + result.id)
      }
      /*
      res.render('file/detailFull',{
        file: result,
        baseUrl: config.main.baseUrl,
        urlStatic: prism.urlStatic(result.sha1,result.name)
      })
      */
    })
    .catch(UserError,function(err){
      res.status(404)
      res.render('error',{error: err.message})
    })
    .catch(function(err){
      console.log(err)
      logger.log('File detail full failed ' + err.message)
      res.status(500)
      res.render('error',{error: err.message})
    })
}


/**
 * Import List
 * @param {object} req
 * @param {object} res
 */
exports.importList = function(req,res){
  var list = []
  fileHelper.findProcessing()
    .map(function(file){
      var fileKey = file._id
      //update job details
      return prism.jobDetail(file.handle)
        .then(function(result){
          return jobUpdate(file.handle,result)
        })
        .catch(function(err){
          console.log('Error updating job ' + file.handle + ' :' + err.message)
        })
        .finally(function(){
          return cb.getAsync(fileKey)
            .then(function(result){
              list.push(result.value)
            })
        })
    })
    .then(function(){
      res.json({
        status: 'ok',
        message: 'Import list retrieved successfully',
        importList: list
      })
    })
    .catch(function(err){
      logger.log('error','ERROR retrieving import list: ' + err.message,err)
      logger.log('error',err.stack,err)
      res.status(500)
      res.json({
        status: 'error',
        message: 'ERROR retrieving import list: ' + err.message,
        err: err
      })
    })
}


/**
 * Import Files by URL
 * @param {object} req
 * @param {object} res
 */
exports.import = function(req,res){
  //assign input info
  var folderPath = req.body.folderPath
  var urlText = req.body.urlText
  var urls = urlText.split('\n')
  var counter = {valid: 0, invalid: 0, error: 0}
  //filter blanks
  urls = urls.filter(function(row){
    //force a string
    row = row + ''
    if(0 < row.length && validator.isURL(row)){
      counter.valid = counter.valid + 1
      return true
    } else {
      counter.invalid = counter.invalid + 1
      return false
    }
  })
  //verify import count
  new P(function(resolve,reject){
    if(urls.length < 1) reject(new Error('No imports defined.'))
    else if(urls.length > config.admin.importMaxFileCount){
      reject(new Error('Import count cannot exceed ' +
        config.admin.importMaxFileCount))
    } else {
      resolve(urls)
    }
  })
    .each(function(url){
      return new P(function(resolve,reject){
        var fileRequest = request.get({
          url: url,
          timeout: 2000
        })
        //collect our mimetype on the response using fileType
        fileRequest.on('response',function(fileResponse){
          var mimeInfo
          if(fileResponse.statusCode !== 200){
            reject(new Error(
              'Got an invalid response code from the import URL: ' +
              fileResponse.statusCode
            ))
          }
          else{
            var fileName = pathHelper.basename(url)
            if(fileResponse.headers['content-disposition']){
              var dispo = contentDispostion.parse(
                fileResponse.headers['content-disposition'])
              if(dispo.paramters.filename) fileName = dispo.paramters.filename
            }
            var fileExt = pathHelper.extname(fileName)
            fileResponse.once('data',function(chunk){
              fileResponse.destroy()
              mimeInfo = fileType(chunk)
              //so if we dont get a magic number response (which we are going
              //to add some definitions to anyway) we will go ahead and try
              //to get the extension of the URL this is dirty but its better
              //than denying the upload
              if(!mimeInfo){
                mimeInfo = {
                  mime: mime.getType(fileName),
                  ext: fileExt
                }
              }
              //make sure there are not dots in the extension
              mimeInfo.ext = mimeInfo.ext.replace('.','')
              //check the file size here
              if(!fileResponse.headers['content-length'] ||
                +fileResponse.headers['content-length'] >
                config.admin.importMaxFileSize)
              {
                reject(new Error(
                  'Invalid content length, or file size above ' +
                  config.admin.importMaxFileSize
                ))
              }
              else if(!mimeInfo.mime || !mimeInfo.ext){
                reject(new Error('Could not determine file type'))
              } else {
                //here we need to figure out the mime type and the size from
                //the res then we should have enough to create the file
                //record, which we need to setup the shredder job, then maybe
                //this feature will be done
                var currentPath = fileHelper.decode(folderPath)
                currentPath.push(fileName)
                importToJob(url,mimeInfo.ext,mimeInfo.mime)
                  .then(function(handle){
                    var fileParams = {
                      handle: handle,
                      name: fileName,
                      tmp: null,
                      hash: null,
                      size: (+fileResponse.headers['content-length']) || 0,
                      path: fileHelper.encode(currentPath),
                      mimeType: mimeInfo.mime,
                      mimeExtension: mimeInfo.ext,
                      status: 'processing',
                      job: {
                        status: 'staged'
                      },
                      createdAt: new Date().toJSON(),
                      updatedAt: new Date().toJSON()
                    }
                    return createFile(fileParams)
                  })
                  .then(function(){
                    resolve()
                  })
              }
            })
          }
        })
      })
    })
    .then(function(){
      res.json({
        status: 'ok',
        message: 'URLs imported successfully'
      })
    })
    .catch(function(err){
      res.json({
        status: 'error',
        message: 'URL import failed ' + err,
        err: err
      })
    })
}
