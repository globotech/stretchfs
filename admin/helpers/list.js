'use strict';
var P = require('bluebird')


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

exports.dateFormat = function(date){
  if('string' === typeof date){
    date = new Date(date)
  }
  var _pad2 = function(n){return('00'+n).slice(-2)}
  return [date.getFullYear(),
          _pad2(1+date.getMonth()),
          _pad2(date.getDate())
    ].join('/') + '@' +
    (date.toTimeString().split(' ')[0])
}
exports.dateTZ = function(){
  var opts = {timeZoneName:'short'}
  return ['(',')'].join(
    (new Date()).toLocaleTimeString('en-US',opts).split(' ').pop()
  )
}

/**
 * Helper for list queries
 * @param {object} cb
 * @param {object} db
 * @param {string} type
 * @param {string} search
 * @param {string} orderField
 * @param {string} orderAsc
 * @param {integer} offset
 * @param {integer} limit
 * @return {P}
 */
exports.listQuery = function(
  cb,db,type,search,orderField,orderAsc,offset,limit
){
  if(!cb || !db)
    throw new Error('Must have couchbase helper and bucket-handle to list')
  if(!type)
    throw new Error('Must know bucket type to list')
  var bucketName = cb.getName(type,true)
  var clause = {where:'',orderby:''}
  clause.from = ' FROM ' + bucketName
  var s = []
  if('' !== search){
    //was (!search.match(/%.*%/)) for some reason?
    s.push((-1 === search.indexOf('%'))?'%' + search + '%':search)
    clause.where = ' WHERE META().id LIKE $1'
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
    'SELECT COUNT(*) AS _count' +
    clause.from + clause.where
  )
  queries.data = cb.N1Query.fromString(
    'SELECT META().id AS _id,' + bucketName + '.*' +
    clause.from + clause.where +
    clause.orderby + clause.pagination
  )
  return P.all([
    db.queryAsync(queries.data,s),
    db.queryAsync(queries.total,s)
  ])
    .spread(function(data,total){
      return {
        rows: data,
        count: (total[0]) ? total[0]._count : 0
      }
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
