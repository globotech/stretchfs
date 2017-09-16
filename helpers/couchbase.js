'use strict';
var P = require('bluebird')
var nano = require('nano')

var CouchSchema = require('./CouchSchema')

var config = require('../config')

//make some promises
P.promisifyAll(nano)

//setup our client
var connectCouchDb = function(conf){
  var dsn = conf.protocol
  if(conf.options && conf.options.auth && conf.options.auth.username){
    dsn = dsn + conf.options.auth.username
    var couchPassword= 'password'
    if(conf.options.auth.password && conf.options.auth.password !== '')
      couchPassword = conf.options.auth.password
    dsn = dsn + ':' + couchPassword
    dsn = dsn + '@'
  }
  dsn = dsn + conf.host
  dsn = dsn + ':' + conf.port
  var client = nano(dsn)
  P.promisifyAll(client)
  P.promisifyAll(client.db)
  return client
}
var client = connectCouchDb(config.couchdb)


/**
 * Setup the Peer DB
 * @type {object}
 */
client.peer = P.promisifyAll(
  client.db.use(config.couchdb.database + '-peer'))


/**
 * Setup the Inventory DB
 * @type {object}
 */
client.inventory = P.promisifyAll(
  client.db.use(config.couchdb.database + '-inventory'))


/**
 * Legacy OOSE DB
 * @type {object}
 */
client.oose = P.promisifyAll(
  client.db.use(config.couchdb.database))


/**
 * Setup the Heartbeat DB
 * @type {object}
 */
client.heartbeat = P.promisifyAll(
  client.db.use(config.couchdb.database + '-heartbeat'))


/**
 * Setup the Supervisor DB
 * @type {object}
 */
client.supervisor = P.promisifyAll(
  client.db.use(config.couchdb.database + '-supervisor'))


/**
 * Add schema to helper
 * @type {CouchSchema}
 */
client.schema = new CouchSchema(config.couchdb.prefix)


/**
 * Export client
 * @return {object} client
 */
module.exports = client
