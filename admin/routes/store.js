'use strict';
var P = require('bluebird')

var list = require('../helpers/list')
var couch = require('../../helpers/couchbase')

//open couch buckets
var cb = couch.stretchfs()


/**
 * List Stores
 * @param {object} req
 * @param {object} res
 */
exports.list = function(req,res){
  var limit = parseInt(req.query.limit,10) || 10
  var start = parseInt(req.query.start,10) || 0
  var search = req.query.search || ''
  list.listQuery(couch,cb,couch.type.stretchfs,
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
      return cb.removeAsync(storeKey)
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
  cb.getAsync(storeKey)
    .then(function(result){
      result.value._id = storeKey
      result.value.prismPrefix = couch.schema.prism()
      if(('object' !== typeof result.value.group) && !Array.isArray(result.value.group)){
        result.value.group = []
      }
      if(result.value.prism){
        result.value.prismKey = couch.schema.prism(result.value.prism)
        if(-1 === result.value.group.indexOf(result.value.prismKey)){
          result.value.group.push(result.value.prismKey)
        }
      } else {
        result.value.group.forEach(function(g){
          if(0 === g.indexOf(couch.schema.prism())){
            result.value.prismKey = g
            result.value.prism = g.slice(couch.schema.prism().length)
          }
        })
      }
      result.value.group = result.value.group.sort()
      result.value.roles = result.value.roles.sort()
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
  cb.removeAsync(storeKey)
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
  cb.getAsync(storeKey)
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
      return cb.upsertAsync(storeKey,doc,{cas: result.cas})
    })
    .then(function(){
      req.flashPug('success','subject-id-action',
        {
          subject: 'Store',
          id: storeKey,
          action: 'saved',
          href: '/store/edit?id=' + storeKey
        }
      )
      res.redirect('/store/list')
    })
    .catch(function(err){
      res.render('error',{error: err})
    })
}
