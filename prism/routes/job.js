'use strict';
var P = require('bluebird')
var request = require('request')

var couch = require('../../helpers/couchbase')

var ooseJob = couch.job()
var oosePeer = couch.peer()

var config = require('../../config')

var shredder = {}

//make some promises
request = P.promisify(request)


/**
 * Job detail
 * @param {object} req
 * @param {object} res
 */
exports.detail = function(req,res){
  var handle = req.body.handle
  ooseJob.find({where: {handle: handle}, include: [oosePeer]})
    .then(function(result){
      if(!result) throw new Error('No job found')
      if('processing' === result.status){
        //here we want to query the worker for an updated status
        var workerConfig = {
          host: result.Worker.host,
          port: result.Worker.port,
          username: config.worker.username,
          password: config.worker.password
        }
        var client = shredder.api.worker(workerConfig)
        return client.postAsync({
          url: client.url('/job/status'),
          json: {
            handle: handle
          }
        })
          .spread(client.validateResponse())
          .spread(function(res,body){
            if(body.statusDescription)
              result.statusDescription = body.statusDescription
            if(body.stepTotal)
              result.stepTotal = body.stepTotal
            if(body.stepComplete)
              result.stepComplete = body.stepComplete
            if(body.frameTotal)
              result.frameTotal = body.frameTotal
            if(body.frameComplete)
              result.frameComplete = body.frameComplete
            if(body.frameDescription)
              result.frameDescription = body.frameDescription
            return result.save()
          })
      } else {
        return result
      }
    })
    .then(function(result){
      res.json(result.dataValues)
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
  if('object' === typeof data.description)
    data.description = JSON.stringify(data.description)
  ooseJob.create({
    handle: ooseJob.generateHandle(),
    description: data.description,
    priority: data.priority,
    category: data.category || 'resource',
    UserId: req.session.User.id
  })
    .then(function(result){
      res.json(result.dataValues)
    })
    .catch(couch.ValidationError,function(err){
      res.json({error: couch.validationErrorToString(err)})
    })
    .catch(couch.UniqueConstraintError,function(){
      res.json({error: 'Handle already exists, please re-submit'})
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
  var data = req.body
  ooseJob.find({where: {handle: data.handle}})
    .then(function(result){
      if(!result) throw new Error('No job found for update')
      if('staged' !== result.status && !req.query.force)
        throw new Error('Job cannot be updated after being started')
      if(data.description) result.description = data.description
      if(data.priority) result.priority = data.priority
      if(data.status && req.query.force) result.status = data.status
      return result.save()
    })
    .then(function(result){
      res.json(result.dataValues)
    })
    .catch(couch.ValidationError,function(err){
      res.json({error: couch.validationErrorToString(err)})
    })
    .catch(Error,function(err){
      res.json({error: err.message})
    })
}


/**
 * Remove a job
 * @param {object} req
 * @param {object} res
 */
exports.remove = function(req,res){
  var data = req.body
  ooseJob.find({where: {handle: data.handle}})
    .then(function(result){
      //&& !req.query.force
      if(result && 'processing' === result.status){
        //Mark it for removal,
        // we report it as done anyway,
        // it's not like anyone is waiting to know if this succeeded.
        result.status = 'removed';
        return result.save()
      }
      return ooseJob.destroy({where: {handle: data.handle}})
    })
    .then(function(count){
      res.json({success: 'Job removed', count: count})
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
  var data = req.body
  ooseJob.find({where: {handle: data.handle}})
    .then(function(result){
      if(!result) throw new Error('No job found for start')
      if('staged' !== result.status)
        throw new Error('Job cannot be started after being started')
      result.status = 'queued'
      return result.save()
    })
    .then(function(result){
      res.json(result.dataValues)
    })
    .catch(couch.ValidationError,function(err){
      res.json({error: couch.validationErrorToString(err)})
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
  var data = req.body
  var validStatus = [
    'error',
    'timeout',
    'aborted',
    'unknown',
    'complete',
    'processing',
    'archived'
  ]
  ooseJob.find({where: {handle: data.handle}})
    .then(function(result){
      if(!result) throw new Error('No job found for retry')
      if(validStatus.indexOf(result.status) < 0){
        throw new Error(
          'Job cannot be retried ' +
          'with a status of ' + result.status
        )
      }
      result.status = 'queued_retry'
      //If processing, let the same worker handle it
      if(result.status !== 'processing'){
        result.WorkerId = null
      }
      return result.save()
    })
    .then(function(result){
      res.json(result.dataValues)
    })
    .catch(couch.ValidationError,function(err){
      res.json({error: couch.validationErrorToString(err)})
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
  var data = req.body
  ooseJob.find({where: {handle: data.handle}})
    .then(function(result){
      if(!result) throw new Error('No job found for abort')
      if('processing' !== result.status)
        throw new Error('Job cannot be aborted when not processing')
      result.status = 'queued_abort'
      return result.save()
    })
    .then(function(result){
      res.json(result.dataValues)
    })
    .catch(couch.ValidationError,function(err){
      res.json({error: couch.validationErrorToString(err)})
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
  ooseJob.find({where: {handle: handle}, include: [oosePeer]})
    .then(function(result){
      if(!result) throw new Error('No job found')
      //here we want to query the worker for content existence
      var workerConfig = {
        host: result.Worker.host,
        port: result.Worker.port,
        username: config.worker.username,
        password: config.worker.password
      }
      var client = shredder.api.worker(workerConfig)
      return client.postAsync({
        url: client.url('/job/content/exists'),
        json: {
          handle: handle,
          file: file
        }
      })
        .spread(client.validateResponse())
        .spread(function(response,body){
          res.json({
            exists: body.exists
          })
        })
        .catch(client.handleNetworkError)
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
  ooseJob.find({where: {handle: handle}, include: [oosePeer]})
    .then(function(result){
      if(!result) throw new Error('No job found')
      //here we setup the worker so we can use the url generator
      var workerConfig = {
        host: result.Worker.host,
        port: result.Worker.port,
        username: config.worker.username,
        password: config.worker.password
      }
      var client = shredder.api.worker(workerConfig)
      res.redirect(
        302,
        client.url('/job/content/download/' + handle + '/' + file)
      )
    })
    .catch(Error,function(err){
      res.json({error: err.message})
    })
}
