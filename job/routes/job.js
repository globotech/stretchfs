'use strict';
var P = require('bluebird')
var fs = require('graceful-fs')
var infant = require('infant')

var job = require('../helpers/job')

//make some promises
P.promisifyAll(fs)
P.promisifyAll(infant)


/**
 * Job status
 * @param {object} req
 * @param {object} res
 */
exports.status = function(req,res){
  var handle = req.body.handle
  var jobFolder = job.folder(handle)
  var file = jobFolder + '/status.json'
  if(fs.existsSync(file))
    res.sendFile(file)
  else
    res.json({})
}


/**
 * Job content exists
 * @param {object} req
 * @param {object} res
 */
exports.contentExists = function(req,res){
  var handle = req.body.handle
  var file = req.body.file
  var jobFolder = job.folder(handle)
  res.json({
    exists: fs.existsSync(jobFolder + '/' + file)
  })
}


/**
 * Content download
 * @param {object} req
 * @param {object} res
 */
exports.contentDownload = function(req,res){
  var handle = req.params.handle
  var file = req.params.file
  var jobFolder = job.folder(handle)
  var filePath = jobFolder + '/' + file
  if(fs.existsSync(filePath)){
    res.sendFile(filePath)
  } else {
    res.status(404)
    res.end()
  }
}
