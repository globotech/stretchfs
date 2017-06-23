#!/usr/bin/node
'use strict';
var P = require('bluebird')
var debug = require('debug')('clonetool')
var program = require('commander')
var oose = require('oose-sdk')
var path = require('path')
var si = require('systeminformation')
var procfs = require('procfs-stats')

var UserError = oose.UserError

var redis = require('../helpers/redis')
var lsof = require('../helpers/lsof')
var logger = require('../helpers/logger')

var config = require('../config')

//setup cli parsing
program
  .version(config.version)
  .option('-f, --force','Force the operation even on this hash')
  .option('-p, --pretend','Dont actually make and clones just analyze')
  .option('-S, --store <store>','Use file list from this store')
  .option('-v, --verbose','Be verbose and show hash list before processing')
  .parse(process.argv)

var storeList = []
// stats Object.keys are storeName with sub-Object.keys as section, then user-defined data
var stats = {}
var statUpdate = function(store,section,data){
  if(!(store in stats)){
    stats[store] = {}
    storeList = (Object.keys(stats)).sort()
  }
  if(!(section in stats[store])){
    stats[store][section] = null
  }
  stats[store][section] = data
}
var procDisk = {}
var procFD   = {}
P.try(function(){
  logger.log('info', 'Welcome to the OOSE v' + config.version + ' statTrack!')
  logger.log('info','--------------------')
  if(!procfs.works) { throw new UserError('procfs does not exist?') }
  var ndt = require('/etc/ndt/ndt.json')
  return ndt.apps
})
.then(function(result){
  var sL = Object.keys(result)
  var resultCount = +(sL.length)
  logger.log('info', 'Loaded '+resultCount+' apps from NDT database')
  var loadConfigs = []
  for(var x=0;x<resultCount;x++){
    loadConfigs.push(new Promise(function(resolve){resolve(require(result[sL[x]].env.OOSE_CONFIG))}))
  }
  return P.all(loadConfigs)
})
.then(function(result){
  logger.log('info','Loaded instance config files')
  for(var x=0;x<result.length;x++){
    var r = result[x]
    if(r.store && r.store.name) statUpdate(r.store.name,'cfg',r)
  }
  if(!storeList.length) throw new UserError('No stores configured here?')
  return new Promise(function(resolve){procfs.disk(function(a,b,c){resolve(b)})})
})
.then(function(result){
  logger.log('info','FS: procfs disk data obtained!')
  for(var x=0;x<result.length;x++){
    var r = result[x]
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
          ms_weighted_io: +r.ms_weighted_io,
      }
    }
  }
  return si.fsSize()
})
.then(function(result){
  logger.log('info', 'FS: sizes obtained!')
  var statByMount = {}
  for(var x=0;x<result.length;x++){
    statByMount[result[x].mount] = result[x]
  }
  var sortReversed = function(a,b){if(a>b)return -1;if(a<b)return 1;return 0}
  var mounts = Object.keys(statByMount).sort(sortReversed)
  var mountCount = +(mounts.length)
  var storeCount = +(storeList.length)
  for(var x=0;x<mountCount;x++){
    var m = mounts[x]
    for(var y=0;y<storeCount;y++){
      var s = storeList[y]
      var pathHit = path.dirname(stats[s].cfg.root).match('^'+m)
      if(pathHit && (!stats[s].fs)){
        var r = statByMount[m]
        var devName = r.fs.match(/^\/dev\/(.+)$/)
        var data = procDisk[devName[1]]
        data.dev = devName[1]
        data.mount = m
        data.size = r.size
        data.used = r.used
        statUpdate(s,'fs',data)
      }
    }
  }
  var lsofTargets = []
  for(var x=0;x<storeCount;x++){
    var s = storeList[x]
    lsofTargets.push(lsof.exec('-anc nginx '+stats[s].fs.mount))
  }
  return P.all(lsofTargets)
})
.then(function(result){
  logger.log('info', 'FS: lsof data obtained!')
  var storeCount = +(storeList.length)
  for(var x=0;x<storeCount;x++){
    var s = storeList[x]
    var r = result.shift()
    var contentDir = stats[s].cfg.root+'/content/'
    var hashUsage = {}
    for(var y=0;y<r.length;y++){
      var pathHit = r[y].name.match('^'+contentDir)
      if(pathHit){
        var hash = pathHit.input.replace(pathHit[0],'').replace(/\//g,'').replace(/\..*$/,'')
        hashUsage[hash] = (hashUsage[hash])?hashUsage[hash]+1:1
      }
    }
    statUpdate(s,'hashUsage',hashUsage)
  }
  return null
})
.then(function(){
  logger.log('info', 'Operations complete, bye!')
  logger.log('info', stats)
  //jam shit in redis here
  process.exit()
})
.catch(UserError,function(err){
  logger.log('error', 'Oh no! An error has occurred :(')
  logger.log('error', err.message)
  logger.log('error', stats)
  process.exit()
})
