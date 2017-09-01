'use strict';
var P = require('bluebird')
var infant = require('infant')

var config = require('../config')
var couchdb = require('../helpers/couchdb')

var cluster
var heartbeat
var supervisorKey = couchdb.schema.supervisor(
  config.supervisor.prism,
  config.supervisor.name
)

//make some promises
P.promisifyAll(infant)

if(require.main === module){
  infant.child(
    'oose:' + config.supervisor.name + ':master',
    function(done){
      console.log('Beginning supervisor startup')
      //bootstrap to start
      cluster = infant.cluster(
        './worker',
        {
          enhanced: true,
          count: config.supervisor.workers.count,
          maxConnections: config.supervisor.workers.maxConnections
        }
      )
      heartbeat = infant.parent('../helpers/heartbeat')
      //check if our needed folders exist
      couchdb.peer.getAsync(supervisorKey)
        .then(
          //if we exist lets mark ourselves available
          function(doc){
            doc.name = config.store.name
            doc.host = config.store.host
            doc.port = config.store.port
            doc.available = true
            doc.active = true
            return couchdb.peer.insertAsync(doc,supervisorKey)
          },
          //if we dont exist lets make sure thats why and create ourselves
          function(err){
            if(!err.statusCode || 404 !== err.statusCode) throw err
            //now register ourselves or mark ourselves available
            return couchdb.peer.insertAsync({
              name: config.store.name,
              host: config.store.host,
              port: config.store.port,
              available: true,
              active: true,
              createdAt: new Date().toJSON()
            },supervisorKey)
          }
        )
        .then(function(){
          //start cluster and heartbeat system
          return P.all([
            cluster.startAsync(),
            heartbeat.startAsync()
          ])
        })
        .then(function(){
          console.log('Supervisor startup complete')
          done()
        })
        .catch(function(err){
          console.log(err.stack)
          console.log(err)
          done(err)
        })
    },
    function(done){
      console.log('Beginning supervisor shutdown')
      //mark ourselves as down
      couchdb.peer.getAsync(supervisorKey)
        .then(function(doc){
          doc.available = false
          return couchdb.peer.insertAsync(doc,supervisorKey)
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
          console.log('Supervisor shutdown complete')
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
