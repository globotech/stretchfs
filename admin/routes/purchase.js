'use strict';
var P = require('bluebird')

var list = require('../helpers/list')
var couch = require('../../helpers/couchbase')
var purchasedb = require('../../helpers/purchasedb')

var config = require('../../config')

//open couch buckets
var stretchfsPurchase = couch.purchase()


/**
 * List Jobs
 * @param {object} req
 * @param {object} res
 */
exports.list = function(req,res){
  var limit = parseInt(req.query.limit,10) || 10
  var offset = parseInt(req.query.start,10) || 0
  var search = req.query.search || ''
  list.listQuery(
    couch,
    stretchfsPurchase,
    couch.type.PURCHASE,
    search,
    '_id',
    true,
    offset,
    limit
  )
    .then(function(result){
      res.render('purchase/list',{
        page: list.pagination(offset,result.count,limit),
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
    .each(function(purchaseKey){
      return stretchfsPurchase.removeAsync(purchaseKey)
    })
    .then(function(){
      req.flash('success','Purchase(s) removed successfully')
      res.redirect('/purchase/list')
    })
}


/**
 * Create Purchase
 * @param {object} req
 * @param {object} res
 */
exports.create = function(req,res){
  res.render('purchase/create')
}


/**
 * Edit Purchase
 * @param {object} req
 * @param {object} res
 */
exports.edit = function(req,res){
  var purchaseKey = req.query.id
  stretchfsPurchase.getAsync(purchaseKey)
    .then(function(result){
      result.value._id = purchaseKey
      res.render('purchase/edit',{purchase: result.value})
    })
    .catch(function(err){
      res.render('error',{error: err.message})
    })
}


/**
 * Save purchase
 * @param {object} req
 * @param {object} res
 */
exports.save = function(req,res){
  var data = req.body
  var purchaseKey = req.body.id || ''
  var life = req.body.life || config.purchase.life
  var doc
  P.try(function(){
    if(purchaseKey){
      return stretchfsPurchase.getAsync(purchaseKey)
    } else {
      purchaseKey = purchasedb.generate()
      return {
        value: {
          life: life,
          afterLife: config.purchase.afterLife,
          expirationDate: '' + (+new Date() + life),
          createdAt: new Date().toJSON()
        },
        cas: null
      }
    }
  })
    .then(function(result){
      doc = result.value
      if(data.hash) doc.hash = data.hash
      if(data.ext) doc.ext = data.ext
      if(data.referrer) doc.referrer = data.referrer
      doc.updatedAt = new Date().toJSON()
      return stretchfsPurchase.upsertAsync(purchaseKey,doc,{cas: result.cas})
    })
    .then(function(){
      req.flash('success','Purchase saved')
      res.redirect('/purchase/edit?id=' + purchaseKey)
    })
    .catch(function(err){
      res.render('error',{error: err})
    })
}
