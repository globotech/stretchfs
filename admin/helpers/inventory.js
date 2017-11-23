'use strict';
var P = require('bluebird')
var integerArgDefaulted = require('./list').integerArgDefaulted

//list of fields for sanitizer
var keyList = [
  'hash',
  'createdAt',
  'updatedAt',
  'mimeType',
  'mimeExtension',
  'relativePath',
  'size'
]
//list of valid inventory rules
var ruleSet = {
  copyMinimum:'int',
  copyMaximum:'int',
  forcedStore:'arr',
  forcedAll:'bool',
  protectedStore:'arr',
  protectedAll:'bool',
  bannedStore:'arr'
}


/**
 * Provide the ruleSet to client side
 * @return {object} ruleSet with key as ruleName and value as ruleDataType
 */
exports.ruleSet = function(){
  return P.try(function(){return ruleSet})
}

var _hndl = {
  couchbase: false,
  bucket: false,
  bucketType: false,
  bucketName: ''
}


/**
 * Setup routine, provides stateful handles, and maintains 'current' bucketName
 * @param {object} handles to fill the internal _hndl with (same key names)
 */
exports.setup = function(handles){
  Object.keys(_hndl).forEach(function(k){
    if(_hndl[k] !== handles[k]) _hndl[k] = handles[k]
  })
  if(_hndl.couchbase && _hndl.bucket && _hndl.bucketType){
    _hndl.bucketName = _hndl.couchbase.getName(_hndl.bucketType,true)
  }
}


/**
 * bullshit query prep
 * @param {string} hash
 * @return {object}
 */
var _queryPrep = function(hash){
  var rv = {string:'',args:[]}
  //validate and pre-process arguments
  if(!_hndl.couchbase || !_hndl.bucket)
    throw new Error('Must setup couchbase (helper) and bucket (handle) to list')
  if(!_hndl.bucketName)
    throw new Error('Must setup bucketType/bucketName to query')
  var clause = {
    from: ' FROM ' + _hndl.bucketName,
    where: {
      summary: [' WHERE 1=1'],
      detail: [' WHERE 1=2']
    }
  }
  if(!!hash){
    hash = (-1 === hash.indexOf('%')) ? hash + '%' : hash
    clause.where.summary.push(' META().id LIKE $1')
    rv.args.push(couch.schema.inventory(hash))
    clause.where.detail.push(' META().id LIKE $2')
    rv.args.push(couch.schema.inventory(hash))
  }
  rv.string =
    'SELECT (' +
    'SELECT ' + _hndl.bucketName + '.*' +
    clause.from + clause.where.summary.join(' AND') +
    ')[0] AS summary' +
    ',' +
    '(' +
    'SELECT ' + _hndl.bucketName + '.*' +
    ',META().id,SPLIT(META().id,":")[0] AS idHash' +
    clause.from + clause.where.detail.join(' AND') +
    ') AS detail'
  return rv
}


/**
 * Helper for queries by hash
 * @param {string} search
 * @return {P}
 */
exports.hashQuery = function(search){
  var query = _queryPrep(search)
  return _hndl.bucket.queryAsync(
    _hndl.couchbase.N1Query.fromString(query.string),
    query.args
  )
    .then(function(result){
      return result[0]
    })
}


/**
 * Helper for list queries
 * @param {string} search
 * @param {string} orderField
 * @param {string} orderAsc
 * @param {integer} offset
 * @param {integer} limit
 * @return {P}
 */
exports.listMain = function(search,orderField,orderAsc,offset,limit){
  //validate and pre-process arguments
  if(!_hndl.couchbase || !_hndl.bucket)
    throw new Error('Must have couchbase helper and bucket-handle to list')
  if(!_hndl.bucketName)
    throw new Error('Must know bucket type/name to list')
  var clause = {
    where: [' WHERE 1=1'],
    orderby: ''
  }
  clause.from = ' FROM ' + _hndl.bucketName
  var s = []
  if(!!search){
    s.push((-1 === search.indexOf('%'))?'%' + search + '%':search)
    clause.where.push(' META().id LIKE $1')
  }
  if(orderField){
    clause.orderby = ' ORDER BY `' + orderField + '`' +
      (orderAsc ? ' ASC' : ' DESC')
  }
  offset = integerArgDefaulted(offset,0)
  limit = integerArgDefaulted(limit,10)
  clause.pagination = ' LIMIT ' + limit + ' OFFSET ' + offset
  //build queries
  var queries = {}
  queries.total = _hndl.couchbase.N1Query.fromString(
    'SELECT COUNT(DISTINCT `hash`) AS _count' +
    clause.from + clause.where.join(' AND')
  )
  queries.data = _hndl.couchbase.N1Query.fromString(
    'SELECT ' + _hndl.bucketName + '.*' +
    clause.from + clause.where.join(' AND') +
    clause.orderby + clause.pagination
  )
  return P.all([
    _hndl.bucket.queryAsync(queries.data,s),
    _hndl.bucket.queryAsync(queries.total,s)
  ])
    .spread(function(data,total){
      var rv = {
        rows: [],
        count: (total[0]) ? total[0]._count : 0
      }
      data.forEach(function(r){
        //sanitize (collapse single member arrays)
        keyList.forEach(function(key){
          if(r[key] && 1 >= r[key].length){
            r[key] = r[key][0]
          }
        })
        rv.rows.push(r)
      })
      return rv
    })
}


/**
 * Helper for list queries
 * @param {object} cb
 * @param {object} db
 * @param {string} type
 * @return {P}
 */
exports.listBuild = function(cb,db,type){
  //validate and pre-process arguments
  if(!cb || !db)
    throw new Error('Must have couchbase helper and bucket-handle to list')
  if(!type)
    throw new Error('Must know bucket type to list')
  var clause = {}
  clause.from = ' FROM ' + cb.getName(type,true)
  clause.where = ' WHERE CONTAINS(META().id,":")'
  clause.orderby = ' ORDER BY META().id ASC'
  //build queries
  var query = cb.N1Query.fromString('SELECT META().id AS id' +
    clause.from + clause.where + clause.orderby)
  return db.queryAsync(query)
}


/**
 * Pagination helper
 * @param {number} start
 * @param {number} count
 * @param {number} limit
 * @return {{start: *, end: *, previous: number, next: *}}
 */
exports.pagination = function(start,count,limit){
  if(start > count) start = count - limit
  var page = {
    start: start,
    end: start + limit,
    previous: start - limit,
    next: start + limit
  }
  if(page.previous < 0) page.previous = 0
  if(page.next > count) page.next = start
  if(page.end > count) page.end = count
  return page
}
