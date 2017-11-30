'use strict';
var P = require('bluebird')

var couch = require('../../helpers/couchbase')

//open some buckets
var cb = couch.stretchfs()


/**
 * Encode path for storage
 * @param {string} path
 * @return {string}
 */
var encode = function(path){
  if(!path instanceof Array) path = [path]
  path = path.filter(function(el){return (el)})
  return ',' + path.join(',') + ','
}


/**
 * Decode path from storage
 * @param {string} path
 * @return {string}
 */
var decode = function(path){
  if(path instanceof Array) return path.slice(0)
  if(!path) path = ''
  return path.split(',').filter(function(el){return (el)})
}


/**
 * Relative path (prefix removed)
 * @param {string} path
 * @return {Array}
 */
exports.relativePath = function(path){
  if(!(path instanceof Array)) path = decode(path)
  path = path.slice(0)
  return path
}


/**
 * Relative parent path
 * @param {string} path
 * @return {array}
 */
exports.relativePathParent = function(path){
  path = exports.parentPath(path)
  return path
}


/**
 * Parent path
 * @param {string} path
 * @return {array}
 */
exports.parentPath = function(path){
  if(!(path instanceof Array)) path = decode(path)
  path = path.slice(0)
  path.pop()
  return path
}


/**
 * Encode path
 * @type {encode}
 */
exports.encode = encode


/**
 * Decode path
 * @type {decode}
 */
exports.decode = decode


/**
 * Check if path exists
 * @param {string} path
 * @return {P}
 */
exports.pathExists = function(path){
  path = decode(path)
  var tname = couch.getName(couch.type.stretchfs)
  var qstring = 'SELECT META().id AS _id FROM ' + tname +
    ' WHERE META().id = $1'
  var qvalue = [couch.schema.file(encode(path))]
  console.log(qstring,qvalue)
  var query = couch.N1Query.fromString(qstring)
  return cb.queryAsync(query,qvalue)
    .then(function(result){
      return (result instanceof Array && result.length > 0)
    })
}


/**
 * Find file by path
 * @param {string} path
 * @return {P}
 */
exports.findByPath = function(path){
  return cb.getAsync(couch.schema.file(encode(decode(path))))
}


/**
 * Find file by handle
 * @param {string} handle
 * @return {P}
 */
exports.findByHandle = function(handle){
  var tname = couch.getName(couch.type.stretchfs)
  var qstring = 'SELECT META().id AS _id, ' + tname + '.* FROM ' + tname +
    ' WHERE `handle` = $1'
  var qvalue = [handle]
  console.log(qstring,qvalue)
  var query = couch.N1Query.fromString(qstring)
  return cb.queryAsync(query,qvalue)
    .then(function(result){
      return {
        value: result,
        cas: null
      }
    })
}


/**
 * Find children of a path
 * @param {string} path
 * @param {string} search
 * @return {P}
 */
exports.findChildren = function(path,search){
  path = decode(path)
  var exp
  if(path.length){
    exp = ',' + path.join(',') + ',[^,]+,$'
  } else{
    exp = ',[^,]+,$'
  }
  exp = '^' + couch.schema.file(exp)
  var tname = couch.getName(couch.type.stretchfs)
  var qstring = 'SELECT META().id AS _id, ' + tname + '.* FROM ' + tname +
    ' WHERE REGEX_CONTAINS(META().id,"' + exp +'")' +
    ' AND `name` LIKE $1' +
    ' ORDER BY `folder` DESC, `name` ASC'
  if(!search) search = '%%'
  else search = '%' + search + '%'
  var qvalue = [search]
  console.log(qstring,qvalue)
  var query = couch.N1Query.fromString(qstring)
  return cb.queryAsync(query,qvalue)
}


/**
 * Find descendants of a path
 * @param {string} path
 * @return {P}
 */
exports.findDescendants = function(path){
  if(!path instanceof Array) path = path.split('/')
  var exp = '^,' + path.join(',')
  var tname = couch.getName(couch.type.stretchfs)
  var qstring = 'SELECT META().id AS _id, ' + tname + '.* FROM ' + tname +
    ' WHERE META().id LIKE $1 AND REGEX_CONTAINS(path,"' + exp + '")' +
    ' ORDER BY folder DESC, name ASC'
  var qvalue = [couch.schema.file() + '%']
  console.log(qstring,qvalue)
  var query = couch.N1Query.fromString(qstring)
  return cb.queryAsync(query,qvalue)
}


/**
 * Create folder path including parents
 * @param {string} path
 * @return {P}
 */
exports.mkdirp = function(path){
  path = decode(path)
  path.pop()
  var currentPosition = []
  return P.try(function(){
    return path
  })
    .each(function(item){
      currentPosition.push(item)
      return exports.pathExists(currentPosition)
        .then(function(exists){
          if(exists) return
          var fileKey = couch.schema.file(item)
          var file = {
            folder: true,
            name: item,
            path: currentPosition,
            mimeType: 'folder',
            status: 'ok'
          }
          return cb.upsertAsync(fileKey,file)
        })
    })
}


/**
 * Remove file
 * @param {string} path
 * @return {P}
 */
exports.remove = function(path){
  path = decode(path)
  var exp = '^,' + path.join(',')
  var tname = couch.getName(couch.type.stretchfs)
  var qstring = 'SELECT META().id AS _id FROM ' + tname +
    ' WHERE META().id LIKE $1 AND REGEX_CONTAINS(`path`,$2)' +
    ' ORDER BY folder DESC, name ASC'
  var qvalue = [couch.schema.file() + '%',exp]
  console.log(qstring,qvalue)
  var query = couch.N1Query.fromString(qstring)
  return cb.queryAsync(query,qvalue)
    .each(function(file){
      return cb.removeAsync(file._id)
    })
}
