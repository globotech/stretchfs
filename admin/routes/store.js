'use strict';
var P = require('bluebird')

var list = require('../helpers/list')
var couch = require('../../helpers/couchbase')

//open couch buckets
var couchPeer = couch.peer()


/**
 * List Stores
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
  var storeKey = couch.schema.store(search) + '%'
  couchPeer.queryAsync(query,[storeKey])
    .then(function(result){
      res.render('store/list',{
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
    .each(function(storeKey){
      return couchPeer.removeAsync(storeKey)
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
  var storeKey = couch.schema.store(req.query.name)
  couchPeer.getAsync(storeKey)
    .then(function(result){
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
  var storeKey = couch.schema.store(req.body.name)
  couchPeer.removeAsync(storeKey)
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
  var storeKey = couch.schema.store(req.body.name)
  var doc
  couchPeer.getAsync(storeKey)
    .then(function(result){
      doc = result.value
      if(!doc) doc = {}
      if(data.name) doc.name = data.name
      if(data.port) doc.port = data.port
      if(data.host) doc.host = data.host
      doc.full = !!data.full
      doc.active = !!data.active
      return couchPeer.upsertAsync(storeKey,doc,{cas: result.cas})
    })
    .then(function(){
      req.flash('success','Store saved')
      res.redirect('/store/edit?name=' + doc.name)
    })
    .catch(function(err){
      res.render('error',{error: err})
    })
}
