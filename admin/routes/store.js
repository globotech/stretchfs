'use strict';
var P = require('bluebird')

var listHelper = require('../helpers/list')
var formHelper = require('../helpers/form')
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
  listHelper.listQuery(couch,cb,couch.type.stretchfs,
    couch.schema.store(search),'name',true,start,limit)
    .then(function(result){
      res.render('store/list',{
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
  var _flashPack = []
  P.try(function(){
    return req.body.remove || []
  })
    .each(function(storeKey){
      if(-1 === storeKey.indexOf(':')){
        storeKey = couch.schema.store(storeKey)
      }
      _flashPack.push(storeKey)
      return cb.removeAsync(storeKey)
    })
    .then(function(){
      _flashPack.forEach(function(storeKey){
        req.flashPug('success','subject-id-action',{
          subject: 'Store',
          href: '/store/edit?name=' + storeKey,
          id: storeKey,
          action: 'removed successfully'
        })
      })
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
  var storeKey = couch.schema.store(req.query.name)
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
  return P.all([formHelper.diff(
    req,res,
    cb,'store',{'name': req.body.name},
    [
      'host',
      'port',
      'httpPort',
      'roles',
      'group'
    ]
  )])
}
