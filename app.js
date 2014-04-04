'use strict';
var cluster = require('cluster')
  , os = require('os')
  , config = require('./config')
  , fs = require('fs')
  , mkdirp = require('mkdirp')
  , logger = require('./helpers/logger')
  , async = require('async')

//master startup
if(cluster.isMaster){
  require('node-sigint')
  var redis = require('./helpers/redis')
    , jobs = require('./helpers/jobs')
    , peerNext = require('./collectors/peerNext')
    , peerStats = require('./collectors/peerStats')
    , mesh = require('./mesh')
    , ping = require('./mesh/ping')
    , announce = require('./mesh/announce')
  //make sure the root folder exists
  if(!fs.existsSync(config.get('root'))){
    mkdirp.sync(config.get('root'))
  }
  //flush redis before startup
  redis.flushdb()
  //start booting
  async.series(
    [
      //start mesh
      function(done){
        logger.info('Starting mesh')
        mesh.start(done)
      },
      //start collectors
      function(done){
        logger.info('Starting stats collection')
        peerStats.start(config.get('mesh.interval.stat'),0)
        peerStats.once('loopEnd',function(){done()})
      },
      //start ping
      function(done){
        logger.info('Starting ping')
        ping.start(done)
      },
      //start announce
      function(done){
        logger.info('Starting announce')
        announce.start(done)
      },
      //start next peer selection
      function(done){
        logger.info('Starting next peer selection')
        peerNext.start(config.get('mesh.interval.peerNext'),config.get('mesh.interval.announce') * 2,done)
      },
      //start the supervisor
      function(done){
        if(config.get('supervisor.enabled')){
          require('./supervisor').start(function(){
            logger.info('Supervisor started')
            done()
          })
        } else done()
      }
    ],
    function(err){
      if(err){
        logger.error('Startup failed: ' + err)
        process.exit()
      }
      //register job handlers
      jobs.process('inventory',require('./tasks/inventory'))
      jobs.process('prismSync',require('./tasks/prismSync'))
      jobs.process('clone',require('./tasks/clone'))
      //fire off initial scan
      if(config.get('store.enabled'))
        jobs.create('inventory',{title: 'Build the initial hash table', root: config.get('root')}).save()
      //start workers
      var workers = config.get('workers') || os.cpus().length
      logger.info('Starting ' + workers + ' workers')
      for(var i=1; i <= workers; i++){
        cluster.fork()
      }
      cluster.on('online',function(worker){
        logger.info('Worker ' + worker.id + ' online')
      })
    }
  )
  var shutdownAttempted = false
  var shutdown = function(){
    logger.info('Beginning shutdown')
    async.series(
      [
        //stop workers
        function(done){
          logger.info('Stopping all workers')
          cluster.disconnect(function(){done()})
          done()
        },
        //stop kue
        function(done){
          logger.info('Stopping kue')
          jobs.shutdown(done,60000)
        },
        //stop announce
        function(done){
          logger.info('Stopping announce')
          announce.stop(done)
        },
        //stop ping
        function(done){
          logger.info('Stopping ping')
          ping.stop(done)
        },
        //stop next peer selection
        function(done){
          logger.info('Stopping next peer selection')
          peerNext.stop(done)
        },
        //stats
        function(done){
          logger.info('Stopping self stat collection')
          peerStats.stop(done)
        },
        //stop mesh
        function(done){
          logger.info('Stopping mesh')
          mesh.stop(done)
        }
      ],
      function(err){
        if(err && !shutdownAttempted){
          shutdownAttempted = true
          logger.error('Shutdown failed: ' + err)
        } else if(err && shutdownAttempted){
          logger.error('Shutdown failed: ' + err)
          logger.error('Shutdown already failed once, forcing exit')
          process.exit()
        } else {
          logger.info('Stopped')
          process.exit()
        }
      }
    )
  }
  process.once('SIGINT',shutdown)
  process.once('SIGTERM',shutdown)
}

//worker startup
if(cluster.isWorker){
  var storeImport = require('./import')
    , storeExport = require('./export')
    , prism = require('./prism')
  //start storage services
  if(config.get('store.enabled')){
    storeImport.start()
    storeExport.start()
  }
  //start prism if its enabled
  if(config.get('prism.enabled')){
    prism.start()
  }
}
