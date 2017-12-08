'use strict';
var P = require('bluebird')
var escapeRegexString = require('escape-regex-string')

var couch = require('../../helpers/couchbase')

//open some buckets
var cb = couch.stretchfs()


/**
 * Encode path for storage
 * @param {string} path
 * @return {string}
 */
var encode = function(path){
  if('number' === typeof path){
    throw new Error('Path to encode cannot be a number: ' + path,path)
  }
  if('string' === typeof path && path.match(/,/)) return path
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
 * Recode a path so its a new array
 * @param {array} path
 * @return {string}
 */
exports.recode = function(path){
  if(!(path instanceof Array)) path = decode(path)
  return decode(encode(path))
}


/**
 * Find folders
 * @param {string} path
 * @param {array} skip
 * @return {P}
 */
exports.findFolders = function(path,skip){
  var tname = couch.getName(couch.type.stretchfs)
  path = decode(path)
  var exp
  if(path.length){
    exp = '^,' + escapeRegexString(path.join(','))
  } else{
    exp = ',.*,$'
  }
  exp = '^' + couch.schema.file(exp)
  var qstring = 'SELECT META().id AS _id, ' + tname + '.* FROM ' + tname +
    ' WHERE REGEX_CONTAINS(META().id,"' + exp +'")' +
    ' AND `path` NOT IN [$1] AND `folder` = true' +
    ' ORDER BY `name` ASC'
  var qvalue = [skip]
  var query = couch.N1Query.fromString(qstring)
  return cb.queryAsync(query,qvalue)
}


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
  var query = couch.N1Query.fromString(qstring)
  return cb.queryAsync(query,qvalue)
}


/**
 * Flag for ensureConsistency
 * @type {boolean}
 */
exports.ENSURE_CONSISTENCY = true


/**
 * Find children of a path
 * @param {string} path
 * @param {string} search
 * @param {boolean} ensureConsistency
 * @return {P}
 */
exports.findChildren = function(path,search,ensureConsistency){
  path = decode(path)
  var exp
  if(path.length){
    exp = ',' + escapeRegexString(path.join(',')) + ',[^,]+,$'
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
  var query = couch.N1Query.fromString(qstring)
  if(ensureConsistency){
    query.consistency(couch.N1Query.Consistency.REQUEST_PLUS)
  }
  return cb.queryAsync(query,qvalue)
}


/**
 * Find descendants of a path
 * @param {string} path
 * @return {P}
 */
exports.findDescendants = function(path){
  if(!path instanceof Array) path = path.split('/')
  var exp = '^,' + escapeRegexString(path.join(','))
  var tname = couch.getName(couch.type.stretchfs)
  var qstring = 'SELECT META().id AS _id, ' + tname + '.* FROM ' + tname +
    ' WHERE META().id LIKE $1 AND REGEX_CONTAINS(path,"' + exp + '")' +
    ' ORDER BY folder DESC, name ASC'
  var qvalue = [couch.schema.file() + '%']
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
  var currentPosition = []
  var currentFolder
  return P.try(function(){
    return path
  })
    .each(function(item){
      currentPosition.push(item)
      return exports.pathExists(currentPosition)
        .then(function(exists){
          if(exists) return
          var path = encode(currentPosition)
          var fileKey = couch.schema.file(path)
          currentFolder = {
            folder: true,
            name: item,
            path: path,
            mimeType: 'folder',
            status: 'ok',
            createdAt: new Date(),
            updatedAt: new Date()
          }
          return cb.upsertAsync(fileKey,currentFolder)
        })
    })
    .then(function(){
      return currentFolder
    })
}


/**
 * Remove file
 * @param {string} path
 * @return {P}
 */
exports.remove = function(path){
  path = encode(path)
  var fileKey = couch.schema.file(path)
  return cb.removeAsync(fileKey)
}
