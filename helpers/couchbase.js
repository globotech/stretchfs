'use strict';
var P = require('bluebird')
var couchbase = require('couchbase')

var CouchSchema = require('./CouchSchema')
var logger = require('./logger')

var config = require('../config')

//setup error handler
var handleCouchbaseConnectError = function(err){
  logger.log('error','Failed to connect to Couchbase bucket ' + err.message)
  console.log(err)
  console.log(err.stack)
  process.exit()
}

//setup our client
var connectCouchbase = function(conf){
  return P.promisifyAll(new couchbase.Cluster(
    (conf.protocol || 'couchbase://') + (conf.host || '127.0.0.1')))
}
var cluster = connectCouchbase(config.couch)

var client = {
  cluster: cluster
}


/**
 * Setup the Heartbeat DB
 * @type {object}
 */
client.heartbeat = P.promisifyAll(client.openBucket(
  config.couch.bucket.heartbeat.name,
  config.couch.bucket.heartbeat.secret,
  handleCouchbaseConnectError
))


/**
 * Setup the Inventory DB
 * @type {object}
 */
client.inventory = P.promisifyAll(client.openBucket(
  config.couch.bucket.inventory.name,
  config.couch.bucket.inventory.secret,
  handleCouchbaseConnectError
))


/**
 * Setup the Job DB
 * @type {object}
 */
client.job = P.promisifyAll(client.openBucket(
  config.couch.bucket.job.name,
  config.couch.bucket.job.secret,
  handleCouchbaseConnectError
))


/**
 * Setup the Peer DB
 * @type {object}
 */
client.peer = P.promisifyAll(client.openBucket(
  config.couch.bucket.peer.name,
  config.couch.bucket.peer.secret,
  handleCouchbaseConnectError
))


/**
 * Setup the Purchase DB
 * @type {object}
 */
client.purchase = P.promisifyAll(client.openBucket(
  config.couch.bucket.purchase.name,
  config.couch.bucket.purchase.secret,
  handleCouchbaseConnectError
))


/**
 * Add schema to helper
 * @type {CouchSchema}
 */
client.schema = new CouchSchema(config.couch.prefix)


/**
 * Export client
 * @return {object} client
 */
module.exports = client
