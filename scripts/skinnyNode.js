'use strict';
var P = require('bluebird')
var express = require('express')
var app = express()
var bodyParser = require('body-parser')
var debug = require('debug')('oose:skinnyNode')
var crypto = require('crypto')

var logger = require('../helpers/logger')


app.use(bodyParser.json())       // to support JSON-encoded bodies
app.use(bodyParser.urlencoded({     // to support URL-encoded bodies
  extended: true
}))

var https = require('https')
var fs = require('graceful-fs')
var config = require('./../config.js')
var myHost = 'localhost'

if(process.argv.length < 3){
  logger.log('info',
    'Usage : node ' + process.argv[1] + ' <name> <port> <peer_port>')
  process.exit(1)
}


var name = process.argv[2];
debug("Calling myself:" + name)
var peer = require('./../helpers/peer.js').getInstance(app,{
  name: name,
  host: myHost,
  port: process.argv[3],
  type: 'test',
  domain: 'test'
})


peer.onNewNode('skinnyNode',function(info){
  debug("New node arrived:" + info.node.name)
})

peer.onData('skinnyNode', function(info){
  debug("Data arrived from " + info.node.name , info.data)
})

peer.onNodeDown('skinnyNode', function(info){
  debug("Node is down: " + info.node.name)
})

var sslOptions = {
  key: fs.readFileSync(config.ssl.pem),
  cert: fs.readFileSync(config.ssl.pem)
}

var server = https.createServer(sslOptions,app)
P.promisifyAll(server)

server.listenAsync(+process.argv[3],myHost)
  .then(function(){
    debug('Listening started')
  })

if(process.argv[4]){
  debug('Announcing to node at port ' + process.argv[4])
  peer.announce({
    name: '',host: myHost,port: process.argv[4],type: 'test',domain: 'test'
  })
}


//Random data at random time

setInterval(function(){
  var date = new Date()
  var data = crypto.createHash('md5').update(date.getTime()+"").digest('hex')
  debug("Sending data:"+data)
  peer.sendData(data)
}, getRandomInt(10,20) * 1000)

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min)) + min;
}