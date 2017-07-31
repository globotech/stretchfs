'use strict';
var P = require('bluebird')
var debug = require('debug')('helper:stat')
var oose = require('oose-sdk')
var path = require('path')
var procfs = require('procfs-stats')
var si = require('systeminformation')

var UserError = oose.UserError

var config = require('../config')

var lsof = require('../helpers/lsof')
var redisHelper = require('../helpers/redis')
var redis = {
  'local': redisHelper(config.redis),
  'remote': redisHelper(config.stats.redis)
}

var _procDisk = {}



/**
 * @constructor
 * @param {object} options
 * @return {Stats}
 */
var Stats = function(options){
  var that = this
  if(!procfs.works){
    throw new UserError('procfs does not exist?')
  }
  P.promisifyAll(procfs)
  that.config = ('object' === typeof options) ? options : config.stats
  /*jshint bitwise: false*/
  that.timeStamp = ((+new Date()) / 1000) | 0
  // stats Object.keys are ref (storeName, prismName, etc)
  //  with sub-Object.keys as section, then user-defined data
  that.stats = {}
  that.refList = []
  that.refCount = 0

  return that
}


/**
 * Generate key by ref+section
 * @param {string} ref
 * @param {string} section
 * @return {string} key
 */
Stats.prototype.keyGen = function(ref,section){
  var that = this
  var key = [ref,section,that.timeStamp].join(':')
  debug('keyGen(',ref,',',section,') =',key)
  return key
}


/**
 * Set stat state data by ref+section
 * @param {string} ref
 * @param {string} section
 * @param {string} data
 */
Stats.prototype.set = function(ref,section,data){
  var that = this
  debug('set(',ref,',',section,',',data,')')
  if(!(ref in that.stats)){
    that.stats[ref] = {}
    that.refList = (Object.keys(that.stats)).sort()
    that.refCount = +(that.refList.length)
  }
  if(!(section in that.stats[ref])){
    that.stats[ref][section] = null
  }
  that.stats[ref][section] = data
}


/**
 * Get stat state data by ref+section
 * @param {string} ref
 * @param {string} section
 * @return {string} data
 */
Stats.prototype.get = function(ref,section){
  var that = this
  var data = false
  if((ref in that.stats) && (section in that.stats[ref])){
    data = that.stats[ref][section]
  }
  debug('get(',ref,',',section,') =',data)
  return data
}


/**
 * Store stats to redis (generally on a prism)
 * @param {Object} refs
 * @return {P}
 */
Stats.prototype.shove = function(refs){
  var that = this
  var _redisOut = {}
  var _redisDataH = function(redisKey,data,key){
    _redisOut[redisKey].push(key,data[key])
  }
  var _redisDataZ = function(redisKey,data,key){
    // ZADD takes things 'backwards', below uses val,key
    _redisOut[redisKey].push(data[key],key)
  }
  var _prep = function(ref,section,redisSection,pusher){
    //convert hash to redis-acceptable array
    if('string' !== typeof redisSection) redisSection = section
    var k = that.keyGen(ref,redisSection)
    _redisOut[k] = []
    var d = that.get(ref,section)
    Object.keys(d).sort().forEach(function(l){
      pusher(k,d,l)
    })
  }
  var _prepHMSET = function(ref,section,redisSection){
    //stack the args for HMSET (convert hash to array)
    _prep(ref,section,redisSection,_redisDataH)
  }
  var _prepZADD = function(ref,section,redisSection){
    //stack the args for ZADD (convert hash to array)
    _prep(ref,section,redisSection,_redisDataZ)
  }
  var _redisShovePromises = function(){
    debug('_redisShovePromises:_redisOut',_redisOut)
    //build batch of redis promises
    var batch = []
    Object.keys(_redisOut).sort().forEach(function(fKey){
      var p = fKey.split(':')
      switch(p[1]){
      case 'fs':
      case 'oD':
        batch.push(redis.remote.hmsetAsync(fKey,_redisOut[fKey]))
        batch.push(redis.remote.expireAsync(fKey,86400))
        break
      case 'hU':
        batch.push(redis.remote.zaddAsync(fKey,_redisOut[fKey]))
        batch.push(redis.remote.expireAsync(fKey,86400))
        break
      default:
        console.error(
          '_redisShovePromises: _redisOut contained unhandled section:',fKey,p
        )
      }
    })
    return batch
  }

  if(!refs) refs = that.refList
  return P.try(function(){
    refs.forEach(function(ref){
      if('API' === ref){ //API Global stat
        //OOSE section
        _prepHMSET(ref,'ooseData','oD')
      } else { //Store Specific stat
        //FS section
        _prepHMSET(ref,'fs')
        //HASH section
        _prepZADD(ref,'hashUsage','hU')
      }
    })
    //build and run the actual batch of redis promises
    return P.all(_redisShovePromises())
  })
}


/**
 * Retrieve stats from redis (generally on a prism)
 * @param {Object} refs
 * @return {P}
 */
Stats.prototype.yank = function(refs){
  var that = this
  var _redisIn = {}
  var _yankKeys = []
  var _yankPromise = function(redisKey){
    var rv = false
    var p = redisKey.split(':')
    switch(p[1]){
    case 'fs':
    case 'oD':
      rv = redis.remote.hscanAsync(redisKey,0)
      _yankKeys.push(redisKey)
      break
    case 'hU':
      rv = redis.remote.zscanAsync(redisKey,0)
      _yankKeys.push(redisKey)
      break
    default:
      console.error(
        '_yankPromise: redisKey contained unhandled section:',redisKey,p
      )
    }
    return rv
  }
  var _redisYankPromises = function(refs){
    if(!refs) refs = that.refList
    debug('_redisYankPromises(',refs,')')
    //build batch of redis promises
    var batch = []
    refs.forEach(function(redisKey){
      batch.push(_yankPromise(redisKey))
    })
    return batch
  }
  var _yankChain = {}
  if(!refs){
    _yankChain = P.try(function(){
        return redis.remote.keysAsync(that.keyGen('*','*'))
      })
        .then(function(result){
          debug('_yankChain:',result)
          refs = result
          return P.all(_redisYankPromises(refs))
        })
  } else _yankChain = P.all(_redisYankPromises(refs))
  return _yankChain.then(function(result){
      //result = result[0]
      debug('yank(',refs,') =',result)
      var i = 0
      _yankKeys.forEach(function(redisKey){
        if(!_redisIn[redisKey]) _redisIn[redisKey] = {}
        var subKey = ''
        var sync = false
        result[i++][1].forEach(function(j){
          switch(sync){
          case false:
            subKey = j
            break
          case true:
            _redisIn[redisKey][subKey] = j
            break
          }
          sync = !sync
        })
      })
      return _redisIn
    })
}


/**
 * Poll /proc for kernel filesystem stats, fill/generate _procDisk
 * @return {P}
 */
Stats.prototype.fsProc = function(){
  return procfs.diskAsync().then(function(result){
    result.forEach(function(r){
      if(r.device){
        _procDisk[r.device] = {
          reads_completed: +r.reads_completed,
          reads_merged: +r.reads_merged,
          sectors_read: +r.sectors_read,
          ms_reading: +r.ms_reading,
          writes_completed: +r.writes_completed,
          writes_merged: +r.writes_merged,
          sectors_written: +r.sectors_written,
          ms_writing: +r.ms_writing,
          ios_pending: +r.ios_pending,
          ms_io: +r.ms_io,
          ms_weighted_io: +r.ms_weighted_io
        }
      }
    })
    return _procDisk
  })
}


/**
 * Poll active mounts for sizes and augment _procDisk
 * (entry must already exist, call fsProc first)
 * @return {P}
 */
Stats.prototype.fsSizes = function(){
  var that = this
  return P.try(function(){
    return si.fsSize()
  }).then(function(result){
    var statByMount = {}
    result.forEach(function(r){
      statByMount[r.mount] = r
    })
    var _sortR = function(a,b){
      if(a > b)return -1;
      if(a < b)return 1;
      return 0
    }
    var mounts = Object.keys(statByMount).sort(_sortR)
    mounts.forEach(function(m){
      that.refList.forEach(function(st){
        var pathHit = path.dirname(that.get(st,'cfg').root).match('^' + m)
        if(pathHit && (!that.get(st,'fs'))){
          var r = statByMount[m]
          var devName = r.fs.match(/^\/dev\/(.+)$/)
          var data = _procDisk[devName[1]]
          data.dev = devName[1]
          data.mount = m
          data.size = r.size
          data.used = r.used
          that.set(st,'fs',data)
        }
      })
    })
  })
}


/**
 * Poll currently open files in nginx processes
 * @return {P}
 */
Stats.prototype.fsOpenFiles = function(){
  var that = this
  return P.try(function(){
    var lsofTargets = []
    that.refList.forEach(function(ref){
      debug('Executing lsof -anc nginx ' + that.get(ref,'fs').mount)
      lsofTargets.push(
        lsof.exec('-anc nginx ' + that.get(ref,'fs').mount)
      )
    })
    return P.all(lsofTargets)
  }).then(function(result){
    var i = 0
    that.refList.forEach(function(st){
      var contentDir = that.get(st,'cfg').root + '/content/'
      var hashUsage = {}
      result[i++].forEach(function(r){
        var pathHit = r.name.match('^' + contentDir)
        if(pathHit){
          var hash = pathHit.input
            .replace(pathHit[0],'')
            .replace(/\//g,'')
            .replace(/\..*$/,'')
          hashUsage[hash] = (hashUsage[hash]) ? hashUsage[hash] + 1 : 1
        }
      })
      that.set(st,'hashUsage',hashUsage)
    })
  })
}


/**
 * Poll internal OOSE counters
 * @return {P}
 */
Stats.prototype.ooseCounters = function(){
  var that = this
  var _counterKeys = []
  return P.try(function(){
    return redis.local.keysAsync('oose:counter:*')
  }).then(function(result){
    debug(result)
    var batch = []
    result.forEach(function(i){
      _counterKeys.push(i)
      batch.push(redis.local.getAsync(i))
    })
    return P.all(batch)
  }).then(function(result){
    var ooseData = {}
    var i = 0
    _counterKeys.forEach(function(k){
      ooseData[k]=result[i++]
    })
    that.set('API','ooseData',ooseData)
  })
}


/**
 * Export class
 * @param {object} options
 * @return {function} constructor
 */
module.exports = Stats
