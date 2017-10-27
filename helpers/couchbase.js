'use strict';
var P = require('bluebird')
var couchbase = require('couchbase')
var debug = require('debug')('oose:couchbase')

var N1Query = couchbase.N1qlQuery

var CouchSchema = require('./CouchSchema')
var logger = require('./logger')

var config = require('../config')


/**
 * Connect to Couchbase
 * @param {object} conf
 * @return {object}
 */
var connectCouchbase = function(conf){
  var dsn = (conf.protocol || 'couchbase://') + (conf.host || '127.0.0.1')
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
    process.exit(2)
  }))
}

var client = {
  cluster: cluster,
  type: {
    HEARTBEAT: 'heartbeat',
    INVENTORY: 'inventory',
    JOB: 'job',
    PEER: 'peer',
    PURCHASE: 'purchase'
  }
}


/**
 * Get a database name
 * @param {string} database
 * @param {boolean} escape
 * @return {string}
 */
client.getName = function(database,escape){
  if(!config || !config.couch || !config.couch.bucket)
    throw new Error('Could not get database name, config missing!')
  if(!database)
    throw new Error('Could not get database name, request blank')
  if(!config.couch.bucket[database])
    throw new Error('Could not get database name, section doesnt exist')
  if(!config.couch.bucket[database].name)
    throw new Error('Could not get database name, name missing')
  var name = config.couch.bucket[database].name
  if(true === escape) name = '`' + name + '`'
  return name
}


/**
 * Get a promisified manager
 * @param {object} bucket
 * @return {P}
 */
client.getManager = function(bucket){
  return P.promisifyAll(bucket.manager())
}


/**
 * Initialize couchbase in a harmless repeatable way
 * @param {object} couch
 * @return {P}
 */
client.init = function(couch){
  var opts = {ignoreIfExists: true}
  return P.all([
    couch.getManager(couch.heartbeat).createPrimaryIndexAsync(opts),
    couch.getManager(couch.inventory).createPrimaryIndexAsync(opts),
    couch.getManager(couch.job).createPrimaryIndexAsync(opts),
    couch.getManager(couch.peer).createPrimaryIndexAsync(opts),
    couch.getManager(couch.purchase).createPrimaryIndexAsync(opts)
  ])
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
 * Export N1Query object
 * @type {N1qlQuery}
 */
client.N1Query = N1Query


/**
 * Export client
 * @return {object} client
 */
module.exports = client
