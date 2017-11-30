'use strict';


/**
 * Dashboard
 * @type {exports}
 */
exports.dashboard = require('./dashboard')


/**
 * Prisms
 * @type {exports}
 */
exports.prism = require('./prism')


/**
 * Stores
 * @type {exports}
 */
exports.store = require('./store')


/**
 * Peer
 * @type {exports}
 */
exports.peer = require('./peer')


/**
 * File
 * @type {exports}
 */
exports.file = require('./file')


/**
 * Inventory
 * @type {exports}
 */
exports.inventory = require('./inventory')


/**
 * Purchase
 * @type {exports}
 */
exports.purchase = require('./purchase')


/**
 * Jobs
 * @type {exports}
 */
exports.job = require('./job')


/**
 * Staff
 * @type {exports}
 */
exports.staff = require('./staff')


/**
 * Session
 * @type {exports}
 */
exports.session = require('./session')


/**
 * Users
 * @type {exports}
 */
exports.user = require('./user')


/**
 * Index
 * @param {object} req
 * @param {object} res
 */
exports.index = function(req,res){
  res.redirect('/prism/list')
}
