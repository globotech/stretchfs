'use strict';
var P = require('bluebird')

var list = require('../helpers/list')
var couch = require('../../helpers/couchbase')

//open couch buckets
var couchJob = couch.peer()


/**
 * List Jobs
 * @param {object} req
 * @param {object} res
 */
exports.list = function(req,res){
  var limit = parseInt(req.query.limit,10) || 10
  var start = parseInt(req.query.start,10) || 0
  var search = req.query.search || ''
  if(start < 0) start = 0
  var qstring = 'SELECT b.* FROM ' +
    couch.getName(couch.type.JOB,true) + ' b ' +
    ' WHERE META(b).id LIKE $1 ' +
    (limit ? ' LIMIT ' + limit + ' OFFSET ' + start : '')
  var query = couch.N1Query.fromString(qstring)
  var jobKey = couch.schema.job(search) + '%'
  couchJob.queryAsync(query,[jobKey])
    .then(function(result){
      res.render('job/list',{
        page: list.pagination(start,result.length,limit),
        count: result.length,
        search: search,
        limit: limit,
        list: result
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
  var jobKey = couch.schema.job(req.query.handle)
  couchJob.getAsync(jobKey)
    .then(function(result){
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
  var jobKey = couch.schema.prism(req.body.name)
  var doc
  couchJob.getAsync(jobKey)
    .then(function(result){
      doc = result.value
      if(!doc) doc = {}
      if(data.description) doc.description = data.description
      if(data.category) doc.category = data.category
      if(data.priority) doc.priority = data.priority
      if(data.status) doc.status = data.status
      return couchJob.upsertAsync(jobKey,doc,{cas: result.cas})
    })
    .then(function(){
      req.flash('success','Job saved')
      res.redirect('/job/edit?handle=' + doc.handle)
    })
    .catch(function(err){
      res.render('error',{error: err})
    })
}
