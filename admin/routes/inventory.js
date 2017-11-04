'use strict';
var P = require('bluebird')

var inv = require('../helpers/inventory')
var couch = require('../../helpers/couchbase')

//open couch buckets
var ooseInventory = couch.inventory()


/**
 * List Inventory
 * @param {object} req
 * @param {object} res
 */
exports.list = function(req,res){
  var limit = parseInt(req.query.limit,10) || 10
  var start = parseInt(req.query.start,10) || 0
  var search = req.query.search || ''
  inv.listMain(
    couch,ooseInventory,couch.type.INVENTORY,search,'_id',true,start,limit)
    .then(function(result){
      res.render('inventory/list',{
        page: inv.pagination(start,result.count,limit),
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
    .each(function(inventoryKey){
      return ooseInventory.removeAsync(inventoryKey)
    })
    .then(function(){
      req.flash('success','Inventory item(s) removed successfully')
      res.redirect('/inventory/list')
    })
}


/**
 * Create inventory record
 * @param {object} req
 * @param {object} res
 */
exports.create = function(req,res){
  res.render('inventory/create')
}


/**
 * Edit Inventory by hash
 * @param {object} req
 * @param {object} res
 */
exports.edit = function(req,res){
  var inventoryKey = req.query.id
  var hash = inventoryKey.split(':')[0] || inventoryKey
  inv.hashQuery(couch,ooseInventory,couch.type.INVENTORY,hash)
    .then(function(result){
      res.render('inventory/edit',{inventory: result})
    })
    .catch(function(err){
      res.render('error',{error: err.message})
    })
}


/**
 * Edit Inventory by _id (individual record)
 * @param {object} req
 * @param {object} res
 */
exports.editIndividual = function(req,res){
  var inventoryKey = req.query.id
  ooseInventory.getAsync(inventoryKey)
    .then(function(result){
      result.value._id = inventoryKey
      res.render('inventory/editIndividual',{inventory: result.value})
    })
    .catch(function(err){
      res.render('error',{error: err.message})
    })
}


/**
 * Save inventory
 * @param {object} req
 * @param {object} res
 */
exports.save = function(req,res){
  var inventoryKey = req.body.id || ''
  var doc = {}
  P.try(function(){
    if(inventoryKey){
      return ooseInventory.getAsync(inventoryKey)
    } else {
      inventoryKey = couch.schema.inventory(req.body.hash)
      return {value: {createdAt: new Date().toJSON()}, cas: null}
    }
  })
    .then(function(result){
      doc = result.value
      if(req.body.hash) doc.hash = req.body.hash
      if(req.body.prism) doc.prism = req.body.prism
      if(req.body.store) doc.store = req.body.store
      if(req.body.mimeType) doc.mimeType = req.body.mimeType
      if(req.body.mimeExtension) doc.mimeExtension = req.body.mimeExtension
      if(req.body.size) doc.size = parseInt(req.body.size)
      if(req.body.relativePath) doc.relativePath = req.body.relativePath
      doc.updatedAt = new Date().toJSON()
      return ooseInventory.upsertAsync(inventoryKey,doc,{cas: result.cas})
    })
    .then(function(){
      req.flash('success','Inventory saved')
      res.redirect('/inventory/edit?id=' + inventoryKey)
    })
    .catch(function(err){
      res.render('error',{error: err})
    })
}
