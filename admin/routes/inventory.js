'use strict';
var P = require('bluebird')

var list = require('../helpers/list')
var couch = require('../../helpers/couchbase')

//open couch buckets
var couchInventory = couch.peer()


/**
 * List Prisms
 * @param {object} req
 * @param {object} res
 */
exports.list = function(req,res){
  var limit = parseInt(req.query.limit,10) || 10
  var start = parseInt(req.query.start,10) || 0
  var search = req.query.search || ''
  if(start < 0) start = 0
  var qstring = 'SELECT b.* FROM ' +
    couch.getName(couch.type.INVENTORY,true) + ' b ' +
    ' WHERE META(b).id LIKE $1 ' +
    (limit ? ' LIMIT ' + limit + ' OFFSET ' + start : '')
  var query = couch.N1Query.fromString(qstring)
  var prismKey = couch.schema.prism(search) + '%'
  couchInventory.queryAsync(query,[prismKey])
    .then(function(result){
      res.render('inventory/list',{
        page: list.pagination(start,result.length,limit),
        count: result.length,
        search: search,
        limit: limit,
        list: result
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
      return couchInventory.removeAsync(inventoryKey)
    })
    .then(function(){
      req.flash('success','Inventory item(s) removed successfully')
      res.redirect('/inventory/list')
    })
}


/**
 * Edit Inventory
 * @param {object} req
 * @param {object} res
 */
exports.edit = function(req,res){
  var inventoryKey = couch.schema.inventory(req.query.key)
  couchInventory.getAsync(inventoryKey)
    .then(function(result){
      res.render('inventory/edit',{inventory: result.value})
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
  //var data = req.body
  var inventoryKey = couch.schema.prism(req.body.name)
  var doc
  couchInventory.getAsync(inventoryKey)
    .then(function(result){
      doc = result.value
      if(!doc) doc = {}
      return couchInventory.upsertAsync(inventoryKey,doc,{cas: result.cas})
    })
    .then(function(){
      req.flash('success','Inventory saved')
      res.redirect('/inventory/edit?key=' + doc.key)
    })
    .catch(function(err){
      res.render('error',{error: err})
    })
}
