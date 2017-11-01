'use strict';
var P = require('bluebird')

var list = require('../helpers/list')
var couch = require('../../helpers/couchbase')

//open couch buckets
var couchOOSE = couch.oose()


/**
 * List users
 * @param {object} req
 * @param {object} res
 */
exports.list = function(req,res){
  var limit = +req.query.limit || 10
  var start = +req.query.start || 0
  var search = req.query.search || ''
  if(start < 0) start = 0
  var qstring = 'SELECT b.* FROM ' +
    couch.getName(couch.type.OOSE,true) + ' b ' +
    ' WHERE META(b).id LIKE $1 ' +
    (limit ? ' LIMIT ' + limit + ' OFFSET ' + start : '')
  var query = couch.N1Query.fromString(qstring)
  var userKey = couch.schema.ooseUser(search) + '%'
  couchOOSE.queryAsync(query,[userKey])
    .then(function(result){
      res.render('user/list',{
        page: list.pagination(start,result.length,limit),
        count: result.length,
        search: search,
        limit: limit,
        list: result
      })
    })
}


/**
 * List action
 * @param {object} req
 * @param {object} res
 */
exports.listAction = function(req,res){
  P.try(function(){
    return req.body.remove || []
  })
    .each(function(userKey){
      return couchOOSE.removeAsync(userKey)
    })
    .then(function(){
      req.flash('success','User(s) removed successfully')
      res.redirect('/user/list')
    })
}


/**
 * User find
 * @param {object} req
 * @param {object} res
 */
exports.find = function(req,res){
  var data = req.body
  var email = data.email
  var userKey = couch.schema.ooseUser(email)
  couchOOSE.getAsync(userKey)
    .then(function(result){
      if(!result) throw new Error('No user found')
      var values = result.value
      delete values.password
      res.json(values)
    })
    .catch(function(err){
      res.json({error: err.message})
    })
}


/**
 * Create User
 * @param {object} req
 * @param {object} res
 */
exports.create = function(req,res){
  res.render('user/create')
}


/**
 * Create User
 * @param {object} req
 * @param {object} res
 */
exports.save = function(req,res){
  var data = req.body
  var userKey = couch.schema.prism(req.body.name)
  var doc
  couchOOSE.getAsync(userKey)
    .then(function(result){
      doc = result.value
      if(!doc) doc = {}
      if(data.name) doc.name = data.name
      if(data.password) doc.password = data.password
      if(data.roles) doc.roles = ['create','read','update','delete']
      data.active = true
      return couchOOSE.upsertAsync(userKey,doc,{cas: result.cas})
    })
    .then(function(){
      req.flash('success','User saved')
      res.redirect('/user/edit?email=' + doc.email)
    })
    .catch(function(err){
      res.render('error',{error: err})
    })
}


/**
 * User edit form
 * @param {object} req
 * @param {object} res
 */
exports.edit = function(req,res){
  var data = req.query
  var userKey = couch.schema.ooseUser(data.email)
  couchOOSE.getAsync(userKey)
    .then(function(result){
      if(!result) throw new Error('User not found')
      var user = result.value
      res.render('user/edit',{
        user: user,
        sessions: result.rows
      })
    })
    .catch(function(err){
      res.json({error: err.message})
    })
}


/**
 * Update a user
 * @param {object} req
 * @param {object} res
 */
exports.update = function(req,res){
  var data = req.query
  var userKey = couch.schema.ooseUser(data.email)
  couchOOSE.getAsync(userKey)
    .then(function(result){
      if(!result) throw new Error('No user found for update')
      result.value.active = (data.active)
      return couchOOSE.upsertAsync(userKey,result.value,{cas: result.cas})
    })
    .then(function(){
      req.flash('Success:', 'User updated')
      res.redirect('/user/list')
    })
    .catch(function(err){
      res.json({error: err.message})
    })
}


/**
 * Remove a user
 * @param {object} req
 * @param {object} res
 */
exports.remove = function(req,res){
  var userKey = couch.schema.prism(req.body.email)
  couchOOSE.removeAsync(userKey)
    .then(function(){
      req.flash('success','User removed successfully')
      res.redirect('/user/list')
    })
}
