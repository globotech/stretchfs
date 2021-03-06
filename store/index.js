'use strict';
var P = require('bluebird')
var fs = require('graceful-fs')
var infant = require('infant')
var mkdirp = require('mkdirp-then')
var path = require('path')

var config = require('../config')
var couch = require('../helpers/couchbase')
var logger = require('../helpers/logger')

var cluster
var heartbeat
var balance
var jobSupervisor
var stat

var storeKey = couch.schema.store(config.store.name)

//open some buckets
var cb = couch.stretchfs()

//make some promises
P.promisifyAll(infant)

if(require.main === module){
  infant.child(
    'stretchfs:' + config.store.name + ':master',
    function(done){
      //bootstrap to start
      cluster = infant.cluster(
        './worker',
        {
          enhanced: true,
          count: config.store.workers.count,
          maxConnections: config.store.workers.maxConnections
        }
      )
      var env = process.env
      env.STRETCHFS_HB_TYPE = 'store'
      env.STRETCHFS_HB_KEY = config.store.name
      env.STRETCHFS_HB_PRISM = config.store.prism
      heartbeat = infant.parent('../helpers/heartbeat',{
        respawn: false,
          fork: {
          env: env
        }
      })
      stat = infant.parent('./stat')
      jobSupervisor = infant.parent('./job/supervisor')
      balance = infant.parent('./balance')
      //check if our needed folders exist
      cb.getAsync(storeKey)
        .then(
          //if we exist lets mark ourselves available
          function(result){
            var doc = result.value
            doc.prism = config.store.prism
            doc.name = config.store.name
            doc.host = config.store.host || '127.0.0.1'
            doc.port = config.store.port
            doc.httpPort = config.store.httpPort
            if(doc.roles.indexOf('active') < 0) doc.roles.push('active')
            if(doc.roles.indexOf('online') < 0) doc.roles.push('online')
            doc.updatedAt = new Date().toJSON()
            return cb.upsertAsync(storeKey,doc,{cas: result.cas})
          },
          //if we dont exist lets make sure thats why and create ourselves
          function(err){
            if(!err || !err.code || 13 !== err.code) throw err
            //now register ourselves or mark ourselves available
            return cb.upsertAsync(storeKey,{
              prism: config.store.prism,
              name: config.store.name,
              host: config.store.host || '127.0.0.1',
              port: config.store.port,
              httpPort: config.store.httpPort,
              usage: {free: 1000000, total: 100000000},
              slot: {count: 0, list: []},
              roles: config.store.defaultRoles,
              createdAt: new Date().toJSON(),
              updatedAt: new Date().toJSON()
            })
          }
        )
        .then(function(){
          var promises = []
          var rootFolder = path.resolve(config.root)
          var contentFolder = path.resolve(rootFolder + '/content')
          var purchaseFolder = path.resolve(rootFolder + '/purchased')
          if(!fs.existsSync(contentFolder))
            promises.push(mkdirp(contentFolder))
          if(!fs.existsSync(purchaseFolder))
            promises.push(mkdirp(purchaseFolder))
          return P.all(promises)
        })
        .then(function(){
          //start cluster
          return cluster.startAsync()
        })
        .then(function(){
          return heartbeat.startAsync()
        })
        .then(function(){
          if(config.job.enabled){
            return jobSupervisor.startAsync()
          }
        })
        .then(function(){
          if(config.inventory.balance.enabled){
            return balance.startAsync()
          }
        })
        .then(function(){
          if(config.store.stat.enabled){
            return stat.startAsync()
          }
        })
        .then(function(){
          done()
        })
        .catch(function(err){
          logger.log('error', err.stack)
          logger.log('error',err)
          done(err)
        })
    },
    function(done){
      //mark ourselves as down
      cb.getAsync(storeKey)
        .then(function(result){
          var doc = result.value
          var activeIndex = doc.roles.indexOf('active')
          if(activeIndex >= 0){
            doc.roles.splice(activeIndex,1)
          }
          var onlineIndex = doc.roles.indexOf('online')
          if(onlineIndex >= 0){
            doc.roles.splice(onlineIndex,1)
          }
          return cb.upsertAsync(storeKey,doc,{cas: result.cas})
        })
        .then(function(){
          if(config.store.stat.enabled){
            return stat.stopAsync()
          }
        })
        .then(function(){
          if(config.inventory.balance.enabled){
            return balance.stopAsync()
          }
        })
        .then(function(){
          couch.disconnect()
          if(config.job.enabled){
            return jobSupervisor.stopAsync()
          }
        })
        .then(function(){
          if(!heartbeat) return
          return heartbeat.stopAsync()
        })
        .then(function(){
          if(!cluster) return
          return cluster.stopAsync()
        })
        .then(function(){
          heartbeat.cp.kill('SIGKILL')
          done()
        })
        .catch(function(err){
          logger.log('error',err.stack)
          logger.log('error', err)
          done(err)
        })
    }
  )
}
