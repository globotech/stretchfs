'use strict';



/**
 * Redis Key Schema
 * @param {string} prefix
 * @constructor
 */
var RedisSchema = function(prefix){
  if(!prefix) prefix = 'stretchfs'
  this.prefix = prefix
}


/**
 * Apply Key Prefix
 * @param {string} key
 * @return {string}
 */
RedisSchema.prototype.applyPrefix = function(key){
  return this.prefix + ':' + key
}


/**
 * Key used to flush db on prism start
 * @return {string}
 */
RedisSchema.prototype.flushKeys = function(){
  return this.applyPrefix('*')
}


/**
 * Key used to print stats
 * @return {string}
 */
RedisSchema.prototype.statKeys = function(){
  return this.applyPrefix('counter:*')
}


/**
 * Prism list Key
 * @return {string}
 */
RedisSchema.prototype.prismList = function(){
  return this.applyPrefix('prismList')
}


/**
 * Store list Key
 * @return {string}
 */
RedisSchema.prototype.storeList = function(){
  return this.applyPrefix('storeList')
}


/**
 * Prism hits (for load balancing)
 * @param {string} token
 * @param {string} prism
 * @return {string}
 */
RedisSchema.prototype.prismHits = function(token,prism){
  return this.applyPrefix('prismHits:' + token + ':' + prism)
}


/**
 * Store hits (for load balancing)
 * @param {string} token
 * @param {string} store
 * @return {string}
 */
RedisSchema.prototype.storeHits = function(token,store){
  return this.applyPrefix('storeHits:' + token + ':' + store)
}


/**
 * Content existence cache
 * @param {string} hash
 * @return {string}
 */
RedisSchema.prototype.contentExists = function(hash){
  return this.applyPrefix('contentExists:' + hash)
}


/**
 * Check if the master is up
 * @return {string}
 */
RedisSchema.prototype.masterUp = function(){
  return this.applyPrefix('masterUp')
}


/**
 * Look up a user session by token
 * @param {string} username
 * @return {string}
 */
RedisSchema.prototype.user = function(username){
  return this.applyPrefix('user:' + username)
}


/**
 * Peer slots
 * @return {string}
 */
RedisSchema.prototype.peerSlot = function(){
  return this.applyPrefix('peerSlot')
}


/**
 * Look up a purchase
 * @param {string} token
 * @return {string}
 */
RedisSchema.prototype.purchase = function(token){
  return this.applyPrefix('purchase:' + token)
}


/**
 * Purchase Stat Collection Set
 * @return {string}
 */
RedisSchema.prototype.purchaseStatCollect = function(){
  return this.applyPrefix('purchase:statCollect')
}


/**
 * Purchase Stat
 * @param {string} hash
 * @param {string} type
 * @return {string}
 */
RedisSchema.prototype.purchaseStat = function(hash,type){
  return this.applyPrefix('purchase:' + (type || 'byte') + 'Count:' +hash)
}


/**
 * Inventory
 * @param {string} hash
 * @return {string}
 */
RedisSchema.prototype.inventory = function(hash){
  return this.applyPrefix('inventory:' + hash)
}


/**
 * Inventory Stat
 * @param {string} hash
 * @param {string} type
 * @return {string}
 */
RedisSchema.prototype.inventoryStat = function(hash,type){
  return this.applyPrefix('inventory:' + (type || 'byte') + 'Count:' +hash)
}


/**
 * Inventory Stat Collection Set
 * @return {string}
 */
RedisSchema.prototype.inventoryStatCollect = function(){
  return this.applyPrefix('inventory:statCollect')
}


/**
 * Counter stat
 * @param {string} system
 * @param {string} key
 * @return {string}
 */
RedisSchema.prototype.counter = function(system,key){
  return this.applyPrefix('counter:stat:' + system + ':' + key)
}


/**
 * Counter error
 * @param {string} system
 * @param {string} key
 * @return {string}
 */
RedisSchema.prototype.counterError = function(system,key){
  return this.applyPrefix('counter:error:' + system + ':' + key)
}


/**
 * Export Object
 * @type {RedisSchema}
 */
module.exports = RedisSchema
