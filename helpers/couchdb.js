'use strict';
var P = require('bluebird')
var nano = require('nano')

var CouchSchema = require('./CouchSchema')

var config = require('../config')

//make some promises
P.promisifyAll(nano)

//setup our client
var dsn = config.couchdb.protocol
if(config.couchdb.options.auth.username){
  dsn = dsn + config.couchdb.options.auth.username
  var couchPassword= 'password'
  if(config.couchdb.options.auth.password !== '')
    couchPassword = config.couchdb.options.auth.password
  dsn = dsn + ':' + couchPassword
  dsn = dsn + '@'
}
dsn = dsn + config.couchdb.host
dsn = dsn + ':' + config.couchdb.port
var client = nano(dsn)

//make some promises
P.promisifyAll(client)


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
