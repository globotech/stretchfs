'use strict';
var P = require('bluebird')
var bodyParser = require('body-parser')
var express = require('express')
var fs = require('graceful-fs')
var https = require('https')
var worker = require('infant').worker
var userSessionValidate = require('../helpers/userSessionValidate')

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

//setup view enging
app.set('trust proxy',true)

//home page
app.post('/',routes.index)
app.get('/',routes.index)

//health test
app.post('/ping',routes.ping)
app.get('/ping',routes.ping)

app.post('/login',routes.login)
app.post('/logout',routes.logout)

//job functions (protect this one to prevent scanning)
app.post('/job/content/exists',
  userSessionValidate,
  routes.job.contentExists
)
app.get('/job/content/download/:handle/:file',routes.job.contentDownload)


/**
* Start shredder worker
* @param {function} done
*/
exports.start = function(done){
  server.listenAsync(+config.worker.port,config.worker.host)
    .then(function(){
      done()
    })
}


/**
 * Stop shredder worker
 * @param {function} done
 */
exports.stop = function(done){
  //dont wait for this since it will take to long and we are stopping now
  server.close()
  //just return now
  done()
}

if(require.main === module){
  worker(
    server,
    'shredder:' + config.worker.name + ':worker',
    function(done){
      exports.start(done)
    },
    function(done){
      exports.stop(done)
    }
  )
}
