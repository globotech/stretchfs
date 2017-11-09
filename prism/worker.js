'use strict';
var P = require('bluebird')
var basicAuth = require('basic-auth-connect')
var bodyParser = require('body-parser')
var express = require('express')
var fs = require('graceful-fs')
var http = require('http')
var https = require('https')
var worker = require('infant').worker

var redis = require('../helpers/redis')()
var userSessionValidate = require('../helpers/userSessionValidate')

var app = express()
var config = require('../config')
var sslOptions = {
  key: fs.readFileSync(config.ssl.pem),
  cert: fs.readFileSync(config.ssl.pem)
}
var server = https.createServer(sslOptions,app)
//if the config calls for additional servers set them up now
var listenServer = []
if(config.prism.listen && config.prism.listen.length){
  config.prism.listen.forEach(function(cfg){
    var ssl = null
    if(true === cfg.ssl) ssl = sslOptions
    if(cfg.sslKey && cfg.sslCert){
      ssl = {
        key: fs.readFileSync(cfg.sslKey),
        cert: fs.readFileSync(cfg.sslCert)
      }
    }
    if(ssl){
      listenServer.push({
        server: P.promisifyAll(https.createServer(ssl,app)),
        cfg: cfg
      })
    } else {
      listenServer.push({
        server: P.promisifyAll(http.createServer(app)),
        cfg: cfg
      })
    }
  })
}
var routes = require('./routes')

//make some promises
P.promisifyAll(server)

//access logging
if(config.store.accessLog){
  var morgan = require('morgan')
  app.use(morgan('combined'))
}

//setup
app.use(bodyParser.json({limit: '100mb'}))

//track requests
app.use(function(req,res,next){
  redis.incr(redis.schema.counter('prism','requests'))
  next()
})

//--------------------
//public routes
//--------------------

//home page
app.get('/',routes.index)
app.post('/',routes.index)

//health test
app.get('/ping',routes.ping)
app.post('/ping',routes.ping)

//stats
app.get('/stats',routes.stats.sendJSON)
app.post('/stats',routes.stats.sendJSON)
app.get('/statsPush',routes.stats.receiveJSON)
app.post('/statsPush',routes.stats.receiveJSON)

app.get('/crossdomain.xml',function(req,res){
  redis.incr(redis.schema.counter('prism','crossdomain'))
  res.sendFile(__dirname + '/public/crossdomain.xml')
})

//speed test
app.get('/content/speedtest',routes.content.speedTest)

//public job functions
app.get('/job/content/download/:handle/:file',routes.job.contentDownload)

//--------------------
//protected routes
//--------------------

//user functions
app.post('/user/login',routes.user.login)
app.post('/user/logout',userSessionValidate,routes.user.logout)
app.post(
  '/user/session/validate',userSessionValidate,routes.user.sessionValidate)

//content functions
app.post('/content/detail',userSessionValidate,routes.content.detail)
app.post('/content/upload',userSessionValidate,routes.content.upload)
app.post('/content/retrieve',userSessionValidate,routes.content.retrieve)
app.post('/content/purchase',userSessionValidate,routes.content.purchase)
app.post(
  '/content/purchase/remove',userSessionValidate,routes.content.purchaseRemove)
app.post('/content/download',userSessionValidate,routes.content.download)

//--------------------
//private routes
//--------------------
var auth = basicAuth(config.prism.username,config.prism.password)

//cache management
app.post('/cache/flush',auth,routes.cache.flush)
app.post('/cache/detail',auth,routes.cache.detail)

//content
app.post('/content/exists',auth,routes.content.exists)

//protected job functions
app.post('/job/create',userSessionValidate,routes.job.create)
app.post('/job/detail',userSessionValidate,routes.job.detail)
app.post('/job/update',userSessionValidate,routes.job.update)
app.post('/job/remove',userSessionValidate,routes.job.remove)
app.post('/job/start',userSessionValidate,routes.job.start)
app.post('/job/retry',userSessionValidate,routes.job.retry)
app.post('/job/abort',userSessionValidate,routes.job.abort)
app.post('/job/content/exists',userSessionValidate,routes.job.contentExists)

//static content
app.get('/static/:hash/:filename',routes.content.contentStatic)

//main content retrieval route
app.get('/:token/:filename',routes.content.deliver)


/**
* Start stretchfs prism
* @param {function} done
*/
exports.start = function(done){
  server.listenAsync(+config.prism.port,config.prism.host)
    .then(function(){
      return listenServer
    })
    .each(function(listen){
      return listen.server.listenAsync(listen.cfg.port,listen.cfg.host)
    })
    .then(function(){
      done()
    })
}


/**
 * Stop stretchfs prism
 * @param {function} done
 */
exports.stop = function(done){
  //dont wait for this since it will take to long and we are stopping now
  server.close()
  listenServer.forEach(function(listen){
    listen.server.close()
  })
  //just return now
  done()
}

if(require.main === module){
  worker(
    server,
    'stretchfs:' + config.prism.name + ':worker',
    function(done){
      exports.start(done)
    },
    function(done){
      exports.stop(done)
    }
  )
}
