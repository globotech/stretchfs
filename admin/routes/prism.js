'use strict';
var P = require('bluebird')
var oose = require('oose-sdk')

var list = require('../../helpers/list')
var couch = require('../../helpers/couchbase')
var UserError = oose.UserError

var config = require('../../config')

//open couch buckets
var couchPeer = couch.peer()


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
  Prism.findAndCountAll({
    where: sequelize.or(
      {name: {like: '%' + search + '%'}}
    ),
    offset: start,
    limit: limit,
    order: ['name']
  })
    .then(function(result){
      res.render('prism/list',{
        page: list.pagination(start,result.count,limit),
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
  list.remove(Prism,req.body.remove)
    .then(function(){
      req.flash('success','Prism(s) removed successfully')
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
  var prism
  Prism.find({where: {id: req.query.id}, include: [Store]})
    .then(function(result){
      if(!result) throw new UserError('Prism not found')
      prism = result
      return prism.getStores({order: [['name','ASC']]})
    })
    .then(function(result){
      res.render('prism/edit',{
        stores: result,
        prism: prism
      })
    })
    .catch(UserError,function(err){
      res.render('error',{error: err.message})
    })
}


/**
 * Save prism
 * @param {object} req
 * @param {object} res
 */
exports.save = function(req,res){
  var data = req.body
  var master
  Master.find({where: {domain: config.domain}})
    .then(function(result){
      if(!result) throw new UserError('Master not found')
      master = result
      return Prism.find(data.id)
    })
    .then(function(prism){
      if(!prism) prism = Prism.build({MasterId: master.id})
      if(data.name) prism.name = data.name
      if(data.group) prism.group = data.group
      if(data.host) prism.host = data.host
      if(data.port) prism.port = data.port
      prism.full = !!data.full
      prism.active = !!data.active
      return P.all([
        prism.save()
      ])
    })
    .then(function(results){
      req.flash('success','Prism Saved')
      res.redirect('/prism/edit?id=' + results[0].id)
    })
    .catch(sequelize.ValidationError,function(err){
      res.render('error',{error: sequelize.validationErrorToString(err)})
    })
}
