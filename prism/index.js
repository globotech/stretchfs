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
var cb = couch.stretchfs()

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
      env.STRETCHFS_HB_TYPE = 'prism'
      env.STRETCHFS_HB_KEY = config.prism.name
      env.STRETCHFS_HB_PRISM = ''
      heartbeat = infant.parent('../helpers/heartbeat',{
        respawn: false,
        fork: {
          env: env
        }
      })
      if(!config.prism.ghost){
        cb.getAsync(prismKey)
          .then(
            //if we exist lets mark ourselves available
            function(result){
              var doc = result.value
              doc.name = config.prism.name
              doc.host = config.prism.host || '127.0.0.1'
              doc.port = config.prism.port
              if(!doc.roles) doc.roles = []
              if(doc.roles.indexOf('active') < 0) doc.roles.push('active')
              if(doc.roles.indexOf('online') < 0) doc.roles.push('online')
              doc.updatedAt = new Date().toJSON()
              return cb.upsertAsync(prismKey,doc,{cas: result.cas})
            },
            //if we dont exist lets make sure thats why and create ourselves
            function(err){
              if(!err || !err.code || 13 !== err.code) throw err
              //now register ourselves or mark ourselves available
              return cb.upsertAsync(prismKey,{
                name: config.prism.name,
                host: config.prism.host || '127.0.0.1',
                port: config.prism.port,
                roles: ['active','online'],
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
        cb.getAsync(prismKey)
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
            return cb.upsertAsync(prismKey,doc,{cas: result.cas})
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
