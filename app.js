'use strict';
var Child = require('infant').Child
var lifecycle = new (require('infant').Lifecycle)()

var child = Child.parent

var admin = child('./admin')
var prism = child('./prism')
var store = child('./store')

var config = require('./config')
var logger = require('./helpers/logger')

//setup lifecycle logging
lifecycle.on('start',function(item){
  logger.log('info', 'Starting ' + item.title)
})
lifecycle.on('stop',function(item){
  logger.log('info','Stopping ' + item.title)
})
lifecycle.on('online',function(){
  logger.log('info','Startup complete')
})
lifecycle.on('offline',function(){
  logger.log('info','Shutdown complete')
})


/**
 * Admin
 */
if(config.admin.enabled){
  lifecycle.add(
    'admin',
    function(next){
      admin.start(next)
    },
    function(next){
      admin.stop(next)
    }
  )
}


/**
 * Prism
 */
if(config.prism.enabled){
  lifecycle.add(
    'prism',
    function(next){
      prism.start(next)
    },
    function(next){
      prism.stop(next)
    }
  )
}


/**
 * Store
 */
if(config.store.enabled){
  lifecycle.add(
    'store',
    function(next){
      store.start(next)
    },
    function(next){
      store.stop(next)
    }
  )
}


/**
 * Start main
 * @param {function} done
 */
exports.start = function(done){
  logger.log('info','Beginning startup')
  lifecycle.start(
    function(err){
      if(err) throw err
      done()
    }
  )
}


/**
 * Stop master
 * @param {function} done
 */
exports.stop = function(done){
  //start the shutdown process
  logger.log('info','Beginning shutdown')
  lifecycle.stop(function(err){
    if(err) throw err
    done()
  })
}

if(require.main === module){
  Child.child(
    'stretchfs:' + config.host + ':main',
    function(done){
      exports.start(done)
    },
    function(done){
      exports.stop(done)
    }
  )
}
