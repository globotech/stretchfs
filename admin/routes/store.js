'use strict';
var P = require('bluebird')

var list = require('../helpers/list')
var couch = require('../../helpers/couchbase')

//open couch buckets
var couchStretch = couch.stretchfs()


/**
 * List Stores
 * @param {object} req
 * @param {object} res
 */
exports.list = function(req,res){
  var limit = parseInt(req.query.limit,10) || 10
  var start = parseInt(req.query.start,10) || 0
  var search = req.query.search || ''
  list.listQuery(couch,couchStretch,couch.type.STRETCHFS,
    couch.schema.store(search),'name',true,start,limit)
    .then(function(result){
      res.render('store/list',{
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
    .each(function(storeKey){
      return couchStretch.removeAsync(storeKey)
    })
    .then(function(){
      req.flash('success','Store(s) removed successfully')
      res.redirect('/store/list')
    })
}


/**
 * Create Store
 * @param {object} req
 * @param {object} res
 */
exports.create = function(req,res){
  res.render('store/create')
}


/**
 * Edit Store
 * @param {object} req
 * @param {object} res
 * @return {*}
 */
exports.edit = function(req,res){
  var storeKey = req.query.id
  couchStretch.getAsync(storeKey)
    .then(function(result){
      result.value._id = storeKey
      result.value.prismKey = couch.schema.prism(result.value.prism)
      res.render('store/edit',{store: result.value})
    })
    .catch(function(err){
      res.render('error',{error: err.message})
    })
}


/**
 * Remove store
 * @param {object} req
 * @param {object} res
 * @return {*}
 */
exports.remove = function(req,res){
  var storeKey = req.body.id
  couchStretch.removeAsync(storeKey)
    .then(function(){
      req.flash('success','Store removed successfully')
      res.redirect('/store/list')
    })
}


/**
 * Save Store
 * @param {object} req
 * @param {object} res
 * @return {*}
 */
exports.save = function(req,res){
  var data = req.body
  var storeKey = req.body.id
  var doc
  couchStretch.getAsync(storeKey)
    .then(function(result){
      doc = result.value
      if(!doc) doc = {createdAt: new Date().toJSON()}
      if(data.name) doc.name = data.name
      if(data.port) doc.port = data.port
      if(data.host) doc.host = data.host
      doc.writable = !!data.writable
      doc.available = !!data.available
      doc.active = !!data.active
      doc.updatedAt = new Date().toJSON()
      return couchStretch.upsertAsync(storeKey,doc,{cas: result.cas})
    })
    .then(function(){
      req.flash('success','Store saved')
      res.redirect('/store/edit?id=' + storeKey)
    })
    .catch(function(err){
      res.render('error',{error: err})
    })
}
