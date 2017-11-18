'use strict';
var expect = require('chai').expect
var express = require('express')
var fs = require('graceful-fs')
var http = require('http')
var infant = require('infant')
var ObjectManage = require('object-manage')
var stretchfs = require('stretchfs-sdk')
var path = require('path')
var rmfr = require('rmfr')
var url = require('url')

var api = require('../../helpers/api')
var couch = require('../../helpers/couchbase')
var logger = require('../../helpers/logger')
var content = stretchfs.mock.content
var redis = require('../../helpers/redis')()

var NetworkError = stretchfs.NetworkError
var UserError = stretchfs.UserError

var config = require('../../config')

//open couch buckets
var couchInventory = couch.inventory()
var couchStretch = couch.stretchfs()


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
  name: 'localhost',
  secret: 'bigpassword'
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
  env.STRETCHFS_CONFIG = path.resolve(configFile)
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
  balanceSupervisor: infant.parent('../../admin/balance/supervisor',{
    fork: {env: exports.makeEnv(__dirname + '/../assets/prism1.config.js')}
  }),
  balanceWorker: infant.parent('../../admin/balance/worker',{
    fork: {env: exports.makeEnv(__dirname + '/../assets/prism1.config.js')}
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
    return rmfr(__dirname + '/../assets/data')
  })
    .then(function(){
      return redis.removeKeysPattern(redis.schema.flushKeys())
    })
    .then(function(){
      var key = couch.schema.inventory()
      var qstring = 'DELETE FROM ' +
        couch.getName(couch.type.INVENTORY,true) + ' b ' +
        'WHERE META(b).id LIKE $1'
      var query = couch.N1Query.fromString(qstring)
      key = key + '%'
      return couchInventory.queryAsync(query,[key])
    })
    .then(function(){
      var key = couch.schema.prism()
      var qstring = 'DELETE FROM ' +
        couch.getName(couch.type.STRETCHFS,true) +
        ' WHERE META().id LIKE $1'
      var query = couch.N1Query.fromString(qstring)
      key = key + '%'
      return couchStretch.queryAsync(query,[key])
    })
    .then(function(){
      var key = couch.schema.store()
      var qstring = 'DELETE FROM ' +
        couch.getName(couch.type.STRETCHFS,true) +
        ' WHERE META().id LIKE $1'
      var query = couch.N1Query.fromString(qstring)
      key = key + '%'
      return couchStretch.queryAsync(query,[key])
    })
    .then(function(){
      var key = couch.schema.downVote()
      var qstring = 'DELETE FROM ' +
        couch.getName(couch.type.STRETCHFS,true) +
        ' WHERE META().id LIKE $1'
      var query = couch.N1Query.fromString(qstring)
      key = key + '%'
      return couchStretch.queryAsync(query,[key])
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
  var clconf = exports.clconf
  var removePeerEntry = function(peerKey){
    return couchStretch.removeAsync(peerKey)
  }
  return P.all([
    exports.server.store4.stopAsync(),
    exports.server.store3.stopAsync(),
    exports.server.store2.stopAsync(),
    exports.server.store1.stopAsync(),
    exports.server.prism2.stopAsync(),
    exports.server.prism1.stopAsync()
  ])
    .then(function(){
      //remove peer entries
      return P.all([
        removePeerEntry(couch.schema.prism(clconf.prism1.prism.name)),
        removePeerEntry(couch.schema.prism(clconf.prism2.prism.name)),
        removePeerEntry(couch.schema.store(clconf.store1.store.name)),
        removePeerEntry(couch.schema.store(clconf.store2.store.name)),
        removePeerEntry(couch.schema.store(clconf.store3.store.name)),
        removePeerEntry(couch.schema.store(clconf.store4.store.name))
      ])
    })
    .then(function(){
      logger.log('info','Mock cluster stopped!')
    })
}


/**
 * Start the balance system
 * @return {P}
 */
exports.balanceStart = function(){
  logger.log('info','Starting balance system')
  return exports.server.balanceSupervisor.startAsync()
    .then(function(){
      return exports.server.balanceWorker.startAsync()
    })
    .then(function(){
      logger.log('info','Balance system started')
    })
}


/**
 * Stop the balance system
 * @return {P}
 */
exports.balanceStop = function(){
  logger.log('info','Stopping balance system')
  return exports.server.balanceWorker.stopAsync()
    .then(function(){
      return exports.server.balanceSupervisor.stopAsync()
    })
    .then(function(){
      logger.log('info','Balance system stopped')
    })
}


/**
 * Do a speed test
 * @param {object} type
 * @param {object} server
 * @return {Function}
 */
exports.speedTest = function(type,server){
  return function(){
    var client = api.setupAccess(type,server[type])
    return client
      .getAsync(client.url('/content/speedtest?size=10k&addressType=ip'))
      .spread(function(res,body){
        expect(body.length).to.equal(10000)
      })
  }
}


/**
 * Check if a host is up
 * @param {string} type
 * @param {object} server
 * @return {Function}
 */
exports.checkUp = function(type,server){
  return function(){
    var client = api.setupAccess(type,server[type])
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
    var client = api.setupAccess(type,server[type])
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
    var client = api.setupAccess('prism',prism.prism)
    return client
      .postAsync(client.url('/'))
      .spread(client.validateResponse())
      .spread(function(res,body){
        expect(body.message).to.equal(
          'Welcome to StretchFS version ' + config.version)
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
      .catch(Error,function(err){
        expect(err.message).to.equal('Invalid name or secret')
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
    var client = api.setupAccess('prism',prism.prism)
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
    var client = api.setupAccess('prism',prism.prism)
    return client.postAsync({
      url: client.url('/user/login'),
      json: {
        name: exports.user.name,
        secret: exports.user.secret
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
    var client = api.setSession(session,api.setupAccess('prism',prism.prism))
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
    var client = api.setSession(
      exports.user.session,api.setupAccess('prism',prism.prism))
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
    var client = api.setSession(
      exports.user.session,api.setupAccess('prism',prism.prism))
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
    var client = api.setupAccess('prism',prism.prism)
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
          'store1',
          'store2',
          'store3',
          'store4'
        ]
        cluster.forEach(function(store){
          if(-1 === body.map.indexOf(store) && !storeTo){
            storeTo = store
          }
        })
        //now we need to get the configuration details so lets figure out the
        //store so we can just locally call the config
        storeClient = api.setupAccess('store',exports.clconf[storeFrom].store)
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
        storeClient = api.setupAccess('store',exports.clconf[storeTo].store)
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
    var client = api.setupAccess('prism',prism.prism)
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
          expect(parseInt(body.copies)).to.be.least(parseInt(options.count))
        else if(options.checkExists)
          expect(parseInt(body.copies)).to.equal(parseInt(options.count))
        var prismExists
        if(options.deepChecks.indexOf('prism1') >= 0){
          prismExists = false
          body.map.forEach(function(row){
            expect(row).to.be.a('string')
            prismExists = true //legacy check
          })
          expect(prismExists).to.equal(true)
        }
        if(options.deepChecks.indexOf('prism2') >= 0){
          prismExists = false
          body.map.forEach(function(row){
            expect(row).to.be.a('string')
            prismExists = true //legacy check
          })
          expect(prismExists).to.equal(true)
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
    var client = api.setupAccess('prism',prism.prism)
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
          expect(parseInt(body.copies)).to.be.least(parseInt(options.count))
        else if(options.checkExists)
          expect(parseInt(body.copies)).to.equal(parseInt(options.count))
        var prismExists
        if(options.deepChecks.indexOf('prism1') !== -1){
          prismExists = true
          body.map.forEach(function(row){
            expect(row).to.be.a('string')
          })
          expect(prismExists).to.equal(true)
        }
        if(options.deepChecks.indexOf('prism2') !== -1){
          prismExists = true
          body.map.forEach(function(row){
            expect(row).to.be.a('string')
          })
          expect(prismExists).to.equal(true)
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
    var client = api.setSession(
      exports.user.session,api.setupAccess('prism',prism.prism))
    return client
      .postAsync({
        url: client.url('/content/detail'),
        json: {hash: content.hash},
        localAddress: '127.0.0.1'
      })
      .spread(function(res,body){
        expect(body.hash).to.equal(content.hash)
        expect(body.copies).to.be.greaterThan(0)
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
    var client = api.setSession(
      exports.user.session,api.setupAccess('prism',prism.prism))
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
        expect(body.copies).to.be.greaterThan(0)
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
    var client = api.setSession(
      exports.user.session,api.setupAccess('prism',prism.prism))
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
    var client = api.setupAccess('prism',prism.prism)
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
          '/static/' + content.hash + '/test.' + ext
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
    var client = api.setupAccess('prism',prism.prism)
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
 * Receive content
 * @param {object} prism
 * @return {Function}
 */
exports.contentReceive = function(prism){
  return function(){
    var client = api.setupAccess('prism',prism.prism)
    var url = client.url(
      '/static/' + content.hash + '/' + content.filename + '?addressType=ip')
    var options = {
      url: url,
      query: {
        addressType: 'ipv4'
      },
      headers: {
        'Referer': 'localhost'
      },
      localAddress: '127.0.0.1'
    }
    return client.getAsync(options)
      .spread(function(res,body){
        expect(res.statusCode).to.equal(200)
        expect(body).to.equal('The fox is brown')
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
    var client = api.setSession(
      exports.user.session,api.setupAccess('prism',prism.prism))
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
    var client = api.setSession(
      exports.user.session,api.setupAccess('prism',prism.prism))
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
