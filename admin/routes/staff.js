'use strict';
var P = require('bluebird')

var list = require('../helpers/list')
var couch = require('../../helpers/couchbase')

//open buckets
var couchOOSE = couch.oose()


/**
 * List staff members
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
  var staffKey = couch.schema.ooseStaff(search) + '%'
  couchOOSE.queryAsync(query,[staffKey])
    .then(function(result){
      res.render('staff/list',{
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
    .each(function(staffKey){
      return couchOOSE.removeAsync(staffKey)
    })
    .then(function(){
      req.flash('success','Staff removed successfully')
      res.redirect('/staff/list')
    })
}


/**
 * Create staff member
 * @param {object} req
 * @param {object} res
 */
exports.create = function(req,res){
  res.render('staff/create')
}


/**
 * Staff edit form
 * @param {object} req
 * @param {object} res
 */
exports.edit = function(req,res){
  var staffKey = couch.schema.ooseStaff(req.query.email)
  couchOOSE.getAsync(staffKey)
    .then(function(result){
      res.render('staff/edit',{staff: result.value})
    })
    .catch(function(err){
      res.render('error',{error: err.message})
    })
}


/**
 * Save staff member
 * @param {object} req
 * @param {object} res
 */
exports.save = function(req,res){
  var staffKey = couch.schema.ooseStaff(req.body.email)
  couchOOSE.getAsync(staffKey)
    .then(function(result){
      var doc = result.value
      if(!doc) doc = {}
      doc.name = req.body.name
      doc.email = req.body.email
      if(req.body.password) doc.password = req.body.password
      doc.active = !!req.body.active
      return couchOOSE.upsertAsync(staffKey,doc,{cas: result.cas})
    })
    .then(function(staff){
      req.flash('success','Staff member saved')
      res.redirect('/staff/edit?id=' + staff.id)
    })
    .catch(function(err){
      res.render('error',{error: err})
    })
}


/**
 * Staff login
 * @param {object} req
 * @param {object} res
 */
exports.login = function(req,res){
  res.render('login')
}


/**
 * Login action
 * @param {object} req
 * @param {object} res
 */
exports.loginAction = function(req,res){
  var staffKey = couch.schema.ooseStaff(req.body.email)
  couchOOSE.getAsync(staffKey)
    .then(function(result){
      if(!result) throw new Error('Invalid login')
      if(result.value.password !== req.body.password)
        throw new Error('Invalid login')
      //otherwise we are valid start the session
      req.session.staff = result.value
      res.redirect('/')
    })
    .catch(function(err){
      console.log('login error',err.stack)
      req.flash('error',err.message)
      res.redirect('/login')
    })
}


/**
 * Staff logout
 * @param {object} req
 * @param {object} res
 */
exports.logout = function(req,res){
  delete req.session.staff
  res.redirect('/login')
}
