'use strict';
var P = require('bluebird')
var basicAuth = require('basic-auth-connect')
var bodyParser = require('body-parser')
var express = require('express')
var fs = require('graceful-fs')
var https = require('https')
var http = require('http')
var worker = require('infant').worker

var couch = require('../helpers/couchbase')

//open some buckets
var cb = couch.stretchfs()

var app = express()
var config = require('../config')
var sslOptions = {
  key: fs.readFileSync(config.ssl.pem),
  cert: fs.readFileSync(config.ssl.pem)
}
var server = https.createServer(sslOptions,app)
var httpServer = http.createServer(app)
//if the config calls for additional servers set them up now
var listenServer = []
if(config.store.listen && config.store.listen.length){
  config.store.listen.forEach(function(cfg){
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
P.promisifyAll(httpServer)

//access logging
if(config.store.accessLog){
  var morgan = require('morgan')
  app.use(morgan('combined'))
}

//setup
app.use(bodyParser.json({limit: '100mb'}))

//track requests
app.use(function(req,res,next){
  couch.counter(cb,couch.schema.counter('requests'))
  couch.counterHour(cb,couch.schema.counter('requests'))
  couch.counter(cb,couch.schema.counter('store','requests'))
  couch.counter(cb,
    couch.schema.counter('store-' + config.store.name,'requests'))
  next()
})

//home page
app.get('/',routes.index)
app.post('/',routes.index)

//health test
app.get('/ping',routes.ping)
app.post('/ping',routes.ping)

//content purchase mapping
app.get('/purchase/uri/play/:token/:filename',routes.purchase.uri)

//content
app.get('/static/:hash/:file',routes.content.static)
app.get('/play/:token/:file',routes.content.play)

//content easter eggs
app.get('/content/pizza',routes.content.pizza)
app.get('/content/speedtest',routes.content.speedTest)

//job functions
app.get('/job/content/download/:handle/:file',routes.job.contentDownload)

//auth below this point
app.use(basicAuth(config.store.username,config.store.password))

//content functions
app.put('/content/put/:file',routes.content.put)
app.post('/content/download',routes.content.download)
app.post('/content/exists',routes.content.exists)
app.post('/content/remove',routes.content.remove)
app.post('/content/send',routes.content.send)
app.post('/content/detail',routes.content.detail)
app.post('/content/verify',routes.content.verify)


/**
* Start stretchfs store
* @param {function} done
*/
exports.start = function(done){
  server.listenAsync(+config.store.port,config.store.host)
    .then(function(){
      return httpServer.listenAsync(+config.store.httpPort,config.store.host)
    })
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
 * Stop stretchfs master
 * @param {function} done
 */
exports.stop = function(done){
  //dont wait for this since it will take to long and we are stopping now
  server.close()
  httpServer.close()
  listenServer.forEach(function(listen){
    listen.server.close()
  })
  //just return now
  process.nextTick(done)
}

if(require.main === module){
  worker(
    server,
    'stretchfs:' + config.store.name + ':worker',
    function(done){
      exports.start(done)
    },
    function(done){
      exports.stop(done)
    }
  )
}
