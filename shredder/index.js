'use strict';
var P = require('bluebird')
var infant = require('infant')

var cluster
var config = require('../config')
var nano = require('../helpers/couchdb')
var workerKey = nano.schema.worker(config.worker.name)
var supervisor

//make some promises
P.promisifyAll(infant)

if(require.main === module){
  infant.child(
    'shredder:' + config.worker.name + ':master',
    function(done){
      P.try(function(){
        //setup the system
        supervisor = infant.parent('./supervisor')
        cluster = infant.cluster('./worker',{
          enhanced: true,
          count: config.worker.workers.count,
          maxConnections: config.worker.workers.maxConnections
        })
        //if we exist lets mark ourselves available
        nano.shredder.getAsync(workerKey)
          .then(function(doc){
            doc.name = config.worker.name
            doc.host = config.worker.host
            doc.port = config.worker.port
            doc.available = true
            doc.active = true
            doc.lastStartedAt = new Date().toJSON()
            return nano.shredder.insertAsync(doc,workerKey)
          },//if we dont exist lets make sure thats why and create ourselves
          function(err){
            if(404 !== err.statusCode) throw err
            //now register ourselves or mark ourselves available
            return nano.shredder.insertAsync({
                name: config.worker.name,
                host: config.worker.host,
                port: config.worker.port,
                available: true,
                active: true,
                type: 'worker',
                lastStartedAt: new Date().toJSON(),
                createdAt: new Date().toJSON()
          },workerKey)
      })
        .then(function(){
          //start the system
          cluster.startAsync()
        })
        .then(function(){
          return supervisor.startAsync()
        })
        })
        .then(function(){
          done()
        })
        .catch(function(err){
          console.log('Startup error',err.stack)
          done(err)
        })
    },
    function(done){
      //stop the system
      nano.shredder.getAsync(workerKey)
        .then(function(doc){
          doc.available = false
          return nano.shredder.insertAsync(doc,workerKey)
        }).then(function(){
          return P.all([
            cluster.stopAsync(),
            supervisor.stopAsync()
          ])
        })
        .then(function(){
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
