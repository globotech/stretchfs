'use strict';
var P = require('bluebird')
var couchbase = require('couchbase')
var debug = require('debug')('oose:couchbase')

var N1Query = couchbase.N1qlQuery

var CouchSchema = require('./CouchSchema')
var logger = require('./logger')

var config = require('../config')

var buckets = {}


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
 * Open Couchbase bucket
 * @param {string} name
 * @param {string} secret
 * @return {object}
 */
client.openBucket = function(name,secret){
  debug('opening bucket',name,secret)
  if(buckets[name]) return buckets[name]
  buckets[name] = P.promisifyAll(cluster.openBucket(name,secret,function(err){
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
  }))
  return buckets[name]
}


/**
 * Close open bucket and make the next call reopen it
 * @param {string} name
 * @return {boolean}
 */
client.closeBucket = function(name){
  if(!buckets[name]) return false
  buckets[name].disconnect()
  delete buckets[name]
  return true
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
 * Disconnect any open buckets
 * @return {boolean}
 */
client.disconnect = function(){
  for(var bucket in buckets){
    if(bucket && bucket.disconnect && 'function' === typeof bucket.disconnect){
      bucket.disconnect()
    }
  }
  return true
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
 * @return {Object}
 */
client.heartbeat = function(){
  return client.openBucket(
    config.couch.bucket.heartbeat.name,
    config.couch.bucket.heartbeat.secret
  )
}


/**
 * Setup the Inventory DB
 * @return {Object}
 */
client.inventory = function(){
  return client.openBucket(
    config.couch.bucket.inventory.name,
    config.couch.bucket.inventory.secret
  )
}


/**
 * Setup the Job DB
 * @return {Object}
 */
client.job = function(){
  return client.openBucket(
    config.couch.bucket.job.name,
    config.couch.bucket.job.secret
  )
}


/**
 * Setup the OOSE DB
 * @return {Object}
 */
client.oose = function(){
  return client.openBucket(
    config.couch.bucket.oose.name,
    config.couch.bucket.oose.secret
  )
}


/**
 * Setup the Peer DB
 * @return {Object}
 */
client.peer = function(){
  return client.openBucket(
    config.couch.bucket.peer.name,
    config.couch.bucket.peer.secret
  )
}


/**
 * Setup the Purchase DB
 * @return {Object}
 */
client.purchase = function(){
  return client.openBucket(
    config.couch.bucket.purchase.name,
    config.couch.bucket.purchase.secret
  )
}


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
