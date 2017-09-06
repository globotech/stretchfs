'use strict';
var P = require('bluebird')
var infant = require('infant')

var config = require('../config')
var couchdb = require('../helpers/couchdb')
var logger = require('../helpers/logger')

var cluster
var heartbeat
var sendKey = couchdb.schema.send(
  config.send.prism,
  config.send.store,
  config.send.name
)

//make some promises
P.promisifyAll(infant)

if(require.main === module){
  infant.child(
    'oose:' + config.send.name + ':master',
    function(done){
      logger.log('info','Beginning send startup')
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
      couchdb.peer.getAsync(sendKey)
        .then(
          //if we exist lets mark ourselves available
          function(doc){
            doc.prism = config.send.prism
            doc.store = config.send.store
            doc.name = config.send.name
            doc.host = config.send.host
            doc.port = config.send.port
            doc.available = true
            doc.active = true
            return couchdb.peer.insertAsync(doc,sendKey)
          },
          //if we dont exist lets make sure thats why and create ourselves
          function(err){
            if(!err.statusCode || 404 !== err.statusCode) throw err
            //now register ourselves or mark ourselves available
            return couchdb.peer.insertAsync({
              prism: config.send.prism,
              store: config.send.store,
              name: config.send.name,
              host: config.send.host,
              port: config.send.port,
              available: true,
              active: true,
              createdAt: new Date().toJSON()
            },sendKey)
          }
        )
        .then(function(){
          return cluster.startAsync()
        })
        .then(function(){
          return heartbeat.startAsync()
        })
        .then(function(){
          logger.log('info', 'Send startup complete')
          done()
        })
        .catch(function(err){
          logger.log('error', err.stack)
          logger.log('error',err)
          done(err)
        })
    },
    function(done){
      logger.log('info','Beginning send shutdown')
      //mark ourselves as down
      couchdb.peer.getAsync(sendKey)
        .then(function(doc){
          doc.available = false
          return couchdb.peer.insertAsync(doc,sendKey)
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
          logger.log('info','Send shutdown complete')
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
