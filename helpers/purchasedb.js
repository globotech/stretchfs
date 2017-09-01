'use strict';
var P = require('bluebird')
var nano = require('nano')
var debug = require('debug')('oose:purchasedb')
var moment = require('moment')
var oose = require('oose-sdk')
var Password = require('node-password').Password
var random = require('random-js')()

var UserError = oose.UserError

var config = require('../config')

//make some promises
P.promisifyAll(nano)

var connectCouchDb = function(conf){
  //setup our client
  var dsn = conf.protocol
  if(conf.options && conf.options.auth && conf.options.auth.username){
    dsn = dsn + conf.options.auth.username
    var couchPassword= 'password'
    if(conf.options.auth.password && conf.options.auth.password !== '')
      couchPassword = conf.options.auth.password
    dsn = dsn + ':' + couchPassword
    dsn = dsn + '@'
  }
  dsn = dsn + conf.host
  dsn = dsn + ':' + conf.port
  var client = nano(dsn)
  P.promisifyAll(client)
  P.promisifyAll(client.db)
  return client
}
var couchdb = connectCouchDb(config.couchdb)


//make some promises
P.promisifyAll(couchdb)

//keep an object of couchdb connections based on the sharding configuration
var couchPool = {}

//keep an object of configurations relation to the pool
var couchConfigs = {}

//make some promises
P.promisifyAll(couchdb)


/**
 * Get Zone from Token
 * @param {string} token
 * @return {string}
 */
var getZone = function(token){
  return token.slice(0,1)
}


/**
 * Get database name from token
 * @param {string} token
 * @return {string}
 */
var getDatabaseName = function(token){
  return token.slice(0,9)
}


/**
 * Build configuration
 */
var buildConfig = function(){
  debug('building config')
  Object.keys(config.prism.purchaseZoneCouch).forEach(function(zone){
    debug('building config for zone',zone)
    var couchConfig = [
      {
        host: config.couchdb.host,
        port: config.couchdb.port,
        options: config.couchdb.options
      }
    ]
    if(
      config.prism.purchaseZoneCouch &&
      config.prism.purchaseZoneCouch[zone] instanceof Array
    ){
      couchConfig = config.prism.purchaseZoneCouch[zone]
    }
    debug('config for zone',zone,couchConfig)
    couchConfigs[zone] = couchConfig
  })
  debug('config build complete',couchConfigs)
}
buildConfig()


/**
 * Pick a couch from a zone to use
 * @param {string} zone
 * @return {Object|false}
 */
var pickCouchConfig = function(zone){
  debug('picking couch config',zone)
  if(!couchConfigs || !couchConfigs[zone]){
    debug('no configs',zone)
    return false
  }
  if(1 === couchConfigs[zone].length){
    debug('only one couch returning',zone)
    return couchConfigs[zone][0]
  }
  debug('picking couch from zonelist',zone,couchConfigs[zone])
  var winner = couchConfigs[zone][
    random.integer(0,(couchConfigs[zone].length - 1))]
  debug('winner picked',winner)
  return winner
}


/**
 * Suppress errors about database already existing
 * @param {object} err
 * @return {boolean}
 */
var suppressForbidden = function(err){
  if(err && err.error && 'forbidden' === err.error) return true
  else throw err
}


/**
 * Suppress errors about database already existing
 * @param {object} err
 * @return {boolean}
 */
var suppressDocumentConflict = function(err){
  if(err && err.error && 'conflict' === err.error) return true
  else throw err
}


/**
 * Suppress errors about database already existing
 * @param {object} err
 * @return {boolean}
 */
var suppressDatabaseExists = function(err){
  if(err && err.error && 'file_exists' === err.error) return true
  else throw err
}


/**
 * Setup replication
 * @param {string} databaseName
 * @param {object} couchConfig
 * @param {object} replConfig
 * @return {P}
 */
var setupWithReplication = function(databaseName,couchConfig,replConfig){
  //verify we are not the same server as currently being used
  debug('setupReplication',databaseName,couchConfig,replConfig)
  if(
    replConfig.host === couchConfig.host &&
    replConfig.port === couchConfig.port
  )
  {
    debug('replConfig matches couchConfig returning')
    return
  }
  var couchdbconn = connectCouchDb(couchConfig)
  var repldbconn = connectCouchDb(replConfig)
  P.promisifyAll(repldbconn)
  debug('couchdb creating oose-purchase-' + databaseName)
  var repldb = repldbconn.database('oose-purchase-' + databaseName)
  var couchdb = couchdbconn.database('oose-purchase-' + databaseName)
  return P.all([
    couchdb.createAsync()
      .catch(suppressDatabaseExists),
    repldb.createAsync()
      .catch(suppressDatabaseExists)
  ])
    .then(function(){
      var replicator = couchdbconn.database('_replicator')
      debug('saving replicator from couch to repl',couchConfig,replConfig)
      var replControl = {
        source: {
          url: 'http://' + couchConfig.host +
               ':' + couchConfig.port + '/' +
               'oose-purchase-' + databaseName
        },
        target: {
          url: 'http://' + replConfig.host +
            ':' + replConfig.port + '/' +
            'oose-purchase-' + databaseName
        },
        continuous: true,
        create_target: true,
        owner: 'root'
      }
      if(couchConfig.authRepl && couchConfig.authRepl.username){
        replControl.target.url = 'http://' +
          couchConfig.authRepl.username + ':' +
          couchConfig.authRepl.password + '@' +
          couchConfig.host +
          ':' + couchConfig.port + '/' +
          'oose-purchase-' + databaseName
        replControl.owner = couchConfig.authRepl.username
        replControl.user_ctx = {
          name: couchConfig.authRepl.username,
          roles: ['_admin','_reader','_writer']
        }
      }
      if(replConfig.authRepl && replConfig.authRepl.username){
        replControl.target.url = 'http://' +
          replConfig.authRepl.username + ':' +
          replConfig.authRepl.password + '@' +
          replConfig.host +
          ':' + replConfig.port + '/' +
          'oose-purchase-' + databaseName
        replControl.owner = replConfig.authRepl.username
        replControl.user_ctx = {
          name: replConfig.authRepl.username,
          roles: ['_admin','_reader','_writer']
        }
      }
      return replicator.insertAsync(
        replControl,
        'oose-purchase-' + databaseName + '-' +
        couchConfig.host + '->' +
        replConfig.host
      )
        .catch(suppressDocumentConflict)
        .catch(suppressForbidden)
    })
    .then(function(){
      var replicator = repldbconn.database('_replicator')
      debug('saving replicator from repl to couch',replConfig,couchConfig)
      var couchControl = {
        source: {
          url: 'http://' + replConfig.host +
            ':' + replConfig.port + '/' +
            'oose-purchase-' + databaseName
        },
        target: {
          url: 'http://' + couchConfig.host +
               ':' + couchConfig.port + '/' +
               'oose-purchase-' + databaseName
        },
        continuous: true,
        create_target: true,
        owner: 'root'
      }
      if(replConfig.authRepl && replConfig.authRepl.username){
        couchControl.target.url = 'http://' +
          replConfig.authRepl.username + ':' +
          replConfig.authRepl.password + '@' +
          replConfig.host +
          ':' + replConfig.port + '/' +
          'oose-purchase-' + databaseName
        couchControl.owner = replConfig.authRepl.username
        couchControl.user_ctx = {
          name: replConfig.authRepl.username,
          roles: ['_admin','_reader','_writer']
        }
      }
      if(couchConfig.authRepl && couchConfig.authRepl.username){
        couchControl.target.url = 'http://' +
          couchConfig.authRepl.username + ':' +
          couchConfig.authRepl.password + '@' +
          couchConfig.host +
          ':' + couchConfig.port + '/' +
          'oose-purchase-' + databaseName
        couchControl.owner = couchConfig.authRepl.username
        couchControl.user_ctx = {
          name: couchConfig.authRepl.username,
          roles: ['_admin','_reader','_writer']
        }
      }
      return replicator.insertAsync(
        couchControl,
        'oose-purchase-' + databaseName + '-' +
        replConfig.host + '->' +
        couchConfig.host
      )
        .catch(suppressDocumentConflict)
        .catch(suppressForbidden)
    })
}


/**
 * Setup a new database without replication
 * @param {string} databaseName
 * @param {object} couchConfig
 * @return {P}
 */
var setupWithoutReplication = function(databaseName,couchConfig){
  var couchdb = connectCouchDb(couchConfig)
  var dbName = 'oose-purchase-' + databaseName
  return couchdb.db.createAsync(dbName)
    .then(function(){
      return couchdb.db.use(dbName)
    })
}


/**
 * Prune purchase databases
 * @param {integer} days number of days to keep
 * @return {P}
 */
var pruneDatabase = function(days){
  var floorToken = +moment().subtract(days,'days').format('YYYYMMDD')
  debug('foorToken',floorToken)
  var pruneServer = function(couchConfig,zone){
    var couchdbconn = connectCouchDb(couchConfig)
    return couchdbconn.databasesAsync()
      .map(function(database){
        //THESE LINES ARE SUPER IMPORTANT
        if(database[0] === '_') return
        if(database.indexOf('oose-purchase-'+ zone) !== 0) return
        if(!database.match(/^oose-purchase-[a-z]{1}[0-9]{8}/)) return
        database = database.replace('oose-purchase-' + zone,'')
        var databaseName = 'oose-purchase-' + zone + database
        if((+database) > floorToken){
          debug('keeping',databaseName)
        } else {
          debug('removing',databaseName)
          var db = couchdbconn.database(databaseName)
          return db.destroyAsync()
          //return P.try(function(){console.log('WOULD DESTROY',databaseName)})
            .then(function(){
              var db = couchdbconn.database('_replicator')
              return db.listAsync({
                startkey: databaseName + '-',
                endkey: databaseName + '-\uffff'
              })
                .map(function(key){
                  //console.log('WOULD REMOVE _replicator',key.key)
                  return db.removeAsync(key.key)
                })
            })
        }
      })
  }
  var promises = []
  var _pruneServer = function(couchConfig,index){
    promises.push(pruneServer(couchConfig,index))
  }
  if(couchConfigs && Object.keys(couchConfigs)){
    for(var i in couchConfigs){
      couchConfigs[i].forEach(_pruneServer)
    }
  } else {
    promises.push(pruneServer(config.couchdb))
  }
  return P.all(promises)
}


/**
 * Create new database based on token and a no db file error
 * @param {string} token
 * @param {boolean} setupReplication
 * @return {P}
 */
var createDatabase = function(token,setupReplication){
  //the couchdb object should already be wrapped and pointed at the correct zone
  //next would involve create the database
  var databaseName = getDatabaseName(token)
  var zone = getZone(token)
  var promises = []
  debug('create database',token,zone,databaseName)
  if(setupReplication){
    if(couchConfigs && couchConfigs[zone] && couchConfigs[zone].length > 1){
      couchConfigs[zone].forEach(function(couchConfig){
        couchConfigs[zone].forEach(function(replConfig){
          var promise = setupWithReplication(
            databaseName,couchConfig,replConfig)
          if(promise) promises.push(promise)
        })
      })
    } else {
      if(couchConfigs && couchConfigs[zone] && couchConfigs[zone][0]){
        promises.push(
          setupWithoutReplication(databaseName,couchConfigs[zone][0]
        ))
      } else {
        promises.push(setupWithoutReplication(databaseName,config.couchdb))
      }
    }
  } else {
    promises.push(setupWithoutReplication(databaseName,config.couchdb))
  }
  debug('promises set for creation',databaseName,promises)
  return P.all(promises)
}


/**
 * Wrap couch calls to enumerate
 * @param {string} token
 * @return {object}
 */
var couchWrap = function(token){
  //here need to enumerate couch servers and choose the right connection
  //using the token to set the proper zone and database then returning the
  //configured couchdb object that can be used to work with the purchases as
  //if they were local
  //so first things first lets see if we have a connection to this zoned server
  if(!token.match(/^[a-z]{1}[0-9]{8}/))
    return null
  var now = new Date()
  var year = +token.slice(1,5)
  if(year !== now.getFullYear() && year !== (now.getFullYear() -1))
    return null
  var zone = getZone(token)
  var databaseName = getDatabaseName(token)
  var couchConfig = pickCouchConfig(zone)
  if(!couchConfig) return null
  couchPool[zone] = connectCouchDb(couchConfig)
  return couchPool[zone].database('oose-purchase-' + databaseName)
}


var PurchaseDb = function(){
  //construct purchase db, couchdb is connectionless so not much to do here
}


/**
 * Create database will also create replication optionally
 * @param {string} token
 * @param {boolean} setupReplication
 * @return {P}
 */
PurchaseDb.prototype.createDatabase = function(token,setupReplication){
  //create a database and wire up replication if needed
  if(undefined === setupReplication) setupReplication = false
  if(!token) throw new Error('token must be defined to create purchase db')
  return createDatabase(token,setupReplication)
}


/**
 * Prune databases
 * @param {integer} days number of days to keep from today
 * @return {P}
 */
PurchaseDb.prototype.pruneDatabase = function(days){
  return pruneDatabase(days)
}


/**
 * Get purchase by token, will also be used for exists
 * @param {string} token
 * @return {promise}
 */
PurchaseDb.prototype.get = function(token){
  //get token
  var couchdb
  return P.try(function(){
    debug(token,'get')
    couchdb = couchWrap(token)
    debug(token,'couch wrapped')
    if(!couchdb) throw new UserError('Could not validate purchase token')
    return couchdb.getAsync(token)
  })
    .then(function(result){
      debug(token,'get result',result)
      return result
    })
}


/**
 * Check if purchase token exists
 * @param {string} token
 * @return {promise}
 */
PurchaseDb.prototype.exists = function(token){
  debug(token,'exists')
  return this.get(token)
    .then(function(result){
      debug(token,'exists result',result)
      return !!result
    })
    .catch(function(err){
      debug(token,'exists error',err)
      return false
    })
}


/**
 * Create purchase with information
 * @param {string} token
 * @param {object} params
 * @return {promise}
 */
PurchaseDb.prototype.create = function(token,params){
  //create purchase
  var couchdb
  debug(token,'create')
  return P.try(function(){
    couchdb = couchWrap(token)
    if(!couchdb) throw new UserError('Could not validate purchase token')
    debug(token,'couch wrapped')
    return couchdb.insertAsync(params,token)
  })
    .then(function(result){
      debug(token,'create result',result)
      return result
    })
}


/**
 * Update purchase with information
 * @param {string} token
 * @param {object} params
 * @return {promise}
 */
PurchaseDb.prototype.update = function(token,params){
  //update purchase
  var that = this
  var couchdb
  debug(token,'update')
  return P.try(function(){
    couchdb = couchWrap(token)
    if(!couchdb) throw new UserError('Could not validate purchase token')
    debug(token,'couch wrapped getting')
    return that.get(token)
  })
    .then(function(result){
      if(result){
        debug(token,'update result received, udpating',result,params)
        return couchdb.insertAsync(params,token)
      } else{
        debug(token,'doesnt exist, creating',result,params)
        that.create(token,params)
      }
    })
}


/**
 * Remove purchase
 * @param {string} token
 * @return {promise}
 */
PurchaseDb.prototype.remove = function(token){
  //remove purchase
  debug(token,'remove')
  return this.get(token)
    .then(function(result){
      debug(token,'remove result',result)
      if(result){
        debug(token,'remove exists, removing')
        return couchWrap(token).removeAsync(token,result._rev)
      } else {
        debug(token,'remove doesnt exist do nothing')
        //otherwise it doesn't exist... cool
      }
    })
}


/**
 * Generate a new Purchase token
 * @param {string} zone
 * @return {string}
 */
PurchaseDb.prototype.generate = function(zone){
  //the new purchase tokens are not going to be random and they are going to be
  //shorter this will save space storing keys and make look ups faster
  //they will also contain information about sharding the purchase into various
  //couch servers and databases to improve truncating and cleanup due to couch
  //limitations in the blockchain like key structure
  //the key will form like this
  // <zone 1 char a-z0-9><date in YYYYmmdd><random string 11 chars a-z0-9>
  //this will result in a 20 char string
  //the zone sharding will work by using a map in the configuration file that
  //will map zone identifiers with couchdb configurations, if no configuration
  //exists for a particular zone it will fall through to the default couchdb
  //configuration
  //databases will be named using oose-purchase-<zone><date>
  //example purchase token
  // a20161110a7ch2nx9djn
  //example database name
  // oose-purchase-a20161110
  //now for token generation, this will involve first finding out what zone our
  //particular prism is on, that will popular the first char, then we will
  //find the date and finally generate the salt
  if(!zone)
    zone = config.prism.purchaseZone || 'a'
  var date = moment().format('YYYYMMDD')
  var salt = new Password({length: 11, special: false}).toString()
  var token = zone.slice(0,1) + date.slice(0,8) + salt.slice(0,11)
  debug('generated token',token)
  return token
}


/**
 * Export a singleton
 * @type {PurchaseDb}
 */
module.exports = new PurchaseDb()
