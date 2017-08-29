'use strict';
var P = require('bluebird')
var infant = require('infant')

var config = require('../config')
var couchdb = require('../helpers/couchdb')
var logger = require('../helpers/logger')

var cluster
var heartbeat
var prismKey = couchdb.schema.prism(config.prism.name)

//make some promises
P.promisifyAll(infant)

if(require.main === module){
  infant.child(
    'oose:' + config.prism.name + ':master',
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
      heartbeat = infant.parent('../helpers/heartbeat')
      if(!config.prism.ghost){
        couchdb.peer.getAsync(prismKey)
          .then(
            //if we exist lets mark ourselves available
            function(doc){
              doc.name = config.prism.name
              doc.host = config.prism.host
              doc.port = config.prism.port
              doc.available = true
              doc.active = true
              return couchdb.peer.saveAsync(prismKey,doc)
            },
            //if we dont exist lets make sure thats why and create ourselves
            function(err){
              if(404 !== err.headers.status) throw err
              //now register ourselves or mark ourselves available
              return couchdb.peer.saveAsync(prismKey,{
                name: config.prism.name,
                host: config.prism.host,
                port: config.prism.port,
                writable: true,
                available: true,
                active: true,
                createdAt: new Date().toJSON()
              })
            }
          )
          .then(function(){
            return P.all([cluster.startAsync(),heartbeat.startAsync()])
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
        couchdb.peer.getAsync(prismKey)
          .then(function(doc){
            doc.available = false
            return couchdb.peer.saveAsync(prismKey,doc)
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
