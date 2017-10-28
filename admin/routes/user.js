'use strict';
var oose = require('oose-sdk')

var couch = require('../../helpers/couchbase')
var list = require('../../helpers/list')
var UserError = oose.UserError


/**
 * List users
 * @param {object} req
 * @param {object} res
 */
exports.list = function(req,res){
  var limit = +req.query.limit || 10
  var start = +req.query.start || 0
  var search = req.query.search || ''
  if(start < 0) start = 0
  User.findAndCountAll({
    where: sequelize.or(
      {username: {like: '%' + search + '%'}}
    ),
    limit: limit,
    offset: start
  })
    .then(function(result){
      res.render('user/list',{
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
  list.remove(User,req.body.remove)
    .then(function(){
      req.flash('success','User removed successfully')
      res.redirect('/user/list')
    })
}


/**
 * User find
 * @param {object} req
 * @param {object} res
 */
exports.find = function(req,res){
  var data = req.body
  User.find({where: {username: data.username}})
    .then(function(result){
      if(!result) throw new UserError('No user found')
      var values = result.dataValues
      delete values.password
      res.json(values)
    })
    .catch(UserError,function(err){
      res.json({error: err.message})
    })
}


/**
 * Create User
 * @param {object} req
 * @param {object} res
 */
exports.create = function(req,res){
  res.render('user/create')
}


/**
 * Create User
 * @param {object} req
 * @param {object} res
 */
exports.save = function(req,res){
  var data = req.body
  var password = User.generatePassword()
  User.create({
    username: data.username,
    password: password
  })
    .then(function(){
      req.flash('success','User created successfully')
      req.flash('notice','User password is: ' + password + '' +
      '  write this down as it will never be shown again!')
      res.redirect('/user/list')
    })
    .catch(sequelize.ValidationError,function(err){
      res.render('error',{error: sequelize.validationErrorToString(err)})
    })
    .catch(sequelize.UniqueConstraintError,function(){
      res.render('error',{error: 'Username already exists'})
    })
}


/**
 * User edit form
 * @param {object} req
 * @param {object} res
 */
exports.edit = function(req,res){
  var data = req.query
  var user
  User.find(data.id)
    .then(function(result){
      if(!result) throw new UserError('User not found')
      user = result
      return UserSession.findAndCountAll({where: { UserId: user.id } })
    })
    .then(function(result){
      res.render('user/edit',{
        user: user,
        sessions: result.rows
      })
    })
    .catch(UserError,function(err){
      res.json({error: err.message})
    })
}


/**
 * Update a user
 * @param {object} req
 * @param {object} res
 */
exports.update = function(req,res){
  var data = req.body
  User.find({
    where: {username: data.username}
  })
    .then(function(result){
      if(!result) throw new UserError('No user found for update')
      result.active = !!data.active
      return result.save()
    })
    .then(function(){
      req.flash('Success:', 'User updated')
      res.redirect('/user/list')
    })
    .catch(sequelize.ValidationError,function(err){
      res.render('error',{error: sequelize.validationErrorToString(err)})
    })
    .catch(UserError,function(err){
      res.json({error: err.message})
    })
}


/**
 * Reset a users password
 * @param {object} req
 * @param {object} res
 */
exports.passwordReset = function(req,res){
  var data = req.body
  var password = User.generatePassword()
  User.find({
    where: {username: data.username}
  })
    .then(function(result){
      if(!result) throw new UserError('No user found for password reset')
      result.password = password
      return result.save()
    })
    .then(function(){
      req.flash('success','User password successfully reset')
      req.flash('notice','User password is: ' + password + '' +
      '  write this down as it will never be shown again!')
      res.redirect('/user/list')
    })
    .catch(sequelize.ValidationError,function(err){
      res.render('error',{error: sequelize.validationErrorToString(err)})
    })
    .catch(UserError,function(err){
      res.json({error: err.message})
    })
}


/**
 * Log a user in
 * @param {object} req
 * @param {object} res
 */
exports.login = function(req,res){
  var data = req.body
  User.login(data.username,data.password,data.ip)
    .then(function(user){
      //create a session
      return UserSession.create({
        token: UserSession.generateToken(),
        ip: data.ip,
        UserId: user.id
      })
    })
    .then(function(session){
      res.json({success: 'User logged in', session: session.dataValues})
    })
    .catch(sequelize.ValidationError,function(err){
      res.render('error',{error: sequelize.validationErrorToString(err)})
    })
    .catch(UserError,function(err){
      res.json({error: err.message})
    })
}


/**
 * Log a user out
 * @param {object} req
 * @param {object} res
 */
exports.logout = function(req,res){
  var data = req.body
  UserSession.find({where: {token: data.token, ip: data.ip}})
    .then(function(session){
      if(!session) throw new UserError('Session not found')
      return session.destroy()
    })
    .then(function(){
      res.json({success: 'User logged out'})
    })
    .catch(sequelize.ValidationError,function(err){
      res.render('error',{error: sequelize.validationErrorToString(err)})
    })
    .catch(UserError,function(err){
      res.json({error: err.message})
    })
}


/**
 * Find a session
 * @param {object} req
 * @param {object} res
 */
exports.sessionFind = function(req,res){
  var data = req.body
  UserSession.find({where: {token: data.token, ip: data.ip}, include: [User]})
    .then(function(session){
      if(!session) throw new UserError('Session could not be found')
      res.json({success: 'Session valid', session: session.dataValues})
    })
    .catch(UserError,function(err){
      res.json({error: err.message})
    })
}


/**
 * Update session data
 * @param {object} req
 * @param {object} res
 */
exports.sessionUpdate = function(req,res){
  var data = req.body
  UserSession.find({where: {token: data.token, ip: data.ip}})
    .then(function(session){
      if(!session) throw new UserError('Session could not be found')
      if(data.data) session.data = JSON.stringify(data.data)
      return session.save()
    })
    .then(function(session){
      res.json({success: 'Session updated', session: session})
    })
    .catch(UserError,function(err){
      res.json({error: err.message})
    })
}


/**
 * Session Remove
 * @param {object} req
 * @param {object} res
 */
exports.sessionRemove = function(req,res){
  list.remove(UserSession,req.body.remove)
    .then(function(){
      req.flash('success','Session(s) removed successfully')
      res.redirect('user/edit')
    })
}


/**
 * Remove a user
 * @param {object} req
 * @param {object} res
 */
exports.remove = function(req,res){
  var data = req.body
  User.destroy({where: {username: data.username}})
    .then(function(count){
      res.json({success: 'User removed', count: count})
    })
}
