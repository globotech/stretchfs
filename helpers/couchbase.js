'use strict';
var P = require('bluebird')
var couchbase = require('couchbase')
var debug = require('debug')('oose:couchbase')

var CouchSchema = require('./CouchSchema')
var logger = require('./logger')

var config = require('../config')


/**
 * Connect to Couchbase
 * @param {object} conf
 * @return {object}
 */
var connectCouchbase = function(conf){
  var dsn = (conf.protocol || 'couchbase://') +
    (conf.host || '127.0.0.1') + ':' +
    (conf.port || '8091')
  debug('connecting to couchbase',dsn)
  return P.promisifyAll(new couchbase.Cluster(dsn))
}
var cluster = connectCouchbase(config.couch)


/**
 * Open Couchbase bucket
 * @param {string} name
 * @param {string} secret
 * @return {object}
 */
var openBucket = function(name,secret){
  debug('opening bucket',name,secret)
  return P.promisifyAll(cluster.openBucket(name,secret,function(err){
    if('undefined' === typeof err){
      debug('connected to',name)
      return
    }
    debug('couchbase connect error',err)
    logger.log(
      'error',
      'Failed to connect to Couchbase bucket ' +
      name + ' with secret ' + secret + ' ' + err
    )
    console.trace()
    process.exit()
  }))
}

var client = {
  cluster: cluster
}


/**
 * Setup the Heartbeat DB
 * @type {object}
 */
client.heartbeat = openBucket(
  config.couch.bucket.heartbeat.name,
  config.couch.bucket.heartbeat.secret
)


/**
 * Setup the Inventory DB
 * @type {object}
 */
client.inventory = openBucket(
  config.couch.bucket.inventory.name,
  config.couch.bucket.inventory.secret
)


/**
 * Setup the Job DB
 * @type {object}
 */
client.job = openBucket(
  config.couch.bucket.job.name,
  config.couch.bucket.job.secret
)


/**
 * Setup the Peer DB
 * @type {object}
 */
client.peer = openBucket(
  config.couch.bucket.peer.name,
  config.couch.bucket.peer.secret
)


/**
 * Setup the Purchase DB
 * @type {object}
 */
client.purchase = openBucket(
  config.couch.bucket.purchase.name,
  config.couch.bucket.purchase.secret
)


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
