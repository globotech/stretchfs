'use strict';
var P = require('bluebird')

var list = require('../helpers/list')
var couch = require('../../helpers/couchbase')

//open couch buckets
var couchPeer = couch.peer()


/**
 * List Prisms
 * @param {object} req
 * @param {object} res
 */
exports.list = function(req,res){
  var limit = parseInt(req.query.limit,10) || 10
  var start = parseInt(req.query.start,10) || 0
  var search = req.query.search || ''
  if(start < 0) start = 0
  var qstring = 'SELECT b.* FROM ' +
    couch.getName(couch.type.PEER,true) + ' b ' +
    ' WHERE META(b).id LIKE $1 ' +
    (limit ? ' LIMIT ' + limit + ' OFFSET ' + start : '')
  var query = couch.N1Query.fromString(qstring)
  var prismKey = couch.schema.prism(search) + '%'
  couchPeer.queryAsync(query,[prismKey])
    .then(function(result){
      res.render('prism/list',{
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
    .each(function(prismKey){
      return couchPeer.removeAsync(prismKey)
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
  couchPeer.getAsync(prismKey)
    .then(function(result){
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
  var prismKey = couch.schema.prism(req.body.name)
  var doc
  couchPeer.getAsync(prismKey)
    .then(function(result){
      doc = result.value
      if(!doc) doc = {}
      if(data.name) doc.name = data.name
      if(data.group) doc.group = data.group
      if(data.host) doc.host = data.host
      if(data.port) doc.port = data.port
      doc.full = !!data.full
      doc.active = !!data.active
      return couchPeer.upsertAsync(prismKey,doc,{cas: result.cas})
    })
    .then(function(){
      req.flash('success','Staff member saved')
      res.redirect('/staff/edit?email=' + doc.email)
    })
    .catch(function(err){
      res.render('error',{error: err})
    })
}
