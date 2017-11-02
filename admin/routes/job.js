'use strict';
var P = require('bluebird')
var Password = require('node-password').Password

var list = require('../helpers/list')
var couch = require('../../helpers/couchbase')

//open couch buckets
var couchJob = couch.job()


/**
 * List Jobs
 * @param {object} req
 * @param {object} res
 */
exports.list = function(req,res){
  var limit = parseInt(req.query.limit,10) || 10
  var start = parseInt(req.query.start,10) || 0
  var search = req.query.search || ''
  list.listQuery(couch,couchJob,couch.type.JOB,search,'handle',true,start,limit)
    .then(function(result){
      res.render('job/list',{
        page: list.pagination(start,result.count,limit),
        count: result.count,
        search: search,
        limit: limit,
        list: result.rows
      })
    })
}


/**
 * List actions
 * @param {object} req
 * @param {object} res
 */
exports.listAction = function(req,res){
  P.try(function(){
    return req.body.remove || []
  })
    .each(function(jobKey){
      return couchJob.removeAsync(jobKey)
    })
    .then(function(){
      req.flash('success','Jobs(s) removed successfully')
      res.redirect('/job/list')
    })
}


/**
 * Create Job
 * @param {object} req
 * @param {object} res
 */
exports.create = function(req,res){
  res.render('job/create')
}


/**
 * Edit Job
 * @param {object} req
 * @param {object} res
 */
exports.edit = function(req,res){
  var jobKey = req.query.id
  couchJob.getAsync(jobKey)
    .then(function(result){
      result.value._id = jobKey
      res.render('job/edit',{job: result.value})
    })
    .catch(function(err){
      res.render('error',{error: err.message})
    })
}


/**
 * Save job
 * @param {object} req
 * @param {object} res
 */
exports.save = function(req,res){
  var data = req.body
  var jobKey = req.body.id || ''
  var doc
  P.try(function(){
    if(jobKey){
      return couchJob.getAsync(jobKey)
    } else {
      jobKey = couch.schema.job(
        new Password({length: 12, special: false}).toString())
      return {value: {createdAt: new Date().toJSON()}, cas: null}
    }
  })
    .then(function(result){
      doc = result.value
      if(data.description) doc.description = data.description
      if(data.category) doc.category = data.category
      if(data.priority) doc.priority = data.priority
      if(data.status) doc.status = data.status
      doc.updatedAt = new Date().toJSON()
      return couchJob.upsertAsync(jobKey,doc,{cas: result.cas})
    })
    .then(function(){
      req.flash('success','Job saved')
      res.redirect('/job/edit?id=' + jobKey)
    })
    .catch(function(err){
      res.render('error',{error: err})
    })
}
