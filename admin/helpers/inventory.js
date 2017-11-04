'use strict';
var P = require('bluebird')

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


/**
 * Private integer argument parser
 * @param {string} arg
 * @param {integer} minimumDefault
 * @return {integer}
 */
var _intarg = function(arg,minimumDefault){
  var rv = (!arg) ? minimumDefault : parseInt(arg,10)
  if(rv < minimumDefault) rv = minimumDefault
  return rv
}


/**
 * Helper for queries by hash
 * @param {object} cb
 * @param {object} db
 * @param {string} type
 * @param {string} search
 * @return {P}
 */
exports.hashQuery = function(cb,db,type,search){
  //validate and pre-process arguments
  if(!cb || !db)
    throw new Error('Must have couchbase helper and bucket-handle to list')
  if(!type)
    throw new Error('Must know bucket type to list')
  var clause = {where:''}
  clause.from = ' FROM ' + cb.getName(type,true)
  var s = []
  if(!!search){
    s.push((-1 === search.indexOf('%'))?search + '%':search)
    clause.where = ' WHERE `hash` LIKE $1'
  }
  clause.groupby = ' GROUP BY `hash`'
  var query = cb.N1Query.fromString(
    'SELECT `hash`' +
    ',ARRAY_AGG(meta().id) AS id' +
    ',ARRAY_AGG(DISTINCT CONCAT(`prism`,":",`store`)) AS loc' +
    ',ARRAY_AGG(DISTINCT `size`) AS size' +
    ',ARRAY_AGG(DISTINCT `mimeType`) AS mimeType' +
    ',ARRAY_AGG(DISTINCT `mimeExtension`) AS mimeExtension' +
    ',ARRAY_AGG(DISTINCT `relativePath`) AS relativePath' +
    ',ARRAY_MAX(ARRAY_AGG(DISTINCT `createdAt`)) AS createdAt' +
    ',ARRAY_MAX(ARRAY_AGG(DISTINCT `updatedAt`)) AS updatedAt' +
    clause.from + clause.where + clause.groupby
  )
  return db.queryAsync(query,s)
    .then(function(result){
      var r = result.shift()
      //sanitize (collapse single member arrays)
      keyList.forEach(function(key){
        if(r[key] && 1 >= r[key].length){
          r[key] = r[key][0]
        }
      })
      return r
    })
}


/**
 * Helper for list queries
 * @param {object} cb
 * @param {object} db
 * @param {string} type
 * @param {string} search
 * @param {string} orderField
 * @param {string} orderAsc
 * @param {integer} start
 * @param {integer} limit
 * @return {P}
 */
exports.listMain = function(cb,db,type,search,orderField,orderAsc,start,limit){
  //validate and pre-process arguments
  if(!cb || !db)
    throw new Error('Must have couchbase helper and bucket-handle to list')
  if(!type)
    throw new Error('Must know bucket type to list')
  var clause = {where:'',orderby:''}
  clause.from = ' FROM ' + cb.getName(type,true)
  var s = []
  if(!!search){
    s.push((-1 === search.indexOf('%'))?'%' + search + '%':search)
    clause.where = ' WHERE META().id LIKE $1'
  }
  if(orderField){
    clause.orderby = ' ORDER BY `' + orderField + '`' +
      (orderAsc ? ' ASC' : ' DESC')
  }
  clause.groupby = ' GROUP BY `hash`'
  start = _intarg(start,0)
  limit = _intarg(limit,10)
  clause.pagination = ' LIMIT ' + limit + ' OFFSET ' + start
  //build queries
  var queries = {}
  queries.total = cb.N1Query.fromString(
    'SELECT ARRAY_COUNT(ARRAY_AGG(DISTINCT `hash`)) AS _count' +
    clause.from + clause.where
  )
  queries.data = cb.N1Query.fromString(
    'SELECT `hash`' +
    ',ARRAY_AGG(meta().id) AS id' +
    ',ARRAY_AGG(DISTINCT CONCAT(`prism`,":",`store`)) AS loc' +
    ',ARRAY_AGG(DISTINCT `size`) AS size' +
    ',ARRAY_AGG(DISTINCT `mimeType`) AS mimeType' +
    ',ARRAY_AGG(DISTINCT `mimeExtension`) AS mimeExtension' +
    ',ARRAY_AGG(DISTINCT `relativePath`) AS relativePath' +
    ',ARRAY_MAX(ARRAY_AGG(DISTINCT `createdAt`)) AS createdAt' +
    ',ARRAY_MAX(ARRAY_AGG(DISTINCT `updatedAt`)) AS updatedAt' +
    clause.from + clause.where + clause.groupby +
    clause.orderby + clause.pagination
//  'SELECT META().id AS _id,*' + clause.from + clause.where +
//    clause.orderby + clause.pagination
  )
  return P.all([
    db.queryAsync(queries.data,s),
    db.queryAsync(queries.total,s)
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
  var s = []
  //build queries
  var queries = {}
  queries.total = cb.N1Query.fromString(
    'SELECT ARRAY_COUNT(ARRAY_AGG(DISTINCT `hash`)) AS _count' +
    clause.from + clause.where
  )
  queries.data = cb.N1Query.fromString(
    'SELECT META(b.id) AS id' + clause.from
  )
  return P.all([
    db.queryAsync(queries.data,s),
    db.queryAsync(queries.total,s)
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
