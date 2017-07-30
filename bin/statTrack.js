#!/usr/bin/node
'use strict';
var P = require('bluebird')
var debug = require('debug')('statTrack')
var program = require('commander')
var oose = require('oose-sdk')

var UserError = oose.UserError

var config = require('../config')

var stats = require('../helpers/stats')()

//setup cli parsing
program
  .version(config.version)
  .option('-f, --force','Force the operation even on this hash')
  .option('-p, --pretend','Dont actually make and clones just analyze')
  .option('-S, --store <store>','Use file list from this store')
  .option('-v, --verbose','Be verbose and show hash list before processing')
  .parse(process.argv)

P.try(function(){
  console.log('Welcome to the OOSE v' + config.version + ' statTrack!')
  console.log('--------------------')
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
    return stats.fsProc()
  })
  .then(function(result){
    console.log('fs: procfs disk data obtained!')
    debug(result)
    return stats.fsSizes()
  })
  .then(function(result){
    console.log('fs: sizes obtained!')
    debug(result)
    return stats.fsOpenFiles()
  })
  .then(function(result){
    console.log('hashUsage: lsof data obtained!')
    debug(result)
    return stats.ooseCounters()
  })
  .then(function(result){
    console.log('API: Polled local OOSE counters')
    debug(result)
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
