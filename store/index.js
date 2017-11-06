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
var supervisor
var stat

var storeKey = couch.schema.store(config.store.prism,config.store.name)

var couchPeer = couch.peer()

//make some promises
P.promisifyAll(infant)

if(require.main === module){
  infant.child(
    'oose:' + config.store.name + ':master',
    function(done){
      logger.log('info','Beginning store startup')
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
      env.OOSE_HB_TYPE = 'store'
      env.OOSE_HB_KEY = config.store.name
      env.OOSE_HB_PRISM = config.store.prism
      heartbeat = infant.parent('../helpers/heartbeat',{
        respawn: false,
          fork: {
          env: env
        }
      })
      stat = infant.parent('./stat')
      supervisor = infant.parent('./job/supervisor')
      //check if our needed folders exist
      couchPeer.getAsync(storeKey)
        .then(
          //if we exist lets mark ourselves available
          function(result){
            var doc = result.value
            doc.prism = config.store.prism
            doc.name = config.store.name
            doc.host = config.store.host || '127.0.0.1'
            doc.port = config.store.port
            doc.available = true
            doc.active = true
            doc.updatedAt = new Date().toJSON()
            return couchPeer.upsertAsync(storeKey,doc,{cas: result.cas})
          },
          //if we dont exist lets make sure thats why and create ourselves
          function(err){
            if(!err || !err.code || 13 !== err.code) throw err
            //now register ourselves or mark ourselves available
            return couchPeer.upsertAsync(storeKey,{
              prism: config.store.prism,
              name: config.store.name,
              host: config.store.host || '127.0.0.1',
              port: config.store.port,
              writable: true,
              available: true,
              active: true,
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
            return supervisor.startAsync()
          }
        })
        .then(function(){
          if(config.store.stat.enabled){
            return stat.startAsync()
          }
        })
        .then(function(){
          logger.log('info', 'Store startup complete')
          done()
        })
        .catch(function(err){
          logger.log('error', err.stack)
          logger.log('error',err)
          done(err)
        })
    },
    function(done){
      logger.log('info','Beginning store shutdown')
      //mark ourselves as down
      couchPeer.getAsync(storeKey)
        .then(function(result){
          var doc = result.value
          doc.available = false
          return couchPeer.upsertAsync(storeKey,doc,{cas: result.cas})
        })
        .then(function(){
          if(config.store.stat.enabled){
            return stat.stopAsync()
          }
        })
        .then(function(){
          couch.disconnect()
          if(config.job.enabled){
            return supervisor.stopAsync()
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
          logger.log('info','Store shutdown complete')
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
