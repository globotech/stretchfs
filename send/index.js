'use strict';
var P = require('bluebird')
var infant = require('infant')

var config = require('../config')
var couch = require('../helpers/couchbase')
var logger = require('../helpers/logger')

var cluster
var sendKey = couch.schema.send(
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
      //check if our needed folders exist
      couch.peer.getAsync(sendKey)
        .then(
          //if we exist lets mark ourselves available
          function(result){
            var doc = result.value
            doc.prism = config.send.prism
            doc.store = config.send.store
            doc.name = config.send.name
            doc.host = config.send.host
            doc.port = config.send.port
            doc.available = true
            doc.active = true
            return couch.peer.upsertAsync(sendKey,doc,{cas: result.cas})
          },
          //if we dont exist lets make sure thats why and create ourselves
          function(err){
            if(!err || !err.code || 13 !== err.code) throw err
            //now register ourselves or mark ourselves available
            return couch.peer.upsertAsync(sendKey,{
              prism: config.send.prism,
              store: config.send.store,
              name: config.send.name,
              host: config.send.host,
              port: config.send.port,
              available: true,
              active: true,
              createdAt: new Date().toJSON()
            })
          }
        )
        .then(function(){
          return cluster.startAsync()
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
      couch.peer.getAsync(sendKey)
        .then(function(result){
          var doc = result.value
          doc.available = false
          return couch.peer.upsertAsync(sendKey,doc,{cas: result.cas})
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
