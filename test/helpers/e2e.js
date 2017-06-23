'use strict';
var expect = require('chai').expect
var express = require('express')
var fs = require('graceful-fs')
var http = require('http')
var infant = require('infant')
var ObjectManage = require('object-manage')
var oose = require('oose-sdk')
var path = require('path')
var rimraf = require('rimraf-promise')
var url = require('url')

var api = require('../../helpers/api')
var cradle = require('../../helpers/couchdb')
var logger = require('../../helpers/logger')
var content = oose.mock.content
//var purchasedb = require('../../helpers/purchasedb')
var redis = require('../../helpers/redis')
var hashFile = require('../../helpers/hashFile')

var NetworkError = oose.NetworkError
var UserError = oose.UserError

var config = require('../../config')


/**
 * Rewrite hash name
 * @type {string}
 */
content.hash = content.sha1


/**
 * Test env var
 * @type {string}
 */
process.env.NODE_ENV = 'test'

//load promises here
var P = require('bluebird')
//P.longStackTraces() //enable long stack traces for debugging only

//make some promises
P.promisifyAll(infant)

//lets make sure these processes are killed
process.on('exit',function(){
  var keys = Object.keys(exports.server)
  var key
  var server
  for(var i = 0; i < keys.length; i++){
    key = keys[i]
    server = exports.server[key]
    server.kill()
  }
})


/**
 * API Timeout for outage testing
 * @type {number}
 */
process.env.REQUEST_TIMEOUT = 10000


/**
 * User session storage
 * @type {object}
 */
exports.user = {
  session: {},
  username: 'oose',
  password: 'blah1234'
}


/**
 * Purchase storage
 * @type {object}
 */
exports.purchase = {}


/**
 * Make env for instance with config override
 * @param {string} configFile
 * @return {object}
 */
exports.makeEnv = function(configFile){
  var env = new ObjectManage()
  env.$load(process.env)
  env.OOSE_CONFIG = path.resolve(configFile)
  return env.$strip()
}


/**
 * Get an instance config
 * @param {string} configFile
 * @return {object}
 */
exports.getConfig = function(configFile){
  var conf = new ObjectManage()
  conf.$load(config.$strip())
  conf.$load(require(path.resolve(configFile)))
  return conf.$strip()
}


/**
 * Cluster configuration
 * @type {object}
 */
exports.clconf = {
  prism1: exports.getConfig(__dirname + '/../assets/prism1.config.js'),
  prism2: exports.getConfig(__dirname + '/../assets/prism2.config.js'),
  store1: exports.getConfig(__dirname + '/../assets/store1.config.js'),
  store2: exports.getConfig(__dirname + '/../assets/store2.config.js'),
  store3: exports.getConfig(__dirname + '/../assets/store3.config.js'),
  store4: exports.getConfig(__dirname + '/../assets/store4.config.js')
}


/**
 * Mock servers
 * @type {object}
 */
exports.server = {
  prism1: infant.parent('../../prism',{
    fork: {env: exports.makeEnv(__dirname + '/../assets/prism1.config.js')}
  }),
  prism2: infant.parent('../../prism',{
    fork: {env: exports.makeEnv(__dirname + '/../assets/prism2.config.js')}
  }),
  store1: infant.parent('../../store',{
    fork: {env: exports.makeEnv(__dirname + '/../assets/store1.config.js')}
  }),
  store2: infant.parent('../../store',{
    fork: {env: exports.makeEnv(__dirname + '/../assets/store2.config.js')}
  }),
  store3: infant.parent('../../store',{
    fork: {env: exports.makeEnv(__dirname + '/../assets/store3.config.js')}
  }),
  store4: infant.parent('../../store',{
    fork: {env: exports.makeEnv(__dirname + '/../assets/store4.config.js')}
  })
}


/**
 * Start cluster
 * @param {object} that
 * @return {P}
 */
exports.before = function(that){
  that.timeout(80000)
  logger.log('info','Starting mock cluster....')
  return P.try(function(){
    return rimraf(__dirname + '/../assets/data')
  })
    .then(function(){
      return redis.removeKeysPattern(redis.schema.flushKeys())
    })
    .then(function(){
      var key = cradle.schema.inventory()
      return cradle.inventory.allAsync({startkey: key, endkey: key + '\uffff'})
    })
    .map(function(row){
      return cradle.inventory.removeAsync(row.key)
    })
    .then(function(){
      //return purchasedb.flushallAsync();
    })
    .then(function(){
      var key = cradle.schema.prism()
      return cradle.peer.allAsync({startkey: key, endkey: key + '\uffff'})
    })
    .map(function(row){
      return cradle.peer.removeAsync(row.key)
    })
    .then(function(){
      var key = cradle.schema.store()
      return cradle.peer.allAsync({startkey: key, endkey: key + '\uffff'})
    })
    .map(function(row){
      return cradle.peer.removeAsync(row.key)
    })
    .then(function(){
      var key = cradle.schema.downVote()
      return cradle.heartbeat.allAsync({startkey: key, endkey: key + '\uffff'})
    })
    .map(function(row){
      return cradle.heartbeat.removeAsync(row.key)
    })
    .then(function(){
      return P.all([
        exports.server.prism1.startAsync(),
        exports.server.prism2.startAsync(),
        exports.server.store1.startAsync(),
        exports.server.store2.startAsync(),
        exports.server.store3.startAsync(),
        exports.server.store4.startAsync()
      ])
    })
    .then(function(){
      logger.log('info','Mock cluster started!')
    })
}


/**
 * Shut down mock cluster
 * @param {object} that
 * @return {P}
 */
exports.after = function(that){
  that.timeout(80000)
  logger.log('info','Stopping mock cluster...')
  return P.all([
    exports.server.store4.stopAsync(),
    exports.server.store3.stopAsync(),
    exports.server.store2.stopAsync(),
    exports.server.store1.stopAsync(),
    exports.server.prism2.stopAsync(),
    exports.server.prism1.stopAsync()
  ])
    .then(function(){
      logger.log('info','Mock cluster stopped!')
    })
}


/**
 * Check if a host is up
 * @param {string} type
 * @param {object} server
 * @return {Function}
 */
exports.checkUp = function(type,server){
  return function(){
    var client = api[type](server[type])
    return client.postAsync({url: client.url('/ping'), timeout: 1000})
      .spread(function(res,body){
        expect(body.pong).to.equal('pong')
      })
  }
}


/**
 * Check if a host is down
 * @param {string} type
 * @param {object} server
 * @return {Function}
 */
exports.checkDown = function(type,server){
  return function(){
    var client = api[type](server[type])
    return client.postAsync({url: client.url('/ping'), timeout: 1000})
      .then(function(){
        throw new Error('Server not down')
      })
      .catch(client.handleNetworkError)
      .catch(NetworkError,function(err){
        expect(err.message).to.match(/ECONNREFUSED|ETIMEDOUT/)
      })
  }
}


/**
 * Check if public routes work on a prism
 * @param {object} prism
 * @return {Function}
 */
exports.checkPublic = function(prism){
  return function(){
    var client = api.prism(prism.prism)
    return client
      .postAsync(client.url('/'))
      .spread(client.validateResponse())
      .spread(function(res,body){
        expect(body.message).to.equal(
          'Welcome to OOSE version ' + config.version)
        return client.postAsync(client.url('/ping'))
      })
      .spread(client.validateResponse())
      .spread(function(res,body){
        expect(body.pong).to.equal('pong')
        return client.postAsync(client.url('/user/login'))
      })
      .spread(client.validateResponse())
      .spread(function(res,body){
        logger.log('info',body)
        throw new Error('Should have thrown an error for no username')
      })
      .catch(UserError,function(err){
        expect(err.message).to.equal('Invalid username or password')
      })
  }
}


/**
 * Check if protected routes require authentication on a prism
 * @param {object} prism
 * @return {Function}
 */
exports.checkProtected = function(prism){
  return function(){
    var client = api.prism(prism.prism)
    return client.postAsync(client.url('/user/logout'))
      .catch(UserError,function(err){
        expect(err.message).to.match(/Invalid response code \(401\) to POST/)
        return client.postAsync(client.url('/user/session/validate'))
      })
      .catch(UserError,function(err){
        expect(err.message).to.match(/Invalid response code \(401\) to POST/)
        return client.postAsync(client.url('/content/upload'))
      })
      .catch(UserError,function(err){
        expect(err.message).to.match(/Invalid response code \(401\) to POST/)
        return client.postAsync(client.url('/content/purchase'))
      })
      .catch(UserError,function(err){
        expect(err.message).to.match(/Invalid response code \(401\) to POST/)
        return client.postAsync(client.url('/content/purchase/remove'))
      })
      .catch(UserError,function(err){
        expect(err.message).to.match(/Invalid response code \(401\) to POST/)
      })
  }
}


/**
 * Login to a prism
 * @param {object} prism
 * @return {Function}
 */
exports.prismLogin = function(prism){
  return function(){
    var client = api.prism(prism.prism)
    return client.postAsync({
      url: client.url('/user/login'),
      json: {
        username: exports.user.username,
        password: exports.user.password
      },
      localAddress: '127.0.0.1'
    })
      .spread(function(res,body){
        expect(body.session).to.be.an('object')
        return body.session
      })
  }
}


/**
 * Logout of a prism
 * @param {object} prism
 * @param {object} session
 * @return {Function}
 */
exports.prismLogout = function(prism,session){
  return function(){
    var client = api.setSession(session,api.prism(prism.prism))
    return client.postAsync({
      url: client.url('/user/logout'),
      localAddress: '127.0.0.1'
    })
      .spread(function(res,body){
        expect(body.success).to.equal('User logged out')
      })
  }
}


/**
 * Content upload
 * @param {object} prism
 * @return {Function}
 */
exports.contentUpload = function(prism){
  return function(){
    var client = api.setSession(exports.user.session,api.prism(prism.prism))
    return client
      .postAsync({
        url: client.url('/content/upload'),
        formData: {
          file: fs.createReadStream(content.file)
        },
        json: true,
        timeout: 300000,
        localAddress: '127.0.0.1'
      })
      .spread(function(res,body){
        //we need to pause here
        return new P(function(resolve){
          setTimeout(function(){
            expect(body.files.file.hash).to.equal(content.hash)
            resolve()
          },1000)
        })
      })
  }
}


/**
 * Content retrieve
 * @param {object} prism
 * @return {Function}
 */
exports.contentRetrieve = function(prism){
  return function(){
    var client = api.setSession(exports.user.session,api.prism(prism.prism))
    var app = express()
    var server = http.createServer(app)
    app.get('/test.txt',function(req,res){
      res.sendFile(path.resolve(content.file))
    })
    P.promisifyAll(server)
    return server.listenAsync(25000,'127.0.0.1')
      .then(function(){
        var port = server.address().port
        return client
          .postAsync({
            url: client.url('/content/retrieve'),
            json: {
              request: {
                url: 'http://127.0.0.1:' + port + '/test.txt',
                method: 'get'
              },
              extension: content.ext
            },
            localAddress: '127.0.0.1'
          })
      })
      .spread(function(res,body){
        expect(body.hash).to.equal(content.hash)
        expect(body.extension).to.equal(content.ext)
      })
      .catch(function(err){
        logger.log('error','Failed to setup retrieve' + err.message,err.stack)
        throw err
      })
      .finally(function(){
        return server.closeAsync()
          .catch(function(){})
      })
  }
}


/**
 * Content send
 * @param {object} prism
 * @return {Function}
 */
exports.contentSend = function(prism){
  return function(){
    var client = api.prism(prism.prism)
    var storeFrom = null
    var storeTo = null
    var storeClient = {}
    return client.postAsync({
      url: client.url('/content/exists'),
      json: {
        hash: content.hash
      }
    })
      .spread(client.validateResponse())
      .spread(function(res,body){
        //we are going to assign the first value of the map to the store from
        storeFrom = body.map[0]
        //now we want to establish where it will go i am going to use a dirty
        //array here to save time
        var cluster = [
          'prism1:store1',
          'prism1:store2',
          'prism2:store3',
          'prism2:store4'
        ]
        cluster.forEach(function(store){
          if(store && body.map.indexOf(store) < 0 && !storeTo){
            storeTo = store
          }
        })
        //now we need to get the configuration details so lets figure out the
        //store so we can just locally call the config
        var storeShortname = storeFrom.split(':')[1]
        storeClient = api.store(exports.clconf[storeShortname].store)
        return storeClient.postAsync({
          url: storeClient.url('/content/send'),
          json: {
            file: content.hash + '.' + content.ext,
            store: storeTo
          }
        })
      })
      .spread(client.validateResponse())
      .spread(function(res,body){
        expect(body.success).to.equal('Clone sent')
        expect(body.fileDetail.hash).to.equal(content.hash)
        expect(body.fileDetail.ext).to.equal(content.ext)
        var storeShortname = storeTo.split(':')[1]
        storeClient = api.store(exports.clconf[storeShortname].store)
        return storeClient.postAsync({
          url: storeClient.url('/content/remove'),
          json: {
            hash: body.fileDetail.hash
          }
        })
      })
      .spread(client.validateResponse())
      .spread(function(res,body){
        expect(body.success).to.equal('File removed')
      })
  }
}


/**
 * Get content detail
 * @param {object} prism
 * @param {object} options
 * @return {Function}
 */
exports.contentExists = function(prism,options){
  if('object' !== typeof options) options = {}
  if(!options.hasOwnProperty('count')) options.count = 2
  if(!options.hasOwnProperty('checkExists')) options.checkExists = true
  if(!options.hasOwnProperty('deepChecks'))
    options.deepChecks = ['prism1','prism2']
  return function(){
    var client = api.prism(prism.prism)
    return client
      .postAsync({
        url: client.url('/content/exists'),
        json: {hash: content.hash},
        localAddress: '127.0.0.1'
      })
      .spread(function(res,body){
        expect(body.hash).to.equal(content.hash)
        if(options.checkExists) expect(body.exists).to.equal(true)
        if(options.countGreaterEqual)
          expect(body.count).to.be.least(options.count)
        else if(options.checkExists)
          expect(body.count).to.equal(options.count)
        if(options.deepChecks.indexOf('prism1') >= 0){
          expect(body.map.join(',').indexOf('prism1')).to.be.least(0)
        }
        if(options.deepChecks.indexOf('prism2') >= 0){
          expect(body.map.join(',').indexOf('prism2')).to.be.least(0)
        }
      })
  }
}


/**
 * Get content exists in bulk
 * @param {object} prism
 * @param {object} options
 * @return {Function}
 */
exports.contentExistsBulk = function(prism,options){
  if('object' !== typeof options) options = {}
  if(!options.hasOwnProperty('count')) options.count = 2
  if(!options.hasOwnProperty('checkExists')) options.checkExists = true
  if(!options.hasOwnProperty('deepChecks'))
    options.deepChecks = ['prism1','prism2']
  return function(){
    var client = api.prism(prism.prism)
    return client
      .postAsync({
        url: client.url('/content/exists'),
        json: {hash: [content.hash,content.sha1Bogus,'']},
        localAddress: '127.0.0.1'
      })
      .spread(function(res,body){
        expect(body).to.be.an('object')
        expect(body[content.hash]).to.be.an('object')
        expect(body[content.sha1Bogus]).to.be.an('object')
        expect(body[content.sha1Bogus].exists).to.equal(false)
        //shift the main one over an inspect
        body = body[content.hash]
        expect(body.hash).to.equal(content.hash)
        if(options.checkExists) expect(body.exists).to.equal(true)
        if(options.countGreaterEqual)
          expect(body.count).to.be.least(options.count)
        else if(options.checkExists)
          expect(body.count).to.equal(options.count)
        if(options.deepChecks.indexOf('prism1') !== -1){
          expect(body.map.join(',').indexOf('prism1')).to.be.least(0)
        }
        if(options.deepChecks.indexOf('prism2') !== -1){
          expect(body.map.join(',').indexOf('prism2')).to.be.least(0)
        }
      })
  }
}


/**
 * Get content detail
 * @param {object} prism
 * @return {Function}
 */
exports.contentDetail = function(prism){
  return function(){
    var client = api.setSession(exports.user.session,api.prism(prism.prism))
    return client
      .postAsync({
        url: client.url('/content/detail'),
        json: {hash: content.hash},
        localAddress: '127.0.0.1'
      })
      .spread(function(res,body){
        expect(body.hash).to.equal(content.hash)
        expect(body.count).to.be.greaterThan(0)
        expect(body.exists).to.equal(true)
        expect(body.map).to.be.an('array')
      })
  }
}


/**
 * Get content detail bulk
 * @param {object} prism
 * @return {Function}
 */
exports.contentDetailBulk = function(prism){
  return function(){
    var client = api.setSession(exports.user.session,api.prism(prism.prism))
    return client
      .postAsync({
        url: client.url('/content/detail'),
        json: {hash: [content.hash,content.sha1Bogus,'']},
        localAddress: '127.0.0.1'
      })
      .spread(function(res,body){
        expect(body).to.be.an('object')
        expect(body[content.hash]).to.be.an('object')
        expect(body[content.sha1Bogus]).to.be.an('object')
        //shift the thing over and run the normal tests
        body = body[content.hash]
        expect(body.hash).to.equal(content.hash)
        expect(body.count).to.be.greaterThan(0)
        expect(body.exists).to.equal(true)
        expect(body.map).to.be.an('array')
      })
  }
}


/**
 * Purchase content
 * @param {object} prism
 * @return {Function}
 */
exports.contentPurchase = function(prism){
  return function(){
    var client = api.setSession(exports.user.session,api.prism(prism.prism))
    return client
      .postAsync({
        url: client.url('/content/purchase'),
        json: {
          hash: content.hash,
          ext: content.ext,
          ip: '127.0.0.1',
          referrer: ['localhost']
        },
        localAddress: '127.0.0.1'
      })
      .spread(function(res,body){
        body.referrer = body.referrer.split(',')
        expect(body.token.length).to.equal(20)
        expect(body.ext).to.equal('txt')
        expect(body.hash).to.equal(content.hash)
        expect(+body.expirationDate).to.be.greaterThan((+new Date()))
        expect(body.referrer).to.be.an('array')
        expect(body.referrer[0]).to.equal('localhost')
        return body
      })
  }
}


/**
 * Static content
 * @param {object} prism
 * @param {string} localAddress
 * @param {string} ext file extension
 * @return {Function}
 */
exports.contentStatic = function(prism,localAddress,ext){
  ext = ext || content.ext
  return function(){
    var client = api.prism(prism.prism)
    var options = {
      url: client.url('/static/' + content.hash + '/test.' + ext),
      followRedirect: false,
      localAddress: localAddress || '127.0.0.1'
    }
    return client.getAsync(options)
      .spread(function(res){
        expect(res.statusCode).to.equal(302)
        var uri = url.parse(res.headers.location)
        var host = uri.host.split('.')
        expect(host[0]).to.match(/^store\d{1}$/)
        expect(host[1]).to.equal(prism.domain)
        expect(uri.pathname).to.equal(
          '/static/' + hashFile.toRelativePath(content.hash,ext)
        )
      })
  }
}


/**
 * Deliver content
 * @param {object} prism
 * @param {string} localAddress
 * @param {string} referrer
 * @return {Function}
 */
exports.contentDeliver = function(prism,localAddress,referrer){
  return function(){
    var client = api.prism(prism.prism)
    var options = {
      url: client.url('/' + exports.purchase.token + '/' + content.filename),
      headers: {
        'Referer': referrer || 'localhost'
      },
      followRedirect: false,
      localAddress: localAddress || '127.0.0.1'
    }
    return client.getAsync(options)
      .spread(function(res){
        expect(res.statusCode).to.equal(302)
        var uri = url.parse(res.headers.location)
        var host = uri.host.split('.')
        expect(host[0]).to.match(/^store\d{1}$/)
        expect(host[1]).to.equal(prism.domain)
      })
  }
}


/**
 * Download content
 * @param {object} prism
 * @return {Function}
 */
exports.contentDownload = function(prism){
  return function(){
    var client = api.setSession(exports.user.session,api.prism(prism.prism))
    return client.postAsync({
      url: client.url('/content/download'),
      json: {hash: content.hash},
      localAddress: '127.0.0.1'
    })
      .spread(function(res,body){
        expect(body).to.equal(content.data)
      })
  }
}


/**
 * Remove content purchase
 * @param {object} prism
 * @return {Function}
 */
exports.contentPurchaseRemove = function(prism){
  return function(){
    var client = api.setSession(exports.user.session,api.prism(prism.prism))
    return client.postAsync({
      url: client.url('/content/purchase/remove'),
      json: {token: exports.purchase.token},
      localAddress: '127.0.0.1'
    })
      .spread(function(res,body){
        expect(body.token).to.equal(exports.purchase.token)
        expect(body.count).to.equal(1)
        expect(body.success).to.equal('Purchase removed')
      })
  }
}
