'use strict';
var P = require('bluebird')
var ObjectManage = require('object-manage')
var Password = require('node-password').Password
var path = require('path')
var request = require('request')

var couch = require('../../helpers/couchbase')

var config = require('../../config')

//open some buckets
var cb = couch.stretchfs()

//make some promises
request = P.promisify(request)


/**
 * Job detail
 * @param {object} req
 * @param {object} res
 */
exports.detail = function(req,res){
  var handle = req.body.handle
  cb.getAsync(handle)
    .then(function(result){
      if(!result || !result.value) throw new Error('No job found')
      res.json(result.value)
    })
    .catch(function(err){
      res.json({error: err.message})
    })
}


/**
 * Create job
 * @param {object} req
 * @param {object} res
 */
exports.create = function(req,res){
  var data = req.body
  var job = {}
  if('string' === typeof data.description){
    data.description = JSON.parse(data.description)
  }
  P.try(function(){
    var jobHandle = new Password({length: 12, special: false}).toString()
    job = {
      handle: jobHandle,
      description: data.description,
      priority: +data.priority || 10,
      category: data.category || 'resource',
      status: 'staged',
      createdAt: new Date().toJSON(),
      user: {
        session: req.session
      }
    }
    return cb.upsertAsync(jobHandle,job,{expiry: config.job.recordLife})
  })
    .then(function(){
      res.json(job)
    })
    .catch(function(err){
      res.json({error: err.message})
    })
}


/**
 * Update a job
 * @param {object} req
 * @param {object} res
 */
exports.update = function(req,res){
  var handle = req.body.handle
  var description = req.body.description
  var priority = req.body.priority
  var status = req.body.status
  var force = req.query.force || false
  var job = new ObjectManage()
  cb.getAsync(handle)
    .then(function(result){
      if(!result || !result.value) throw new Error('No job found for update')
      job.$load(result.value)
      if('staged' !== job.status && !force)
        throw new Error('Job cannot be updated after being started')
      if(description) job.$load({description: description})
      if(priority) job.priority = priority
      if(status && force) job.status = status
      job.updatedAt = new Date().toJSON()
      return cb.upsertAsync(handle,job.$strip(),{cas: result.cas})
    })
    .then(function(){
      res.json(job.$strip())
    })
    .catch(function(err){
      res.json({error: err.message})
    })
}


/**
 * Remove a job
 * @param {object} req
 * @param {object} res
 */
exports.remove = function(req,res){
  var handle = req.body.handle
  cb.removeAsync(handle)
    .then(function(){
      res.json({success: 'Job removed', count: 1})
    })
    .catch(function(err){
      res.json({error: err.message})
    })
}


/**
 * Start a job
 * @param {object} req
 * @param {object} res
 */
exports.start = function(req,res){
  var handle = req.body.handle
  var job = {}
  cb.getAsync(handle)
    .then(function(result){
      if(!result || !result.value) throw new Error('No job found for start')
      job = result.value
      if('staged' !== job.status)
        throw new Error('Job cannot be started after being started')
      job.status = 'queued'
      return cb.upsertAsync(handle,job,{cas: result.cas})
    })
    .then(function(){
      res.json(job)
    })
    .catch(function(err){
      res.json({error: err.message})
    })
}


/**
 * Retry a job
 * @param {object} req
 * @param {object} res
 */
exports.retry = function(req,res){
  var handle = req.body.handle
  var job = {}
  var validStatus = [
    'error',
    'timeout',
    'aborted',
    'unknown',
    'complete',
    'processing',
    'archived'
  ]
  cb.getAsync(handle)
    .then(function(result){
      if(!result || !result.value) throw new Error('No job found for retry')
      job = result.value
      if(validStatus.indexOf(job.status) < 0){
        throw new Error(
          'Job cannot be retried ' +
          'with a status of ' + job.status
        )
      }
      job.status = 'queued_retry'
      //If processing, let the same worker handle it
      if(job.status !== 'processing'){
        job.worker = null
      }
      job.retriedAt = new Date().toJSON()
      return cb.upsertAsync(handle,job,{cas: result.cas})
    })
    .then(function(){
      res.json(job)
    })
    .catch(function(err){
      res.json({error: err.message})
    })
}


/**
 * Abort a job
 * @param {object} req
 * @param {object} res
 */
exports.abort = function(req,res){
  var handle = req.body.handle
  var job = {}
  cb.getAsync(handle)
    .then(function(result){
      if(!result || !result.value) throw new Error('No job found for abort')
      job = result.value
      if('processing' !== job.status)
        throw new Error('Job cannot be aborted when not processing')
      job.status = 'queued_abort'
      job.abortedAt = new Date().toJSON()
      return cb.upsertAsync(handle,job,{cas: result.cas})
    })
    .then(function(){
      res.json(job)
    })
    .catch(function(err){
      res.json({error: err.message})
    })
}


/**
 * Check if content exists on a worker
 * @param {object} req
 * @param {object} res
 */
exports.contentExists = function(req,res){
  var handle = req.body.handle
  var file = req.body.file
  var job = {}
  var exists = false
  cb.getAsync(handle)
    .then(function(result){
      if(!result || !result.value) throw new Error('No job found')
      job = result.value
      job.manifest.forEach(function(val){
        if(path.basename(val) === file) exists = true
      })
      res.json({
        exists: exists
      })
    })
    .catch(function(err){
      res.json({error: err.message})
    })
}


/**
 * Redirect to a real file download link
 * @param {object} req
 * @param {object} res
 */
exports.contentDownload = function(req,res){
  var handle = req.params.handle
  var file = req.params.file
  var job = {}
  var worker = {}
  cb.getAsync(handle)
    .then(function(result){
      if(!result || !result.value) throw new Error('No job found')
      job = result.value
      return cb.getAsync(job.workerKey)
    })
    .then(function(result){
      worker = result.value
      var url = 'https://' + worker.host + ':' + worker.port +
        '/job/content/download/' + handle + '/' + file
      res.redirect(302,url)
    })
    .catch(Error,function(err){
      res.json({error: err.message})
    })
}
