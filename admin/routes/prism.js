'use strict';
var P = require('bluebird')

var prism = require('../helpers/prism')
var list = require('../helpers/list')
var couch = require('../../helpers/couchbase')

//open couch buckets
var couchStretch = couch.stretchfs()


/**
 * List Prisms
 * @param {object} req
 * @param {object} res
 */
exports.list = function(req,res){
  var limit = parseInt(req.query.limit,10) || 10
  var start = parseInt(req.query.start,10) || 0
  var search = req.query.search || ''
  list.listQuery(couch,couchStretch,couch.type.STRETCHFS,
    couch.schema.prism(search),'name',true,start,limit)
    .then(function(result){
      res.render('prism/list',{
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
    .each(function(prismKey){
      return couchStretch.removeAsync(prismKey)
    })
    .then(function(){
      req.flash('success','Prism(s) removed successfully')
      res.redirect('/prism/list')
    })
}


/**
 * Create Prism
 * @param {object} req
 * @param {object} res
 */
exports.create = function(req,res){
  res.render('prism/create')
}


/**
 * Edit Prism
 * @param {object} req
 * @param {object} res
 */
exports.edit = function(req,res){
  var prismKey = couch.schema.prism(req.query.name)
  couchStretch.getAsync(prismKey)
    .then(function(result){
      result.value._id = prismKey
      res.render('prism/edit',{prism: result.value})
    })
    .catch(function(err){
      res.render('error',{error: err.message})
    })
}


/**
 * Save prism
 * @param {object} req
 * @param {object} res
 */
exports.save = function(req,res){
  var data = req.body
  var prismKey = couch.schema.prism(data.name)
  var doc
  couchStretch.getAsync(prismKey)
    .then(function(result){
      doc = result.value
      if(!doc) doc = {createdAt: new Date().toJSON()}
      if(data.newName) doc.name = data.newName
      if(data.group) doc.group = data.group
      if(data.host) doc.host = data.host
      if(data.port) doc.port = data.port
      doc.roles = prism.roleUpdate(doc.roles,data)
      doc.updatedAt = new Date().toJSON()
      return couchStretch.upsertAsync(prismKey,doc,{cas: result.cas})
    })
    .then(function(){
      req.flash('success','Prism [' + data.name + '] saved')
      res.redirect('/prism/list')
    })
    .catch(function(err){
      res.render('error',{error: err})
    })
}
