'use strict';
var P = require('bluebird')

var inv = require('../helpers/inventory')
var list = require('../helpers/list')
var formHelper = require('../helpers/form')
var couch = require('../../helpers/couchbase')
var isArray = Array.isArray

//open couch buckets
var cb = couch.stretchfs()

inv.setup({
  couchbase: couch,
  bucket: cb,
  bucketType: couch.type.stretchfs
})


/**
 * List Inventory
 * @param {object} req
 * @param {object} res
 */
exports.list = function(req,res){
  var limit = parseInt(req.query.limit,10) || 10
  var start = parseInt(req.query.start,10) || 0
  var search = req.query.search || ''
  inv.listMain(couch.schema.inventory(''),search,'hash',true,start,limit)
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
      return cb.removeAsync(inventoryKey)
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
  list.listQuery(couch,cb,couch.type.stretchfs,
    couch.schema.store(),'name',true)
    .then(function(result){
      res.render('inventory/create',{stores:result.rows})
    })
    .catch(function(err){
      console.error(err)
      res.render('error',{error: err.message})
    })
}


/**
 * AJAX feeder for RuleName->DataTypes
 * @param {object} req
 * @param {object} res
 */
exports.listRuleTypes = function(req,res){
  var rv = JSON.stringify(P.try(function(){return inv.ruleSet()}))
  res.send(rv)
}


/**
 * AJAX feeder for all hashes
 * @param {object} req
 * @param {object} res
 */
exports.listHashes = function(req,res){
  inv.hashListAll().then(function(hashlist){
    res.send(JSON.stringify(hashlist))
  })
}


/**
 * Edit Inventory by hash
 * @param {object} req
 * @param {object} res
 */
exports.edit = function(req,res){
  P.all([
    inv.hashQuery(req.query.hash),
    inv.ruleSet(),
    list.listQuery(couch,cb,couch.type.stretchfs,
      couch.schema.store(),'name',true)
  ])
    .spread(function(result,ruleSet,stores){
      result.ruleSet = ruleSet
      result.stores = {}
      var pC = {}
      stores.rows.forEach(function(l,i){
        var pCidx = Object.keys(pC).indexOf(l.prism)
        if(-1 === pCidx){
          pC[l.prism]=true
          pCidx=Object.keys(pC).indexOf(l.prism)
        }
        l.id = 'desiredMap[' + i + ']'
        l.class = 'prism' + ('0000' + pCidx).slice(-4)
        l.checked = (-1 !== result.summary.map.indexOf(l.name))
        result.stores[l.name] = l
      })
      res.render('inventory/edit',result)
    })
    .catch(function(err){
      console.error(err)
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
  cb.getAsync(inventoryKey)
    .then(function(result){
      result.value.id = inventoryKey
      result.value.hash = inventoryKey.split(':')[0]
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
  return P.all([formHelper.diff(
    req,res,
    cb,'inventory',{'hash': req.body.hash},
    [
      'hash',
      'mimeExtension',
      'mimeType',
      'relativePath',
      'size',
      'rules',
      'desiredMap'
    ]
  )])
}
