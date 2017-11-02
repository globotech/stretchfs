'use strict';
var P = require('bluebird')


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
exports.listQuery = function(cb,db,type,search,orderField,orderAsc,start,limit){
  if(!start) start = 0
  else start = parseInt(start)
  if(start < 0) start = 0
  if(!limit) limit = 10
  else limit = parseInt(limit)
  if(!search) search = ''
  if(!type) throw new Error('Must know database type to list')
  if(!cb || !db) throw new Error('Must have couch helper and couch db to list')
  var cstring = 'SELECT COUNT(b) AS _count FROM ' +
    cb.getName(type,true) + ' b ' +
    ' WHERE META(b).id LIKE $1 '
  var qstring = 'SELECT META(b).id AS _id, b.* FROM ' +
    cb.getName(type,true) + ' b ' +
    ' WHERE META(b).id LIKE $1 ' +
    (orderField ? ' ORDER BY `' + orderField + '` ' +
      (orderAsc ? 'ASC' : 'DESC') : '') +
    (limit ? ' LIMIT ' + limit + ' OFFSET ' + start : '')
  var query = cb.N1Query.fromString(qstring)
  var cquery = cb.N1Query.fromString(cstring)
  return P.all([
    db.queryAsync(query,[search]),
    db.queryAsync(cquery,[search])
  ])
    .spread(function(result,count){
      if(count[0]) count = count[0]._count
      else count = 0
      return {
        rows: result,
        count: count
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
