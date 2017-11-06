'use strict';
var P = require('bluebird')
var infant = require('infant')

var config = require('../config')
var couch = require('../helpers/couchbase')
var logger = require('../helpers/logger')

var cluster
var heartbeat
var prismKey = couch.schema.prism(config.prism.name)

//open couch buckets
var couchPeer = couch.peer()

//make some promises
P.promisifyAll(infant)

if(require.main === module){
  infant.child(
    'stretchfs:' + config.prism.name + ':master',
    function(done){
      logger.log('info', 'Beginning prism startup')
      cluster = infant.cluster(
        './worker',
        {
          enhanced: true,
          count: config.prism.workers.count,
          maxConnections: config.prism.workers.maxConnections
        }
      )
      var env = process.env
      env.StretchFS_HB_TYPE = 'prism'
      env.StretchFS_HB_KEY = config.prism.name
      env.StretchFS_HB_PRISM = ''
      heartbeat = infant.parent('../helpers/heartbeat',{
        respawn: false,
        fork: {
          env: env
        }
      })
      if(!config.prism.ghost){
        couchPeer.getAsync(prismKey)
          .then(
            //if we exist lets mark ourselves available
            function(result){
              var doc = result.value
              doc.name = config.prism.name
              doc.host = config.prism.host || '127.0.0.1'
              doc.port = config.prism.port
              doc.available = true
              doc.active = true
              doc.updatedAt = new Date().toJSON()
              return couchPeer.upsertAsync(prismKey,doc,{cas: result.cas})
            },
            //if we dont exist lets make sure thats why and create ourselves
            function(err){
              if(!err || !err.code || 13 !== err.code) throw err
              //now register ourselves or mark ourselves available
              return couchPeer.upsertAsync(prismKey,{
                name: config.prism.name,
                host: config.prism.host || '127.0.0.1',
                port: config.prism.port,
                writable: true,
                available: true,
                active: true,
                createdAt: new Date().toJSON(),
                updatedAt: new Date().toJSON()
              })
            }
          )
          .then(function(){
            return cluster.startAsync()
          })
          .then(function(){
            return heartbeat.startAsync()
          })
          .then(function(){
            logger.log('info', 'Prism startup complete')
            done()
        })
        .catch(function(err){
          logger.log('error',err.stack)
          logger.log('error', err)
          done(err)
        })
      } else {
        cluster.startAsync()
         .then(function(){
           logger.log('info','Prism startup complete, in ghost mode')
           done()
         })
      }
    },
    function(done){
      logger.log('info','Beginning prism shutdown')
      if(!config.prism.ghost){
        //mark ourselves as down
        couchPeer.getAsync(prismKey)
          .then(function(result){
            var doc = result.value
            doc.available = false
            return couchPeer.upsertAsync(prismKey,doc,{cas: result.cas})
          })
          .then(function(){
            couch.disconnect()
            if(!heartbeat) return
            return heartbeat.stopAsync()
          })
          .then(function(){
            if(!cluster) return
            return cluster.stopAsync()
          })
          .then(function(){
            heartbeat.cp.kill('SIGKILL')
            logger.log('info','Prism shutdown complete')
            done()
          })
          .catch(function(err){
            logger.log('error', err.stack)
            logger.log('error',err)
            done(err)
          })
      } else {
        cluster.stopAsync().then(function(){
          logger.log('info','Prism shutdown complete, in ghost mode')
          done()
        })
      }
    }
  )
}
