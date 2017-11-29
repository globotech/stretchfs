'use strict';
var fs = require('graceful-fs')
var infant = require('infant')
var lifecycle = new (infant.Lifecycle)()
var ObjectManage = require('object-manage')
var path = require('path')

var logger = require('./helpers/logger')

//this is mostly a development file but could come in handy for other situations
//the cluster launcher is designed to more simply run a full cluster locally

//to operate this launcher it uses a cluster.json file to define which instances
//and the config for those instances, the launcher will then make generated
//config files for the cluster members and then start the members

if(!fs.existsSync('./cluster.json')){
  console.log('ERROR: cluster.json does not exist, exiting')
  process.exit(1)
}

var cluster = {}

var clusterConfig = require('./cluster.json')


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
 * Make env for instance with config override
 * @param {string} configFile
 * @return {object}
 */
var makeEnv = function(configFile){
  var env = new ObjectManage()
  env.$load(process.env)
  env.STRETCHFS_CONFIG = path.resolve(configFile)
  return env.$strip()
}

//setup admin
if(clusterConfig.admin){
  if(!clusterConfig.admin.host){
    logger.log(prism,'Missing admin host parameter')
    process.exit(1)
  }
  logger.log('Starting pre flight checks for admin')
  var configFile = './config.admin.js'
  if(!fs.existsSync(configFile)){
    var configData = "'use strict';\n\nmodule.exports = {\n  " +
      'admin: {\n    enabled: true'
    if(clusterConfig.admin.host){
      configData += ",\n    host: '" + clusterConfig.admin.host + "'"
    }
    if(clusterConfig.admin.port){
      configData += ",\n    port: '" + clusterConfig.admin.port + "'"
    }
    configData += '\n  }\n}\n'
    fs.writeFileSync(configFile,configData)
  }
  cluster['admin'] = infant.parent('./admin',{
    fork: {env: makeEnv(__dirname + '/' + configFile)}
  })
  lifecycle.add(
    'admin',
    function(next){
      cluster.admin.start(next)
    },
    function(next){
      cluster.admin.stop(next)
    }
  )
  logger.log('Pre flight checks complete for admin')
}


//setup prisms
clusterConfig.prism.forEach(function(prism){
  if(!prism.name){
    logger.log(prism,'Missing name parameter')
    process.exit(1)
  }
  logger.log('Starting pre flight checks for ' + prism.name)
  var configFile = './config.' + prism.name + '.js'
  if(!fs.existsSync(configFile)){
    var configData = "'use strict';\n\nmodule.exports = {\n  " +
      "prism: {\n    enabled: true,\n    name: '" + prism.name + "'"
    if(prism.host){
      configData += ",\n    host: '" + prism.host + "'"
    }
    if(prism.port){
      configData += ",\n    port: '" + prism.port + "'"
    }
    if(prism.listen){
      configData += ',\n    listen: ' + JSON.stringify(prism.listen)
    }
    configData += '\n  }\n}\n'
    fs.writeFileSync(configFile,configData)
  }
  cluster[prism.name] = infant.parent('./prism',{
    fork: {env: makeEnv(__dirname + '/' + configFile)}
  })
  lifecycle.add(
    prism.name,
    function(next){
      cluster[prism.name].start(next)
    },
    function(next){
      cluster[prism.name].stop(next)
    }
  )
  logger.log('Pre flight checks complete for ' + prism.name)
})

//setup stores
clusterConfig.store.forEach(function(store){
  if(!store.name){
    console.log(store,'Missing name parameter')
    process.exit(1)
  }
  logger.log('Starting pre flight checks for ' + store.name)
  var configFile = './config.' + store.name + '.js'
  if(!fs.existsSync(configFile)){
    var configData = "'use strict';\n\nmodule.exports = {\n  " +
      "store: {\n    enabled: true,\n    name: '" + store.name + "'"
    if(store.host){
      configData += ",\n    host: '" + store.host + "'"
    }
    if(store.port){
      configData += ",\n    port: '" + store.port + "'"
    }
    if(store.listen){
      configData += ',\n    listen: ' + JSON.stringify(store.listen)
    }
    configData += '\n  }\n}\n'
    fs.writeFileSync(configFile,configData)
  }
  cluster[store.name] = infant.parent('./store',{
    fork: {env: makeEnv(__dirname + '/' + configFile)}
  })
  lifecycle.add(
    store.name,
    function(next){
      cluster[store.name].start(next)
    },
    function(next){
      cluster[store.name].stop(next)
    }
  )
  logger.log('Pre flight checks complete for ' + store.name)
})


/**
 * Start main
 * @param {function} done
 */
exports.start = function(done){
  logger.log('info','Beginning cluster startup')
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
  logger.log('info','Beginning cluster shutdown')
  lifecycle.stop(function(err){
    if(err) throw err
    done()
  })
}

if(require.main === module){
  infant.child(
    'stretchfs:cluster',
    function(done){
      exports.start(done)
    },
    function(done){
      exports.stop(done)
    }
  )
}
