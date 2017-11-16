'use strict';
var P = require('bluebird')
var infant = require('infant')

var logger = require('../helpers/logger')

//make some promises
P.promisifyAll(infant)

var cluster
var config = require('../config')

if(require.main === module){
  infant.child(
    'stretchfs:admin:master',
    function(done){
      var balanceSupervisor = infant.parent('./balance/supervisor')
      var balanceWorker = infant.parent('./balance/worker')
      cluster = infant.cluster(
        './worker',
        {
          enhanced: true,
          count: config.admin.workers.count,
          maxConnections: config.admin.workers.maxConnections
        }
      )
      logger.log('Starting balance worker')
      balanceWorker.startAsync()
        .then(function(){
          logger.log('Starting balance supervisor')
          return balanceSupervisor.startAsync()
        })
        .then(function(){
          logger.log('Starting admin panel')
          return cluster.startAsync()
        })
        .then(function(){
          done()
        })
        .catch(function(err){
          done(err)
        })
    },
    function(done){
      logger.log('Stopping admin panel')
      cluster.stopAsync()
        .then(function(){
          logger.log('Stopping balance supervisor')
          return balanceSupervisor.stopAsync()
        })
        .then(function(){
          logger.log('Stopping balance worker')
          return balanceWorker.stopAsync()
        })
        .then(function(){
          done()
        })
        .catch(function(err){
          done(err)
        })
    }
  )
}
