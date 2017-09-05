'use strict';
var P = require('bluebird')
var bodyParser = require('body-parser')
var express = require('express')
var fs = require('graceful-fs')
var https = require('https')
var worker = require('infant').worker

var redis = require('../helpers/redis')()

var app = express()
var config = require('../config')
var sslOptions = {
  key: fs.readFileSync(config.ssl.pem),
  cert: fs.readFileSync(config.ssl.pem)
}
var server = https.createServer(sslOptions,app)
var routes = require('./routes')
//make some promises
P.promisifyAll(server)

//setup
app.use(bodyParser.json({limit: '100mb'}))

//track requests
app.use(function(req,res,next){
  redis.incr(redis.schema.counter('store','requests'))
  next()
})

//home page
app.get('/',routes.index)
app.post('/',routes.index)

//health test
app.get('/ping',routes.ping)
app.post('/ping',routes.ping)

//stats
app.get('/stats',routes.stats)
app.post('/stats',routes.stats)

//content
app.get('/static/:hash/:file',routes.content.static)
app.get('/play/:token/:file',routes.content.play)


/**
* Start oose Send
* @param {function} done
*/
exports.start = function(done){
  server.listenAsync(+config.send.port,config.send.host)
    .then(function(){
      done()
    })
}


/**
 * Stop oose master
 * @param {function} done
 */
exports.stop = function(done){
  //dont wait for this since it will take to long and we are stopping now
  server.close()
  //just return now
  process.nextTick(done)
}

if(require.main === module){
  worker(
    server,
    'oose:' + config.store.name + ':worker',
    function(done){
      exports.start(done)
    },
    function(done){
      exports.stop(done)
    }
  )
}
