'use strict';
var P = require('bluebird')

var list = require('../helpers/list')
var couch = require('../../helpers/couchbase')

//open couch buckets
var oosePeer = couch.peer()


/**
 * List Prisms
 * @param {object} req
 * @param {object} res
 */
exports.list = function(req,res){
  var limit = parseInt(req.query.limit,10) || 10
  var start = parseInt(req.query.start,10) || 0
  var search = req.query.search || ''
  list.listQuery(couch,oosePeer,couch.type.PEER,
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
      return oosePeer.removeAsync(prismKey)
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
  var prismKey = req.query.id
  oosePeer.getAsync(prismKey)
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
  var prismKey = req.body.id
  var doc
  oosePeer.getAsync(prismKey)
    .then(function(result){
      doc = result.value
      if(!doc) doc = {createdAt: new Date().toJSON()}
      if(data.name) doc.name = data.name
      if(data.group) doc.group = data.group
      if(data.host) doc.host = data.host
      if(data.port) doc.port = data.port
      doc.writable = !!data.writable
      doc.available = !!data.available
      doc.active = !!data.active
      doc.updatedAt = new Date().toJSON()
      return oosePeer.upsertAsync(prismKey,doc,{cas: result.cas})
    })
    .then(function(){
      req.flash('success','Prism saved')
      res.redirect('/prism/edit?id=' + prismKey)
    })
    .catch(function(err){
      res.render('error',{error: err})
    })
}
