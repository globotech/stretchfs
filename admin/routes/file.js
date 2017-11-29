'use strict';
var async = require('async')
var crypto = require('crypto')
var debug = require('debug')('gump')
var fs = require('graceful-fs')
var mime = require('mime')
var mkdirp = require('mkdirp')
var Password = require('node-password').Password
var Path = require('path')
var promisePipe = require('promisepipe')
var Q = require('q')
var request = require('request')
var temp = require('temp')
var through2 = require('through2')

var couch = require('../../helpers/couchbase')

var prism = require('../helpers/prismConnect')

var config = require('../../config')
var duplicateNameExp = /\(\d+\)$/

//open some buckets
var cb = couch.stretchfs()


/**
 * Embed
 * @type {exports}
 */
exports.embed = require('./embed')


/**
 * User
 * @type {exports}
 */
exports.user = require('./user')


/**
 * Homepage
 * @param {object} req
 * @param {object} res
 */
exports.index = function(req,res){
  var path = File.decode(req.query.path)
  if(!req.query.god || !req.session.user.admin)
    path.unshift(req.session.user._id)
  File
    .findChildren(path)
    .where('name',new RegExp(req.query.search || '.*','i'))
    .exec(function(err,results){
        if(err) return res.send(err.message)
        if(!req.query.god || !req.session.user.admin) path.shift()
        res.render('index',{
          path: path,
          pathEncoded: File.encode(path),
          files: results,
          god: (req.query.god),
          search: req.query.search
        })
      }
    )
}


/**
 * Process action for index
 * @param {object} req
 * @param {object} res
 */
exports.fileRemove = function(req,res){
  async.each(
    req.body.remove,
    function(item,next){
      File.findOne({_id: item},function(err,result){
        if(err) return next(err.message)
        if(!result) return next('Could not find item ' + item)
        result.remove(function(err){
          if(err) return next(err.message)
          next()
        })
      })
    },
    function(err){
      if(err){
        req.flash('error','Failed to remove item ' + err)
      } else {
        req.flash('success','Item(s) removed successfully')
      }
      res.redirect(
        '/?path=' + req.query.path + (req.query.god ? '&god=on' : '')
      )
    }
  )
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
  var path = File.decode(req.query.path)
  if(!req.query.god || !req.session.user.admin)
    path.unshift(req.session.user._id)
  //setup temp folder
  if(!fs.existsSync(config.gump.tmpDir))
    mkdirp.sync(config.gump.tmpDir)
  //url creators
  var gumpBaseUrl = function(){
    if(config.gump.baseUrl) return config.gump.baseUrl
    return 'http://' + (config.gump.host || '127.0.0.1') +
      ':' + (config.gump.port || 3004)
  }
  //import functions
  var sendToShredder = function(file,next){
    var description = {
      callback: {
        request: config.shredder.callback
      },
      resource: [
        {
          name: 'video.mp4',
          request: {
            method: 'get',
            url: gumpBaseUrl() + '/tmp/' + Path.basename(file.tmp)
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
    debug(file.sha1,'shredder description created',description)
    shredder.jobCreate(description,5,'augment')
      .then(function(result){
        debug(file.sha1,'job created',result)
        file.importJob = result.handle
        return shredder.jobStart(file.importJob)
      })
      .then(function(){
        debug(file.sha1,'job started')
        next()
      })
      .catch(next)
  }
  var sendToOose = function(file,next){
    debug(file.sha1,'starting to send to OOSE')
    prism.contentRetrieve({
      url: gumpBaseUrl() + '/tmp/' + Path.basename(file.tmp),
      rejectUnauthorized: false
    })
      .then(function(){
        next()
      })
      .catch(next)
      .finally(function(){
        debug(file.sha1,'removing tmp file')
        return fs.unlinkAsync(file.tmp)
      })
  }
  var processFile = function(file){
    debug(file.filename,'starting to process uploaded file')
    var writable = fs.createWriteStream(file.tmp)
    var shasum = crypto.createHash('sha1')
    var doc
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
    promisePipe(file.readable,sniff,writable).then(
      //successful pipe handling
      function(){
        file.sha1 = shasum.digest('hex')
        debug(
          file.filename,
          'successfully stored to tmp file with sha1',
          file.sha1
        )
        async.series(
          [
            //send to oose or shredder
            function(next){
              if(file.mimetype.match(/^(video|audio)\//i)){
                debug(file.sha1,'sending to shredder as its audio/video')
                sendToShredder(file,next)
              } else {
                debug(file.sha1,'sending directly to oose')
                sendToOose(file,next)
              }
            },
            //create parents
            function(next){
              debug(file.sha1,'ensuring parent folder exists in gump tree')
              File.mkdirp(Object.create(path),next)
            },
            //create doc
            function(next){
              var currentPath = path.slice(0)
              currentPath.push(file.filename)
              //lets figure out if the path is already taken
              var nameIterator = 0
              var pathCount = 0
              async.doUntil(
                function(next){
                  File.count(
                    {path: File.encode(currentPath)},
                    function(err,count){
                      if(err) return next(err)
                      pathCount = count
                      next()
                    }
                  )
                },
                function(){
                  if(0 === pathCount){
                    debug(file.sha1,'file name unused, using it')
                    return true
                  }
                  nameIterator++
                  debug(
                    file.sha1,
                    'file name used, incrementing new name',
                    nameIterator
                  )
                  currentPath.pop()
                  var ext = Path.extname(file.filename)
                  var basename = Path.basename(file.filename,ext)
                  if(basename.match(duplicateNameExp))
                    basename = basename.replace(
                      duplicateNameExp,'(' + nameIterator + ')'
                    )
                  else basename += ' (' + nameIterator + ')'
                  file.filename = basename + ext
                  currentPath.push(file.filename)
                  return false
                },
                function(err){
                  if(err) return next(err)
                  doc = new File()
                  doc.handle = file.importJob ||
                    new Password({length: 12, special: false}).toString()
                  doc.name = file.filename
                  doc.tmp = file.tmp
                  doc.sha1 = file.sha1
                  doc.size = file.size
                  doc.path = currentPath
                  doc.mimeType = file.mimetype
                  if(file.importJob){
                    doc.shredder.handle = file.importJob
                    doc.status = 'processing'
                  } else {
                    doc.status = 'ok'
                  }
                  next()
                }
              )
            },
            //save doc
            function(next){
              doc.save(function(err){
                if(err) return next(err.message)
                debug(file.sha1,'saved new gump entry')
                next()
              })
            }
          ],
          function(err){
            if(err) return file.promise.reject(err)
            debug(file.sha1,'releasing promise')
            file.promise.resolve()
          }
        )
      },
      //stream error handling
      function(err){
        file.promise.reject(
          'Failed in stream ' + err.source + ': ' + err.message)
      }
    )
  }
  //busboy handling
  req.pipe(req.busboy)
  req.busboy.on('field',function(key,value){
    body[key] = value
  })
  req.busboy.on('file',function(fieldname,readable,filename,encoding,mimetype){
    var promise = Q.defer()
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
    Q.all(promises)
      .fail(function(err){
        res.json({
          status: 'error',
          code: 1,
          message: err
        })
      })
      .done(function(){
        res.json({
          status: 'ok',
          code: 0,
          message: 'Files uploaded successfully'
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
  var doc
  var path = File.decode(req.query.path)

  path.unshift(req.session.user._id)
  async.series(
    [
      //create parents
      function(next){
        File.mkdirp(path,next)
      },
      function(next){
        path.push(req.body.name)
        doc = new File()
        doc.name = req.body.name
        doc.path = path
        doc.folder = true
        doc.mimeType = 'folder'
        doc.status = 'ok'
        next()
      },
      function(next){
        doc.save(function(err){
          if(err) return next(err.message)
          next()
        })
      }
    ],
    function(err){
      if(err){
        req.flash('error','Failed to create folder ' + err)
      } else {
        req.flash('success','Folder created successfully')
      }
      res.redirect(
        '/?path=' + req.query.path + (req.query.god ? '&god=on' : '')
      )
    }
  )
}


/**
 * File details
 * @param {object} req
 * @param {object} res
 */
exports.file = function(req,res){
  var god = (req.query.god)
  File.findOne({handle: req.query.handle},function(err,result){
    if(result.status === 'error'){
      return res.render('fileError',{
        file: result,
        god: god
      })
    }
    if(result.status === 'processing'){
      return res.render('fileProcessing',{
        file: result,
        god: god
      })
    }
    if(result.status === 'ok' && result.embedHandle){
      return res.render('fileEmbed',{
        file: result,
        baseUrl: config.gump.embedBaseUrl,
        god: god
      })
    }
    res.render('fileDetails',{
      file: result,
      baseUrl: config.gump.embedBaseUrl,
      god: god
    })
  })
}


/**
 * Shredder update
 * @param {object} req
 * @param {object} res
 * @return {*}
 */
exports.shredderUpdate = function(req,res){
  debug('got shredder update',req.body)
  if(!req.body || !req.body.handle){
    res.json({error: 'no handle sent'})
    return
  }
  var handle = req.body.handle
  var file
  async.series(
    [
      //find file by job
      function(next){
        File.findOne({'shredder.handle': req.body.handle},function(err,result){
          if(err) return next(err.message)
          if(!result) return next('could not find file by handle')
          file = result
          next()
        })
      },
      //update job status
      function(next){
        file.shredder.status = req.body.status
        file.shredder.message = req.body.statusDescription
        file.shredder.steps.complete = req.body.stepComplete
        file.shredder.steps.total = req.body.stepTotal
        file.shredder.frames.complete = req.body.frameComplete
        file.shredder.frames.total = req.body.frameTotal
        next()
      },
      //handle complete status
      function(next){
        if('complete' !== file.shredder.status) return next()
        file.status = 'ok'
        async.series(
          [
            //remove tmp file
            function(next){
              if(fs.existsSync(file.tmp))
                fs.unlink(file.tmp,next)
              else next()
            },
            //import the files to oose
            function(next){
              var resource = {}
              shredder.jobContentExists(handle,'video.mp4')
                .then(function(result){
                  if(result){
                    return prism.contentRetrieve({
                      url: shredder.jobContentUrl(handle,'video.mp4'),
                      rejectUnauthorized: false
                    })
                  }
                })
                .then(function(result){
                  if(result) resource.video = result.sha1
                  return shredder.jobContentExists(handle,'preview.jpeg')
                })
                .then(function(result){
                  if(result){
                    return prism.contentRetrieve({
                      url: shredder.jobContentUrl(handle,'preview.jpeg'),
                      rejectUnauthorized: false
                    })
                  }
                })
                .then(function(result){
                  if(result) resource.preview = result.sha1
                  file.shredder.resources = resource
                  next()
                })
                .catch(next)
            },
            //create the embed object
            function(next){
              file.embedHandle = file.handle
              var doc = new Embed()
              doc.handle = file.handle
              doc.title = file.name
              doc.keywords = file.name.split(' ').join(',')
              doc.template = 'standard'
              if(file.shredder.resources.preview){
                doc.media.image.push({
                  offset: null,
                  sha1: file.shredder.resources.preview
                })
              }
              if(file.shredder.resources.video){
                doc.media.video.push({
                  quality: 'standard',
                  sha1: file.shredder.resources.video
                })
              }
              doc.save(function(err){
                if(err) return next(err.message)
                next()
              })
            }
          ],
          function(err){
            if(err) return next(err)
            next()
          }
        )

      },
      //handle error status
      function(next){
        if('error' !== file.shredder.status) return next()
        if(fs.existsSync(file.tmp))
          fs.unlink(file.tmp,next)
        else next()
      },
      //save job
      function(next){
        file.save(function(err){
          if(err) return next(err.message)
          next()
        })
      }
    ],
    function(err){
      if(err){
        console.log('Job update failed: ' + err)
        return res.json({error: err})
      }
      res.json({success: 'Update successful'})
    }
  )
}


/**
 * Download redirect
 * @param {object} req
 * @param {object} res
 */
exports.download = function(req,res){
  var file, url
  async.series(
    [
      //find the file
      function(next){
        File.findOne({handle: req.query.handle},function(err,result){
          if(err) return next()
          if(!result) return next('Could not find file')
          file = result
          next()
        })
      },
      //build the oose url
      function(next){
        prism.contentPurchaseCache(file.sha1,mime.extension(file.mimeType))
          .then(function(result){
            url = prism.urlPurchase(result,file.name.replace(/\..*$/,''))
            next()
          })
          .catch(next)
      }
    ],
    function(err){
      if(err){
        return res.json({
          status: 'error',
          code: 1,
          message: err
        })
      }
      res.attachment(file.name)
      request({
        url: url,
        rejectUnauthorized: false,
        headers: {Referer: 'gump.oose.io'}
      }).pipe(res)
    }
  )
}
