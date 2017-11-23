'use strict';
var P = require('bluebird')

var list = require('../helpers/list')
var couch = require('../../helpers/couchbase')

//open couch buckets
var cb = couch.stretchfs()


/**
 * List users
 * @param {object} req
 * @param {object} res
 */
exports.list = function(req,res){
  var limit = +req.query.limit || 10
  var start = +req.query.start || 0
  var search = req.query.search || ''
  list.listQuery(couch,cb,couch.type.stretchfs,
    couch.schema.userToken(search),'token',true,start,limit)
    .then(function(result){
      res.render('session/list',{
        page: list.pagination(start,result.count,limit),
        count: result.count,
        search: search,
        limit: limit,
        list: result.rows
      })
    })
}


/**
 * List action
 * @param {object} req
 * @param {object} res
 */
exports.listAction = function(req,res){
  P.try(function(){
    return req.body.remove || []
  })
    .each(function(sessionKey){
      return cb.removeAsync(sessionKey)
    })
    .then(function(){
      req.flash('success','Session(s) removed successfully')
      res.redirect('/session/list')
    })
}
