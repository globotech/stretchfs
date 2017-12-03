'use strict';
var P = require('bluebird')

//var prism = require('../helpers/prism')
var listHelper = require('../helpers/list')
var formHelper = require('../helpers/form')
var couch = require('../../helpers/couchbase')

//open couch buckets
var cb = couch.stretchfs()


/**
 * List Prisms
 * @param {object} req
 * @param {object} res
 */
exports.list = function(req,res){
  var limit = parseInt(req.query.limit,10) || 10
  var start = parseInt(req.query.start,10) || 0
  var search = req.query.search || ''
  listHelper.listQuery(
    couch,
    cb,
    couch.type.stretchfs,
    couch.schema.prism(search),
    'name',
    true,
    start,
    limit
  )
    .then(function(result){
      res.render('prism/list',{
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
    .each(function(prismKey){
      if(-1 === prismKey.indexOf(':')){
        prismKey = couch.schema.prism(prismKey)
      }
      _flashPack.push(prismKey)
      return cb.removeAsync(prismKey)
    })
    .then(function(){
      _flashPack.forEach(function(prismKey){
        req.flashPug('success','subject-id-action',{
          subject: 'Prism',
          href: '/prism/edit?name=' + prismKey,
          id: prismKey,
          action: 'removed successfully'
        })
      })
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
  cb.getAsync(prismKey)
    .then(function(result){
      result.value._id = prismKey
      result.value.roles = result.value.roles.sort()
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
  return P.all([formHelper.diff(
    req,res,
    cb,'prism',{'name': req.body.name},
    [
    'host',
    'port',
    'httpPort',
    'roles'
    ]
  )])
}
