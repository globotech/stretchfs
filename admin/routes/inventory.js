'use strict';
var P = require('bluebird')

var inv = require('../helpers/inventory')
var listHelper = require('../helpers/list')
var formHelper = require('../helpers/form')
var couch = require('../../helpers/couchbase')

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
  listHelper.listQuery(couch,cb,couch.type.stretchfs,
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
    listHelper.listQuery(couch,cb,couch.type.stretchfs,
      couch.schema.store(),'name',true)
  ])
    .spread(function(result,ruleSet,stores){
      result.ruleSet = ruleSet
      result.stores = {}
      var pC = {}
      stores.rows.forEach(function(l,i){
        l.group.forEach(function(g){
          if(0 === g.indexOf(couch.schema.prism())){
            l.prism = g.split(':')[1]
          }
        })
        var pCidx = Object.keys(pC).indexOf(l.prism)
        if(-1 === pCidx){
          pC[l.prism] = true
          pCidx = Object.keys(pC).indexOf(l.prism)
        }
        l.id = 'desiredMap[' + i + ']'
        l.class = 'prism' + ('0000' + pCidx).slice(-4)
        l.checked = (-1 !== result.summary.desiredMap.indexOf(l.name))
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
  var form = req.body
  var inventoryKey = form.id || couch.schema.inventory(form.hash)
  var timestamp = new Date()
  cb.getAsync(inventoryKey)
    .then(function(result){
      var rv = formHelper.compare(result.value,form,[
        'hash',
        'mimeExtension',
        'mimeType',
        'relativePath',
        'size',
        'desiredMap'
      ],timestamp)
      if(rv.updated){
        return cb.upsertAsync(inventoryKey,rv.doc,{cas: result.cas})
      } else {
        return P.try(function(){return rv.updated})
      }
    })
    .then(function(updated){
      var alert = {
        subject: 'Inventory',
        href: '/inventory/edit?hash=' + form.hash,
        id: form.hash
      }
      if(false !== updated){
        alert.action = 'saved'
        req.flashPug('success','subject-id-action',alert)
      } else {
        alert.action = 'unchanged (try again?)'
        req.flashPug('warning','subject-id-action',alert)
      }
      res.redirect('/inventory/list')
    })
}
