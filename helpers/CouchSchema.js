'use strict';
var crc32 = require('crc32')



/**
 * Couch  Key Schema
 * @param {string} prefix
 * @constructor
 */
var CouchSchema = function(prefix){
  if(!prefix) prefix = ''
  this.prefix = prefix
}


/**
 * Valid peer types
 * @enum {string} PEER_TYPES
 */
CouchSchema.prototype.PEER_TYPES = {
  'prism': 'prism',
  'store': 'store'
}


/**
 * Valid Store Types
 * @enum {string} STORE_TYPES
 *
CouchSchema.prototype.STORE_TYPES = {
  'tape': 'tape',
  'floppy': 'floppy',
  'cdrom': 'cdrom',
  'zip': 'zip',
  'usb': 'usb',
  'flash': 'flash',
  'cloud': 'cloud',
  'hdd': 'hdd',
  'ssd': 'ssd',
  'memory': 'memory'
}
*/


/**
 * Apply Key Prefix
 * @param {string} key
 * @return {string}
 */
CouchSchema.prototype.applyPrefix = function(key){
  if(!this.prefix) return '' + key
  return this.prefix + ':' + (key || '')
}


/**
 * Prism Key
 * @param {string} name
 * @return {string}
 */
CouchSchema.prototype.prism = function(name){
  return this.applyPrefix(this.PEER_TYPES.prism + ':' + (name ? name : ''))
}


/**
 * Store Key
 * @param {string} name
 * @return {string}
 */
CouchSchema.prototype.store = function(name){
  return this.applyPrefix(this.PEER_TYPES.store + ':' + (name ? name : ''))
}


/**
 * DownVote Key
 * @param {string} castee
 * @param {string} caster
 * @return {string}
 */
CouchSchema.prototype.downVote = function(castee,caster){
  var ending = caster ? ':' + caster : ''
  return this.applyPrefix('down:' + (castee || '') + ending)
}


/**
 * Look up a purchase
 * @param {string} token
 * @return {string}
 */
CouchSchema.prototype.purchase = function(token){
  return this.applyPrefix('purchase:' + token || '')
}


/**
 * Inventory
 * @param {string} hash
 * @param {string} store
 * @return {string}
 */
CouchSchema.prototype.inventory = function(hash,store){
  return this.applyPrefix('inventory:' +
    (hash || '') +
    (store ? ':' + store : '')
  )
}


/**
 * Inventory Copy Task (in the StretchFS bucket)
 * @param {string} hash
 * @param {string} store
 * @return {string}
 */
CouchSchema.prototype.inventoryTask = function(hash,store){
  return this.applyPrefix('inventoryTask:' +
    (hash || '') +
    (store ? ':' + store : '')
  )
}


/**
 * Job
 * @param {string} handle
 * @return {string}
 */
CouchSchema.prototype.job = function(handle){
  return this.applyPrefix('job:' + handle || '')
}


/**
 * Read slot
 * @param {string} remoteHost
 * @param {string} remotePort
 * @param {string} userAgent
 * @param {string} hash
 * @return {string}
 */
CouchSchema.prototype.slot = function(remoteHost,remotePort,userAgent,hash){
  if(!remotePort) remotePort = 65537
  if(!userAgent) userAgent = 'phantom'
  if(!remoteHost || !hash) return 'slot:'
  var sum = crc32(remoteHost + remotePort + userAgent + hash)
  return this.applyPrefix('slot:' + sum)
}


/**
 * StretchFS User
 * @param {string} name
 * @return {string}
 */
CouchSchema.prototype.user = function(name){
  return this.applyPrefix('user:' + (name || ''))
}


/**
 * StretchFS Token
 * @param {string} token
 * @return {string}
 */
CouchSchema.prototype.userToken = function(token){
  return this.applyPrefix('userToken:' + (token || ''))
}


/**
 * StretchFS Staff (admin user)
 * @param {string} name
 * @return {string}
 */
CouchSchema.prototype.staff = function(name){
  return this.applyPrefix('staff:' + (name || ''))
}


/**
 * Counter stat
 * @param {string} system
 * @param {string} key
 * @return {string}
 */
CouchSchema.prototype.counter = function(system,key){
  if(!system) system = ''
  else system = system + '-'
  if(!key) key = ''
  return this.applyPrefix('counter:stat:' + system + key)
}


/**
 * Counter error
 * @param {string} system
 * @param {string} key
 * @return {string}
 */
CouchSchema.prototype.counterError = function(system,key){
  if(!system) system = ''
  else system = system + '-'
  if(!key) key = ''
  return this.applyPrefix('counter:error:' + system + key)
}


/**
 * Last counter clear
 * @return {string}
 */
CouchSchema.prototype.lastCounterClear = function(){
  return this.applyPrefix('lastCounterClear')
}


/**
 * Export Object
 * @type {CouchSchema}
 */
module.exports = CouchSchema
