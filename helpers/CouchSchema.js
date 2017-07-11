'use strict';



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
 * Peer record structure
 * @typedef {Object} PEER_RECORD {{
 * _id:string,
 * _rev:string,
 * name:string,
 * createdAt:string,
 * host:string,
 * port:number,
 * prism:string,
 * type:PEER_TYPES,
 * existingDownVote:boolean,
 * active:boolean,
 * available:boolean,
 * writable:boolean,
 * protected:boolean
 * }}
 */


/**
 * Inventory/file record structure
 * @typedef {Object} FILE_RECORD {{
 * hash:string,
 * mimeType:string,
 * mimeExtension:string,
 * relativePath:string,
 * size:number,
 * count:number,
 * exists:boolean,
 * map: array
 * }}
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
  return this.applyPrefix(
    this.PEER_TYPES.prism + ':' +
    (name || '')
  )
}


/**
 * Store Key
 * @param {string} prism (optional)
 * @param {string} name
 * @return {string}
 */
CouchSchema.prototype.store = function(prism,name){
  return this.applyPrefix(
    this.PEER_TYPES.store + ':' +
    (prism || '') +
    (name ? ':' + name : '')
  )
}


/**
 * Supervisor Key
 * @param {string} name
 * @return {string}
 */
CouchSchema.prototype.supervisor = function(name){
  return this.applyPrefix('supervisor:' + (name || ''))
}


/**
 * Supervisor Key
 * @param {string} name
 * @return {string}
 */
CouchSchema.prototype.supervisor = function(name){
  return this.applyPrefix('supervisor:' + (name || ''))
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
  return this.applyPrefix(token || '')
}


/**
 * Inventory
 * @param {string} hash
 * @param {string} prism
 * @param {string} store
 * @return {string}
 */
CouchSchema.prototype.inventory = function(hash,prism,store){
  return this.applyPrefix(
    (hash || '') +
    (prism ? ':' + prism : '') +
    (store ? ':' + store : '')
  )
}


/**
 * Export Object
 * @type {CouchSchema}
 */
module.exports = CouchSchema
