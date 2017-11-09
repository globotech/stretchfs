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

var _conf = {
  couchbase: false,
  bucket: false,
  bucketType: false,
  bucketName: ''
}
/**
 *
 */
exports.setup = function(dfl){
  Object.keys(_conf).forEach(function(k){
    if(_conf[k] !== dfl[k]) _conf[k] = dfl[k]
  })
  if(_conf.couchbase && _conf.bucket && _conf.bucketType){
    _conf.bucketName = _conf.couchbase.getName(_conf.bucketType,true)
  }
  console.log(_conf)
}


/**
 * bullshit
 * @param hash
 * @private
 */
var _getByHash = function(hash){
  var qstr =
    'SELECT (' +
    'SELECT `stretchfs-inventory`.*' +
    ' FROM `stretchfs-inventory`' +
    ' WHERE NOT CONTAINS(META().id,":")' +
    ' AND META().id LIKE "a03f181dc7dedcfb577511149b8844711efdb04f%"' +
    ') AS summary' +
    ',' +
    '(' +
    'SELECT META().id AS id,SPLIT(META().id,":")[0] AS idHash,`stretchfs-inventory`.*' +
    ' FROM `stretchfs-inventory`' +
    ' WHERE CONTAINS(META().id,":")' +
    ' AND META().id LIKE "a03f181dc7dedcfb577511149b8844711efdb04f%"' +
    ') AS detail'
  console.log(qstr)
}


/**
 * Helper for queries by hash
 * @param {object} cb
 * @param {object} bucket
 * @param {string} type
 * @param {string} search
 * @return {P}
 */
exports.hashQuery = function(search,cb,bucket,type){
  cb = cb || _conf.couchbase || false
  bucket = bucket || _conf.bucket || false
  type = type || _conf.bucketType || false
  //validate and pre-process arguments
  if(!cb || !bucket)
    throw new Error('Must have couchbase helper and bucket-handle to list')
  if(!type)
    throw new Error('Must know bucket type to list')
  var bucketName = _conf.bucketName || cb.getName(type,true)
  var clause = {
    where: [ ' WHERE NOT CONTAINS(META().id,":")' ],
  }
  clause.from = ' FROM ' + bucketName
  var s = []
  if(!!search){
    s.push((-1 === search.indexOf('%'))?search + '%':search)
    clause.where.push(' META().id LIKE $1')
  }
  var query = cb.N1Query.fromString(
    'SELECT ' + bucketName + '.*' +
    clause.from + clause.where.join(' AND')
  )
  return bucket.queryAsync(query,s)
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
 * @param {string} search
 * @param {string} orderField
 * @param {string} orderAsc
 * @param {integer} offset
 * @param {integer} limit
 * @param {object} cb
 * @param {object} bucket
 * @param {string} type
 * @return {P}
 */
exports.listMain = function(
  search,orderField,orderAsc,offset,limit,cb,bucket,type
){
  cb = cb || _conf.couchbase || false
  bucket = bucket || _conf.bucket || false
  type = type || _conf.bucketType || false
  //validate and pre-process arguments
  if(!cb || !bucket)
    throw new Error('Must have couchbase helper and bucket-handle to list')
  if(!type)
    throw new Error('Must know bucket type to list')
  var bucketName = _conf.bucketName || cb.getName(type,true)
  var clause = {
    where: [ ' WHERE NOT CONTAINS(META().id,":")' ],
    orderby: ''
  }
  clause.from = ' FROM ' + bucketName
  var s = []
  if(!!search){
    s.push((-1 === search.indexOf('%'))?'%' + search + '%':search)
    clause.where.push(' META().id LIKE $1')
  }
  if(orderField){
    clause.orderby = ' ORDER BY `' + orderField + '`' +
      (orderAsc ? ' ASC' : ' DESC')
  }
  offset = _intarg(offset,0)
  limit = _intarg(limit,10)
  clause.pagination = ' LIMIT ' + limit + ' OFFSET ' + offset
  //build queries
  var queries = {}
  queries.total = cb.N1Query.fromString(
    'SELECT COUNT(DISTINCT `hash`) AS _count' +
    clause.from + clause.where.join(' AND')
  )
  queries.data = cb.N1Query.fromString(
    'SELECT ' + bucketName + '.*' +
    clause.from + clause.where.join(' AND') +
    clause.orderby + clause.pagination
  )
  return P.all([
    bucket.queryAsync(queries.data,s),
    bucket.queryAsync(queries.total,s)
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
