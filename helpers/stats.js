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


/**
 * Export client constructor
 * @param {object} options
 * @return {function} constructor
 */
module.exports = function(options){
  if(!procfs.works) { throw new UserError('procfs does not exist?') }
  var s = {}
  s.config = ('object' === typeof options) ? options : config.stats
  /*jshint bitwise: false*/
  s.timeStamp = ((+new Date())/1000) | 0
  // stats Object.keys are ref (storeName, prismName, etc)
  //  with sub-Object.keys as section, then user-defined data
  s.stats = {}
  s.refList = []
  s.refCount = 0

  s.keyGen = function(ref,section){
    var rv = [ref,section,s.timeStamp].join(':')
    debug('keyGen(',ref,',',section,') =',rv)
    return rv
  }

  s.set = function(ref,section,data){
    debug('set(',ref,',',section,',',data,')')
    if(!(ref in s.stats)){
      s.stats[ref] = {}
      s.refList = (Object.keys(s.stats)).sort()
      s.refCount = +(s.refList.length)
    }
    if(!(section in s.stats[ref])){
      s.stats[ref][section] = null
    }
    s.stats[ref][section] = data
  }

  s.get = function(ref,section){
    var rv = false
    if((ref in s.stats) && (section in s.stats[ref])){
      rv = s.stats[ref][section]
    }
    debug('get(',ref,',',section,') =',rv)
    return rv
  }

  var redisOut = {}
  var redisDataH = function(redisKey,data,key){
    redisOut[redisKey].push(key,data[key])
  }
  var redisDataZ = function(redisKey,data,key){
    // ZADD takes things 'backwards', below uses val,key
    redisOut[redisKey].push(data[key],key)
  }
  var prep = function(ref,section,redisSection,pusher){
    //convert hash to redis-acceptable array
    if('string' !== typeof redisSection) redisSection = section
    var k = s.keyGen(ref,redisSection)
    redisOut[k] = []
    var d = s.get(ref,section)
    Object.keys(d).sort().forEach(function(l){
      pusher(k,d,l)
    })
  }
  var prepHMSET = function(ref,section,redisSection){
    //stack the args for HMSET (convert hash to array)
    prep(ref,section,redisSection,redisDataH)
  }
  var prepZADD = function(ref,section,redisSection){
    //stack the args for ZADD (convert hash to array)
    prep(ref,section,redisSection,redisDataZ)
  }
  var redisPushPromises = function(){
    debug('redisPushPromises:redisOut',redisOut)
    //build batch of redis promises
    var batch = []
    Object.keys(redisOut).sort().forEach(function(fKey){
      var p = fKey.split(':')
      switch(p[1]){
      case 'fs':
      case 'oD':
        batch.push(redis.remote.hmsetAsync(fKey,redisOut[fKey]))
        batch.push(redis.remote.expireAsync(fKey,86400))
        break
      case 'hU':
        batch.push(redis.remote.zaddAsync(fKey,redisOut[fKey]))
        batch.push(redis.remote.expireAsync(fKey,86400))
        break
      default:
        console.error(
          'redisPushPromises: redisOut contained unhandled section:',fKey,p
        )
      }
    })
    return batch
  }

  s.push = function(refs){
    if(!refs) refs = s.refList
    return P.try(function(){
      refs.forEach(function(ref){
        if('API' === ref){ //API Global stat
          //OOSE section
          prepHMSET(ref,'ooseData','oD')
        } else { //Store Specific stat
          //FS section
          prepHMSET(ref,'fs')
          //HASH section
          prepZADD(ref,'hashUsage','hU')
        }
      })
      //build and run the actual batch of redis promises
      return P.all(redisPushPromises())
    })
  }

  var redisIn = {}
  var pullKeys = []
  var pullPromise = function(redisKey){
    var rv = false
    var p = redisKey.split(':')
    switch(p[1]){
    case 'fs':
    case 'oD':
      rv = redis.remote.hscanAsync(redisKey,0)
      pullKeys.push(redisKey)
      break
    case 'hU':
      rv = redis.remote.zscanAsync(redisKey,0)
      pullKeys.push(redisKey)
      break
    default:
      console.error(
        'pullPromise: redisKey contained unhandled section:',redisKey,p
      )
    }
    return rv
  }
  var redisPullPromises = function(refs){
    if(!refs) refs = s.refList
    debug('redisPullPromises(',refs,')')
    //build batch of redis promises
    var batch = []
    refs.forEach(function(redisKey){
      batch.push(pullPromise(redisKey))
    })
    return batch
  }

  s.pull = function(refs){
    var pullChain = {}
    if(!refs){
      pullChain = P.try(function(){
          return redis.remote.keysAsync(s.keyGen('*','*'))
        })
          .then(function(result){
            debug('pullChain:',result)
            refs = result
            return P.all(redisPullPromises(refs))
          })
    } else pullChain = P.all(redisPullPromises(refs))
    return pullChain.then(function(result){
        //result = result[0]
        debug('pull(',refs,') =',result)
        var i = 0
        pullKeys.forEach(function(redisKey){
          if(!redisIn[redisKey]) redisIn[redisKey] = {}
          var subKey = ''
          var sync = false
          result[i++][1].forEach(function(j){
            switch(sync){
            case false:
              subKey = j
              break
            case true:
              redisIn[redisKey][subKey] = j
              break
            }
            sync = !sync
          })
        })
        return redisIn
      })
  }

  var procDisk = {}
  P.promisifyAll(procfs)
  s.fsProc = function(){
    return procfs.diskAsync().then(function(result){
      result.forEach(function(r){
        if(r.device){
          procDisk[r.device] = {
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
      return procDisk
    })
  }

  s.fsSizes = function(){
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
        s.refList.forEach(function(st){
          var pathHit = path.dirname(s.get(st,'cfg').root).match('^' + m)
          if(pathHit && (!s.get(st,'fs'))){
            var r = statByMount[m]
            var devName = r.fs.match(/^\/dev\/(.+)$/)
            var data = procDisk[devName[1]]
            data.dev = devName[1]
            data.mount = m
            data.size = r.size
            data.used = r.used
            s.set(st,'fs',data)
          }
        })
      })
    })
  }

  s.fsOpenFiles = function(){
    return P.try(function(){
      var lsofTargets = []
      s.refList.forEach(function(ref){
        debug('Executing lsof -anc nginx ' + s.get(ref,'fs').mount)
        lsofTargets.push(
          lsof.exec('-anc nginx ' + s.get(ref,'fs').mount)
        )
      })
      return P.all(lsofTargets)
    }).then(function(result){
      var i = 0
      s.refList.forEach(function(st){
        var contentDir = s.get(st,'cfg').root + '/content/'
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
        s.set(st,'hashUsage',hashUsage)
      })
    })
  }

  var counterKeys = []
  s.ooseCounters = function(){
    return P.try(function(){
      return redis.local.keysAsync('oose:counter:*')
    }).then(function(result){
      debug(result)
      var batch = []
      result.forEach(function(i){
        counterKeys.push(i)
        batch.push(redis.local.getAsync(i))
      })
      return P.all(batch)
    }).then(function(result){
      var ooseData = {}
      var i = 0
      counterKeys.forEach(function(k){
        ooseData[k]=result[i++]
      })
      s.set('API','ooseData',ooseData)
    })
  }

  return s
}
