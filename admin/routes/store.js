'use strict';
var list = require('../../helpers/list')
var oose = require('oose-sdk')
var couch = require('../../helpers/couchbase')

var UserError = oose.UserError


/**
 * Create Store
 * @param {object} req
 * @param {object} res
 * @return {*}
 */
exports.create = function(req,res){
  Prism.findById(req.query.prism)
    .then(function(prism){
      if(!prism) throw new UserError('Prism not found')
      res.render('store/create',{prism: prism})
    })
    .catch(UserError,function(err){
      res.render('error',{error: err.message})
    })
}


/**
 * Edit Store
 * @param {object} req
 * @param {object} res
 * @return {*}
 */
exports.edit = function(req,res){
  Store.find({
    where: {id: req.query.id},
    include: [Prism]
  })
    .then(function(store){
      if(!store) throw new UserError('Could not find store')
      res.render('store/edit',{store: store})
    })
    .catch(UserError,function(err){
      res.render('error',{error: err.message})
    })
}


/**
 * Remove store
 * @param {object} req
 * @param {object} res
 * @return {*}
 */
exports.remove = function(req,res){
  list.remove(Store,req.body.id)
    .then(function(){
      req.flash('success','Store(s) removed successfully')
      res.redirect('/prism/edit?id=' + req.body.prism)
    })
}


/**
 * Save Store
 * @param {object} req
 * @param {object} res
 * @return {*}
 */
exports.save = function(req,res){
  var data = req.body
  var prism, store
  Prism.findById(data.prism)
    .then(function(result){
      if(!result) throw new UserError('Prism not found')
      prism = result
      return Store.findOrCreate({
        where: {
          id: data.id
        },
        defaults: {
          name: data.name,
          host: data.host,
          port: data.port,
          full: !!data.full,
          active: !!data.active
        }
      })
    })
    .spread(function(result,created){
      if(!result) throw new UserError('No store created or found')
      store = result
      if(created) return store.setPrism(prism)
    })
    .then(function(){
      if(data.name) store.name = data.name
      if(data.port) store.port = data.port
      if(data.host) store.host = data.host
      store.full = !!data.full
      store.active = !!data.active
      return store.save()
    })
    .then(function(){
      req.flash('success','Store saved')
      res.redirect('/store/edit?id=' + store.id)
    })
    .catch(sequelize.ValidationError,function(err){
      res.render('error',{error: sequelize.validationErrorToString(err)})
    })
    .catch(UserError,function(err){
      res.render('error',{error: err.message})
    })
}
