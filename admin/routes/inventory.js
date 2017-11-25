'use strict';
var P = require('bluebird')

var inv = require('../helpers/inventory')
var list = require('../helpers/list')
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
 * Edit Inventory by hash
 * @param {object} req
 * @param {object} res
 */
exports.edit = function(req,res){
  var inventoryKey = req.query.id
  var hash = inventoryKey.split(':')[0] || inventoryKey
  P.all([
    inv.hashQuery(hash),
    inv.ruleSet()
  ])
    .spread(function(result,ruleSet){
      result.ruleSet = ruleSet
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
  var inventoryKey = form.hash || ''
  var timestamp = new Date().toJSON()
  P.try(function(){
    console.log('inv/save '+inventoryKey+' form:',form)
    if(inventoryKey){
      return cb.getAsync(inventoryKey)
    } else {
      inventoryKey = couch.schema.inventory(form.hash)
      return {value: {createdAt: timestamp}, cas: null}
    }
  })
    .then(function(result){
      var doc = result.value
      var updated = false
      console.log('inv/save '+inventoryKey+'  in:',doc);
      var docTypes = {}
      var formTypes = {}
      var inventoryFields = [
        'hash','prism','store',
        'mimeType','mimeExtension','size','relativePath',
        'copies','map','rules'
      ]
      inventoryFields.forEach(function(k){
        var _isSame = function(a,b){
          return (a === b) &&
            (a !== 0 || 1 / a === 1 / b) || // false for +0 vs -0
            (a !== a && b !== b) // true for NaN vs NaN
        }
        var docFieldType = (typeof doc[k])
        if('string' === typeof form[k]){
          switch(docFieldType){
          case 'object':
            form[k] = JSON.parse(form[k])
            if((isArray(form[k])) && (isArray(doc[k]))){
              if(!(
                (doc[k].length === form[k].length) &&
                (doc[k].every(function(u,i){
                  return _isSame(u,form[k][i])
                }))
              )){
                doc[k] = form[k]
                updated = true
              } else {
                console.log('array matched',k)
              }
            }
            break;
          case 'number':
            form[k] = parseInt(form[k],10)
            break;
          }
        }
        docTypes[k]=(typeof doc[k])
        formTypes[k]=(typeof form[k])
        if((form[k]) && (doc[k] !== form[k])){
          doc[k] = form[k]
          updated = true
        }
      })
      console.error('doc',docTypes)
      console.error('form',formTypes)
      console.log('inv/save '+inventoryKey+' out:',updated,doc)
      updated=false//TODO remove this when it no longer trashes records
      if(!updated){
        return P.try(function(){return false})
      } else {
        doc.updatedAt = timestamp
        return cb.upsertAsync(inventoryKey,doc,{cas: result.cas})
      }
    })
    .then(function(updated){
      var alert = {
        subject: 'Inventory',
        href: '/inventory/edit?id=' + inventoryKey,
        id: inventoryKey
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
    .catch(function(err){
      res.render('error',{error: err})
    })
}
