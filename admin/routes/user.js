'use strict';
var bcrypt = require('bcrypt')
var P = require('bluebird')

var list = require('../helpers/list')
var couch = require('../../helpers/couchbase')

//make some promises
P.promisifyAll(bcrypt)

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
  search = couch.schema.ooseUser(search) + '%'
  list.listQuery(couch,couchOOSE,couch.type.OOSE,search,'name',true,start,limit)
    .then(function(result){
      res.render('user/list',{
        page: list.pagination(start,result.count,limit),
        count: result.count,
        search: search,
        limit: limit,
        list: result.rows
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
  var userKey = req.body.id || ''
  P.try(function(){
    if(userKey){
      return couchOOSE.getAsync(userKey)
    } else {
      userKey = couch.schema.ooseUser(req.body.userName)
      return {value: {createdAt: new Date().toJSON()}, cas: null}
    }
  })
    .then(function(result){
      var doc = result.value
      if(data.userName) doc.name = data.userName
      if(req.body.userSecret === req.body.userSecretConfirm){
        doc.secretLastChanged = new Date().toJSON()
        doc.secret = bcrypt.hashSync(
          req.body.userSecret,bcrypt.genSaltSync(12))
      }
      if(data.roles) doc.roles = ['create','read','update','delete']
      doc.active = !!data.userActive
      doc.updatedAt = new Date().toJSON()
      return couchOOSE.upsertAsync(userKey,doc,{cas: result.cas})
    })
    .then(function(){
      req.flash('success','User saved')
      res.redirect('/user/edit?id=' + userKey)
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
  var userKey = req.query.id
  couchOOSE.getAsync(userKey)
    .then(function(result){
      if(!result) throw new Error('User not found')
      var user = result.value
      user._id = userKey
      res.render('user/edit',{
        user: user
      })
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
  var userKey = req.body.id
  couchOOSE.removeAsync(userKey)
    .then(function(){
      req.flash('success','User removed successfully')
      res.redirect('/user/list')
    })
}
