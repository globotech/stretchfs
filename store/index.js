'use strict';
var P = require('bluebird')
var fs = require('graceful-fs')
var infant = require('infant')
var mkdirp = require('mkdirp-then')
var path = require('path')

var config = require('../config')
var couchdb = require('../helpers/couchdb')
var logger = require('../helpers/logger')

var cluster
var heartbeat
var statspush
var storeKey = couchdb.schema.store(config.store.prism,config.store.name)

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
      heartbeat = infant.parent('../helpers/heartbeat')
      statspush = infant.parent('../helpers/statspush')
      //check if our needed folders exist
      couchdb.peer.getAsync(storeKey)
        .then(
          //if we exist lets mark ourselves available
          function(doc){
            doc.prism = config.store.prism
            doc.name = config.store.name
            doc.host = config.store.host
            doc.port = config.store.port
            doc.available = true
            doc.active = true
            return couchdb.peer.insertAsync(doc,storeKey)
          },
          //if we dont exist lets make sure thats why and create ourselves
          function(err){
            if(!err.headers || 404 !== err.headers.status) throw err
            //now register ourselves or mark ourselves available
            return couchdb.peer.insertAsync({
              prism: config.store.prism,
              name: config.store.name,
              host: config.store.host,
              port: config.store.port,
              writable: true,
              available: true,
              active: true,
              createdAt: new Date().toJSON()
            },storeKey)
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
          //start cluster and heartbeat system
          return P.all([
            cluster.startAsync(),
            statspush.startAsync(),
            heartbeat.startAsync()
          ])
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
      couchdb.peer.getAsync(storeKey)
        .then(function(doc){
          doc.available = false
          return couchdb.peer.insertAsync(doc,storeKey)
        })
        .then(function(){
          if(!cluster) return
          return P.all([
            heartbeat.stopAsync(),
            statspush.stopAsync(),
            cluster.stopAsync()
          ])
        })
        .then(function(){
          heartbeat.cp.kill('SIGKILL')
          statspush.cp.kill('SIGKILL')
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
