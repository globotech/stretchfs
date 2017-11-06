'use strict';
var P = require('bluebird')
var fs = require('graceful-fs')
var path = require('path')

var couch = require('./couchbase')
var hasher = require('./hasher')
var logger = require('./logger')

var config = require('../config')

var basePath = path.resolve(config.root + '/content')

//open some buckets
var stretchInventory = couch.inventory()


/**
 * Get a relative path from a hash
 * @param {string} hash
 * @param {string} ext
 * @return {string}
 */
exports.toRelativePath = function(hash,ext){
  var file = ''
  var type = hasher.identify(hash)
  var parts = hash.split('')
  for(var i = 1; i <= parts.length; i++){
    file = file + parts[i - 1]
    if(i % 2 === 0 && i !== hasher.hashLengths[type]){
      file = file + '/'
    }
  }
  if(ext)
    file = file + '.' + ext
  return file
}


/**
 * Convert a hash to an absolute path
 * @param {string} hash
 * @param {string} ext  File extension
 * @return {string}
 */
exports.toPath = function(hash,ext){
  return path.resolve(basePath,exports.toRelativePath(hash,ext))
}


/**
 * Convert a path back to a hash
 * @param {string} file
 * @return {string}
 */
exports.fromPath = function(file){
  //remove root
  file = file.replace(basePath,'')
  //strip extension
  file = file.replace(/\.\w+$/,'')
  //filter out to hash
  return file.replace(/[^a-f0-9]+/gi,'')
}


/**
 * Convert full path to fileName = <hash>.<ext>
 * @param {string} fullPath
 * @return {string}
 */
exports.fromPathToFile = function(fullPath){
  var file = '' + fullPath
  var ext = path.extname(file)
  //remove root
  file = file.replace(basePath,'')
  //filter out to hash
  file = file.replace(/[^a-f0-9]+/gi,'')
  return file + ext
}


/**
 * Validate hash
 * @param {string} hash
 * @return {boolean}
 */
exports.validate = function(hash){
  if(!hash) return false
  var type = hasher.identify(hash)
  return !!hash.match(hasher.hashExpressions[type])
}


/**
 * Since the node fs.existsAsync wont work this has to be done here
 * @param {string} file
 * @return {P}
 */
exports.fsExists = function(file){
  return new P(function(resolve){
    fs.exists(file,function(result){
      resolve(result)
    })
  })
}


/**
 * Extract hash and extension from filename
 * @param {string} file
 * @return {object}
 */
exports.hashFromFilename = function(file){
  var match = file.match(/^([a-f0-9]+)\.(\w+)$/i)
  if(3 !== match.length) throw new Error('Failed to parse file name')
  var hash = match[1]
  var type = hasher.identify(hash)
  var ext = match[2]
  return {
    hash: hash,
    type: type,
    ext: ext
  }
}


/**
 * Find a file based on hash
 * @param {string} hash
 * @param {string} ext
 * @return {P}
 */
exports.find = function(hash,ext){
  var file = exports.toPath(hash,ext)
  return P.try(function(){
    if(fs.existsSync(file)){
      return {
        exists: true,
        path: file,
        folder: path.dirname(file),
        basename: path.basename(file),
        fileName: exports.fromPathToFile(file),
        hash: hash,
        hashType: hasher.identify(hash),
        ext: path.extname(file).replace('.','')
      }
    } else {
      return {
        exists: false,
        path: '',
        folder: '',
        basename: '',
        fileName: '',
        hash: hash,
        hashType: hasher.identify(hash),
        ext: ''
      }
    }
  })
}


/**
 * Get details from a filename with extension
 * @param {string} hash
 * @param {string} ext
 * @return {P}
 */
exports.details = function(hash,ext){
  var findDetail = {}
  var details = {}
  var inventoryKey = couch.schema.inventory(hash)
  return P.try(function(){
    if(!ext){
      return stretchInventory.getAsync(inventoryKey)
        .then(function(result){
          return exports.find(hash,result.value.mimeExtension)
        })
        .catch(function(err){
          if(13 !== err.code) throw err
          return exports.find(hash,ext)
        })
    } else {
      return exports.find(hash,ext)
    }
  })
    .then(function(result){
      if(false === result.exists){
        throw new Error('File not found')
      }
      findDetail = result
      return fs.statAsync(findDetail.path)
        .then(function(stat){
          return stat
        })
        .catch(function(){
          return false
        })
    })
    .then(
      function(result){
        details = findDetail
        if(!result){
          details.stat = {}
          details.exists = false
        } else {
          details.stat = result
          details.exists = true
        }
        return details
      }
    )
    .catch(function(err){
      if('File not found' === err.message){
        return {
          hash: hash,
          ext: '',
          path: '',
          stat: {},
          exists: false,
          err: err
        }
      } else {
        logger.log('error', err.stack)
        return false
      }
    })
}


/**
 * Remove a file and its accompanying link
 * @param {string} hash
 * @param {string} ext
 * @return {P}
 */
exports.remove = function(hash,ext){
  //this function is so lame
  return P.try(function(){
    return exports.find(hash,ext)
  })
    .then(function(result){
      if(false === result.exists){
        //not found no need to remove
      } else {
        try {
          fs.unlinkSync(result.path)
        } catch(e){
          //nothing
        }
      }
      if(result.path){
        var _path = result.path
        var _fail = false
        while(!_fail){
          try {
            fs.rmdirSync(_path = path.dirname(_path))
          } catch(e){
            _fail = true
          }
        }
      }
      return true
    })
}
