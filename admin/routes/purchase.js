'use strict';
var P = require('bluebird')

var listHelper = require('../helpers/list')
var formHelper = require('../helpers/form')
var couch = require('../../helpers/couchbase')
var purchasedb = require('../../helpers/purchase')
var hashListAll = require('../helpers/inventory').hashListAll


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
  listHelper.listQuery(
    couch,
    cb,
    couch.type.stretchfs,
    couch.schema.purchase(search),
    '_id',
    true,
    offset,
    limit
  )
    .then(function(result){
      res.render('purchase/list',{
        page: listHelper.pagination(offset,result.count,limit),
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
  hashListAll()
    .then(function(result){
      res.render('purchase/create',{
        hashes: result
      })
    })
    .catch(function(err){
      res.render('error',{error: err.message})
    })
}


/**
 * Edit Purchase
 * @param {object} req
 * @param {object} res
 */
exports.edit = function(req,res){
  var purchaseKey = couch.schema.purchase(req.query.token)
  P.all([
    cb.getAsync(purchaseKey),
    hashListAll()
  ])
    .spread(function(result,hashes){
      result.value._id = purchaseKey
      result.value.name = req.query.name
      res.render('purchase/edit',{
        purchase: result.value,
        hashes: hashes
      })
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
  var form = req.body
  var purchaseKey = form.token
  var life = (+req.body.life) || (+config.purchase.life)
  var lifeMs = 1000 * life
  var timestamp = new Date()
  var doc
  P.try(function(){
    if(purchaseKey){
      return cb.getAsync(couch.schema.purchase(purchaseKey))
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
      var rv = formHelper.compare(result.value,form,[
      'hash',
      'ext',
      'referrer',
      'life',
      'afterLife'
      ],timestamp)
      if(rv.updated){
        rv.doc.expirationDate = new Date(
          +(new Date(rv.doc.createdAt)) + lifeMs
        ).toJSON()
        return cb.upsertAsync(couch.schema.purchase(purchaseKey),rv.doc,{cas: result.cas})
      } else {
        return P.try(function(){return rv.updated})
      }
    })
    .then(function(updated){
      var alert = {
        subject: 'Purchase',
        href: '/purchase/edit?token=' + purchaseKey,
        id: purchaseKey
      }
      if(false !== updated){
        alert.action = 'saved'
        req.flashPug('success','subject-id-action',alert)
      } else {
        alert.action = 'unchanged (try again?)'
        req.flashPug('warning','subject-id-action',alert)
      }
      res.redirect('/purchase/list')
    })
    .catch(function(err){
      res.render('error',{error: err})
    })
}
