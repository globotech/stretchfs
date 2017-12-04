'use strict';
var P = require('bluebird')
var Password = require('node-password').Password

var listHelper = require('../helpers/list')
var formHelper = require('../helpers/form')
var couch = require('../../helpers/couchbase')

//open couch buckets
var cb = couch.stretchfs()


/**
 * List Jobs
 * @param {object} req
 * @param {object} res
 */
exports.list = function(req,res){
  var limit = parseInt(req.query.limit,10) || 10
  var start = parseInt(req.query.start,10) || 0
  var search = req.query.search || ''
  listHelper.listQuery(
    couch,cb,couch.type.stretchfs,
    couch.schema.job(search),'handle',true,start,limit
  )
    .then(function(result){
      res.render('job/list',{
        page: listHelper.pagination(start,result.count,limit),
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
      return cb.removeAsync(jobKey)
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
  var jobKey = couch.schema.job(req.query.token)
  cb.getAsync(jobKey)
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
  var form = req.body
  var jobKey = form.id || couch.schema.job(form.token)
  var timestamp = new Date()
  var doc = {}
  P.try(function(){
    if(jobKey){
      return cb.getAsync(jobKey)
    } else {
      jobKey = couch.schema.job(
        new Password({length: 12, special: false}).toString())
      return {value: {createdAt: timestamp.toJSON()}, cas: null}
    }
  })
    .then(function(result){
      doc = result.value
      var rv = formHelper.compare(result.value,form,[
        'description',
        'category',
        'priority',
        'status'
      ],timestamp)
      if(rv.updated){
        return cb.upsertAsync(jobKey,rv.doc,{cas: result.cas})
      } else {
        return P.try(function(){return rv.updated})
      }
    })
    .then(function(updated){
      var alert = {
        subject: 'Job',
        href: '/job/edit?token=' + form.token,
        id: form.token
      }
      if(false !== updated){
        alert.action = 'saved'
        req.flashPug('success','subject-id-action',alert)
      } else {
        alert.action = 'unchanged (try again?)'
        req.flashPug('warning','subject-id-action',alert)
      }
      res.redirect('/job/list')
    })
    .catch(function(err){
      res.render('error',{error: err})
    })
}
