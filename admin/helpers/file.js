'use strict';
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
 * Remove file
 * @param {string} path
 * @return {P}
 */
exports.remove = function(path){
  path = decode(path)
  var exp = '^,' + path.join(',')
  var tname = couch.getName(couch.type.stretchfs)
  var qstring = 'SELECT META().id AS _id FROM ' + tname +
    ' WHERE META().id LIKE $1 AND REGEX_CONTAINS(path,$2)' +
    ' ORDRE BY folder DESC, name ASC'
  var qvalue = [couch.schema.file() + '%',exp]
  console.log(qstring,qvalue)
  var query = couch.N1Query.fromString(qstring)
  return cb.queryAsync(query,qvalue)
    .each(function(file){
      return cb.removeAsync(file._id)
    })
}


/**
 * Relative path (prefix removed)
 * @param {string} path
 * @return {Array}
 */
exports.relativePath = function(path){
  path = path.slice(0)
  return path
}


/**
 * Relative parent path
 * @param {string} path
 * @return {array}
 */
exports.relativePathParent = function(path){
  path = exports.parentPath()
  return path
}


/**
 * Parent path
 * @param {string} path
 * @return {array}
 */
exports.parentPath = function(path){
  path = path.slice(0)
  path.pop()
  return path
}


/**
 * Encode path
 * @type {encode}
 */
exports.encodePath = encode


/**
 * Decode path
 * @type {decode}
 */
exports.decodePath = decode


/**
 * Check if path exists
 * @param {string} path
 * @return {P}
 */
exports.pathExists = function(path){
  path = decode(path)
  var tname = couch.getName(couch.type.stretchfs)
  var qstring = 'SELECT ' + tname + '. * FROM ' + tname +
    ' WHERE META().id LIKE $1 AND path = $2'
  var qvalue = [couch.schema.file() + '%',encode(path)]
  console.log(qstring,qvalue)
  var query = couch.N1Query.fromString(qstring)
  return cb.queryAsync(query,qvalue)
    .then(function(result){
      return (result)
    })
}


/**
 * Find children of a path
 * @param {string} path
 * @return {P}
 */
exports.findChildren = function(path){
  path = decode(path)
  var exp
  if(path.length){
    exp = '^,' + path.join(',') + ',[^,]+,$'
  } else{
    exp = '^,[^,]+,$'
  }
  var tname = couch.getName(couch.type.stretchfs)
  var qstring = 'SELECT ' + tname + '. * FROM ' + tname +
    ' WHERE META().id LIKE $1 AND REGEX_CONTAINS(path,$2)' +
    ' ORDRE BY folder DESC, name ASC'
  var qvalue = [couch.schema.file() + '%',exp]
  console.log(qstring,qvalue)
  var query = couch.N1Query.fromString(qstring)
  return cb.queryAsync(query,qvalue)
}


/**
 * Find descendants of a path
 * @param {string} path
 * @return {P}
 */
exports.findChildren = function(path){
  if(!path instanceof Array) path = path.split('/')
  var exp = '^,' + path.join(',')
  var tname = couch.getName(couch.type.stretchfs)
  var qstring = 'SELECT ' + tname + '. * FROM ' + tname +
    ' WHERE META().id LIKE $1 AND REGEX_CONTAINS(path,$2)' +
    ' ORDRE BY folder DESC, name ASC'
  var qvalue = [couch.schema.file() + '%',exp]
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
