'use strict';
var bcrypt = require('bcrypt')
var P = require('bluebird')

var list = require('../helpers/list')
var couch = require('../../helpers/couchbase')

//make some promises
P.promisifyAll(bcrypt)

//open buckets
var cb = couch.stretchfs()


/**
 * List staff members
 * @param {object} req
 * @param {object} res
 */
exports.list = function(req,res){
  var limit = +req.query.limit || 10
  var start = +req.query.start || 0
  var search = req.query.search || ''
  list.listQuery(couch,cb,couch.type.stretchfs,
    couch.schema.staff(search),'name',true,start,limit)
    .then(function(result){
      res.render('staff/list',{
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
    .each(function(staffKey){
      return cb.removeAsync(staffKey)
    })
    .then(function(){
      req.flash('success','Staff removed successfully')
      res.redirect('/staff/list')
    })
}


/**
 * Create staff member
 * @param {object} req
 * @param {object} res
 */
exports.create = function(req,res){
  res.render('staff/create')
}


/**
 * Staff edit form
 * @param {object} req
 * @param {object} res
 */
exports.edit = function(req,res){
  var staffKey = req.query.id
  cb.getAsync(staffKey)
    .then(function(result){
      result.value._id = staffKey
      res.render('staff/edit',{staff: result.value})
    })
    .catch(function(err){
      res.render('error',{error: err.message})
    })
}


/**
 * Save staff member
 * @param {object} req
 * @param {object} res
 */
exports.save = function(req,res){
  var form = req.body
  var staffKey = form.id || ''
  var staffEmail = form.name || staffKey.split(':')[1]
  var timestamp = new Date().toJSON()
  P.try(function(){
    if(staffKey){
      return cb.getAsync(staffKey)
    } else {
      staffKey = couch.schema.staff(req.body.staffEmail)
      return {value: {createdAt: timestamp}, cas: null}
    }
  })
    .then(function(result){
      var doc = result.value
      var updated = false
      form.staffActive = ('on' === form.staffActive)
      if(doc.email !== form.staffEmail){
        doc.email = form.staffEmail
        updated = true
      }
      if(doc.name !== form.staffName){
        doc.name = form.staffName
        updated = true
      }
      if('' !== form.staffPassword+form.staffPasswordConfirm){
        if(form.staffPassword === form.staffPasswordConfirm){
          doc.passwordLastChanged = timestamp
          doc.password = bcrypt.hashSync(
            req.body.staffPassword,bcrypt.genSaltSync(12))
          updated = true
        }
      }
      if(doc.active !== form.staffActive){
        doc.active = ('on' === form.staffActive)
        updated = true
      }
      if(!updated){
        return P.try(function(){return false})
      } else {
        doc.updatedAt = timestamp
        return cb.upsertAsync(staffKey,doc,{cas: result.cas})
      }
    })
    .then(function(updated){
      var alert = {
        subject: 'Staff member',
        href: '/staff/edit?id=' + staffKey,
        id: staffEmail
      }
      if(false !== updated){
        alert.action = 'saved'
        req.flashPug('success','subject-id-action',alert)
      } else {
        alert.action = 'unchanged (try again?)'
        req.flashPug('warning','subject-id-action',alert)
      }
      res.redirect('/staff/list')
    })
    .catch(function(err){
      res.render('error',{error: err})
    })
}


/**
 * Staff login
 * @param {object} req
 * @param {object} res
 */
exports.login = function(req,res){
  res.render('login')
}


/**
 * Login action
 * @param {object} req
 * @param {object} res
 */
exports.loginAction = function(req,res){
  var staffKey = couch.schema.staff(req.body.email)
  var staff = {}
  cb.getAsync(staffKey)
    .then(function(result){
      staff = result
      if(!staff) throw new Error('Invalid login')
      return bcrypt.compareAsync(req.body.password,staff.value.password)
    })
    .then(function(match){
      if(!match){
        staff.value.lastFailedLogin = new Date().toJSON()
        staff.value.failedLoginCount = (+staff.value.failedLoginCount || 0) + 1
        return cb.upsertAsync(staffKey,staff.value,{cas: staff.cas})
          .then(function(){
            throw new Error('Invalid login')
          })
      }
      staff.value.loginCount = (+staff.value.loginCount || 0) + 1
      staff.value._id = staffKey
      //otherwise we are valid start the session
      req.session.staff = staff.value
      staff.value.lastLogin = new Date().toJSON()
      return cb.upsertAsync(staffKey,staff.value,{cas: staff.cas})
    })
    .then(function(){
      res.redirect('/')
    })
    .catch(function(err){
      console.log('login error',err.stack)
      req.flash('error',err.message)
      res.redirect('/login')
    })
}


/**
 * Staff logout
 * @param {object} req
 * @param {object} res
 */
exports.logout = function(req,res){
  delete req.session.staff
  res.redirect('/login')
}
