'use strict';
var P = require('bluebird')

var list = require('../helpers/list')
var couch = require('../../helpers/couchbase')
var purchasedb = require('../../helpers/purchasedb')

var config = require('../../config')

//open couch buckets
var cb = couch.stretchfs()


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
    cb,
    couch.type.STRETCHFS,
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
  var remove = req.body.remove || []
  P.try(function(){
    return remove
  })
    .each(function(purchaseKey){
      return cb.removeAsync(purchaseKey)
    })
    .then(function(){
      req.flashPug('success','subject-id-action',{
        subject: 'Purchase'+(1!==remove.length)?'s':'',
        id: remove.join(','),
        href: false,
        action: 'removed successfully'
      })
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
  cb.getAsync(purchaseKey)
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
  var life = (+req.body.life) || (+config.purchase.life)
  var lifeMs = 1000 * life
  var timestamp = new Date()
  var doc
  P.try(function(){
    if(purchaseKey){
      return cb.getAsync(purchaseKey)
    } else {
      purchaseKey = purchasedb.generate()
      return {
        value: {
          life: life,
          afterLife: config.purchase.afterLife,
          expirationDate: new Date(+timestamp + lifeMs).toJSON(),
          createdAt: timestamp.toJSON()
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
      doc.expirationDate = new Date(+(new Date(doc.createdAt)) + lifeMs).toJSON()
      doc.updatedAt = timestamp.toJSON()
      return cb.upsertAsync(purchaseKey,doc,{cas: result.cas})
    })
    .then(function(){
      req.flashPug('success','subject-id-action',
        {
          subject: 'Purchase',
          id: purchaseKey,
          action: 'saved',
          href: '/purchase/edit?id=' + purchaseKey
        }
      )
      res.redirect('/purchase/list')
    })
    .catch(function(err){
      res.render('error',{error: err})
    })
}
