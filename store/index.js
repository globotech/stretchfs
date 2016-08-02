'use strict';
var P = require('bluebird')
var fs = require('graceful-fs')
var infant = require('infant')
var mkdirp = require('mkdirp-then')
var path = require('path')

var config = require('../config')
var cradle = require('../helpers/couchdb')

var cluster
var heartbeat
var storeKey = cradle.schema.store(config.store.prism,config.store.name)

//make some promises
P.promisifyAll(infant)

if(require.main === module){
  infant.child(
    'oose:' + config.store.name + ':master',
    function(done){
      console.log('Beginning store startup')
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
      //check if our needed folders exist
      cradle.peer.getAsync(storeKey)
        .then(
          //if we exist lets mark ourselves available
          function(doc){
            doc.prism = config.store.prism
            doc.name = config.store.name
            doc.host = config.store.host
            doc.port = config.store.port
            doc.available = true
            doc.active = true
            return cradle.peer.saveAsync(storeKey,doc)
          },
          //if we dont exist lets make sure thats why and create ourselves
          function(err){
            if(!err.headers || 404 !== err.headers.status) throw err
            //now register ourselves or mark ourselves available
            return cradle.peer.saveAsync(storeKey,{
              prism: config.store.prism,
              name: config.store.name,
              host: config.store.host,
              port: config.store.port,
              writable: true,
              available: true,
              active: true,
              createdAt: new Date().toJSON()
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
          //start cluster and heartbeat system
          return P.all([
            cluster.startAsync(),
            heartbeat.startAsync()
          ])
        })
        .then(function(){
          console.log('Store startup complete')
          done()
        })
        .catch(function(err){
          console.log(err.stack)
          console.log(err)
          done(err)
        })
    },
    function(done){
      console.log('Beginning store shutdown')
      //mark ourselves as down
      cradle.peer.getAsync(storeKey)
        .then(function(doc){
          doc.available = false
          return cradle.peer.saveAsync(storeKey,doc)
        })
        .then(function(){
          if(!cluster) return
          return P.all([
            cluster.stopAsync(),
            heartbeat.stopAsync()
          ])
        })
        .then(function(){
          heartbeat.cp.kill('SIGKILL')
          console.log('Store shutdown complete')
          done()
        })
        .catch(function(err){
          console.log(err.stack)
          console.log(err)
          done(err)
        })
    }
  )
}
