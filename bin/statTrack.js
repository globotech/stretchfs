#!/usr/bin/node
'use strict';
var P = require('bluebird')
var debug = require('debug')('statTrack')
var program = require('commander')
var oose = require('oose-sdk')
var path = require('path')
var si = require('systeminformation')
var procfs = require('procfs-stats')

var UserError = oose.UserError

var config = require('../config')

var stats = require('../helpers/stats')()
var lsof = require('../helpers/lsof')
var redisHelper = require('../helpers/redis')
var redis = {
  'local': redisHelper(config.redis),
  'remote': redisHelper(stats.config.redis)
}

//setup cli parsing
program
  .version(config.version)
  .option('-f, --force','Force the operation even on this hash')
  .option('-p, --pretend','Dont actually make and clones just analyze')
  .option('-S, --store <store>','Use file list from this store')
  .option('-v, --verbose','Be verbose and show hash list before processing')
  .parse(process.argv)

var procDisk = {}
var counterKeys = []
P.try(function(){
  console.log('Welcome to the OOSE v' + config.version + ' statTrack!')
  console.log('--------------------')
  if(!procfs.works) { throw new UserError('procfs does not exist?') }
  var ndt = require('/etc/ndt/ndt.json')
  return ndt.apps
})
  .then(function(result){
    var sL = Object.keys(result)
    var resultCount = +(sL.length)
    console.log('Loaded '+resultCount+' apps from NDT database')
    debug(sL)
    var _loadAppCfg = function(sLx){
      return new Promise(function(r){
        r(require(result[sLx].env.OOSE_CONFIG))
      })
    }
    var loadConfigs = []
    sL.forEach(function(sLx){
      loadConfigs.push(_loadAppCfg(sLx))
    })
    return P.all(loadConfigs)
  })
  .then(function(result){
    console.log('Loaded instance config files')
    debug(result)
    result.forEach(function(r){
      if(r.store && r.store.name) stats.set(r.store.name,'cfg',r)
    })
    if(!stats.refCount)
      throw new UserError('No stores configured here?')
    return new Promise(function(r){
      procfs.disk(function(a,b){r(b)})
    })
  })
  .then(function(result){
    console.log('fs: procfs disk data obtained!')
    debug(result)
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
    return si.fsSize()
  })
  .then(function(result){
    console.log('fs: sizes obtained!')
    var statByMount = {}
    result.forEach(function(r){
      statByMount[r.mount] = r
    })
    var sortReversed = function(a,b){if(a>b)return -1;if(a<b)return 1;return 0}
    var mounts = Object.keys(statByMount).sort(sortReversed)
    mounts.forEach(function(m){
      stats.refList.forEach(function(s){
        var pathHit = path.dirname(stats.get(s,'cfg').root).match('^'+m)
        if(pathHit && (!stats.get(s,'fs'))){
          var r = statByMount[m]
          var devName = r.fs.match(/^\/dev\/(.+)$/)
          var data = procDisk[devName[1]]
          data.dev = devName[1]
          data.mount = m
          data.size = r.size
          data.used = r.used
          stats.set(s,'fs',data)
        }
      })
    })
    var lsofTargets = []
    stats.refList.forEach(function(ref){
      debug('Executing lsof -anc nginx '+stats.get(ref,'fs').mount)
      lsofTargets.push(
        lsof.exec('-anc nginx '+stats.get(ref,'fs').mount)
      )
    })
    return P.all(lsofTargets)
  })
  .then(function(result){
    console.log('hashUsage: lsof data obtained!')
    debug(result)
    var i = 0
    stats.refList.forEach(function(s){
      var contentDir = stats.get(s,'cfg').root+'/content/'
      var hashUsage = {}
      result[i++].forEach(function(r){
        var pathHit = r.name.match('^'+contentDir)
        if(pathHit){
          var hash = pathHit.input
            .replace(pathHit[0],'')
            .replace(/\//g,'')
            .replace(/\..*$/,'')
          hashUsage[hash] = (hashUsage[hash])?hashUsage[hash]+1:1
        }
      })
      stats.set(s,'hashUsage',hashUsage)
    })
    return redis.local.keysAsync('oose:counter:*')
  })
  .then(function(result){
    debug(result)
    var batch = []
    result.forEach(function(i){
      counterKeys.push(i)
      batch.push(redis.local.getAsync(i))
    })
    return P.all(batch)
  })
  .then(function(result){
    console.log('API: Polled local OOSE counters')
    debug(counterKeys,result)
    var ooseData = {}
    var i = 0
    counterKeys.sort().forEach(function(k){
      ooseData[k]=result[i++]
    })
    stats.set('API','ooseData',ooseData)
    //jam shit in redis here
    return stats.push()
  })
  .then(function(result){
    debug(result)
    console.log('Redis content sent to remote')
    return stats.pull()
  })
  .then(function(result){
    console.log('Redis content read back from remote:')
    console.log(result)
    console.log('Operations complete, bye!')
    process.exit()
  })
  .catch(UserError,function(err){
    console.error('Oh no! An error has occurred :(')
    console.error(err.message)
    debug.log(stats)
    process.exit()
  })
