'use strict';
var config = require('../config')
  , logger = require('../helpers/logger')
  , program = require('commander')
  , os = require('os')
  , ds = require('diskspace')
  , bencode = require('bencode')
  , dgram = require('dgram')
  , path = require('path')

//setup server side (listener)
var server = dgram.createSocket('udp4')
server.on('message',function(buf){
  var announce = bencode.decode(buf)
  //ignore ourselves
  if(announce.hostname.toString() === config.get('hostname')) return
  if(program.verbose){
    logger.info(
      announce.hostname +
        ' posted a announce' +
        ' at ' + announce.sent +
        ':[' +
        'load:' + announce.load +
        '/' +
        'free:' + announce.free / 1024 +
        ']'
    )
  }
})
server.bind(config.get('serve.port'),function(){
  server.addMembership(config.get('mesh.address'))
  server.setMulticastTTL(config.get('mesh.ttl'))
})

//setup client side (announcer)
var client = dgram.createSocket('udp4')
client.bind(function(){
  client.addMembership(config.get('mesh.address'))
  client.setMulticastTTL(config.get('mesh.ttl'))
})

var cpuAverage = function(){
  var totalIdle = 0
    , totalTick = 0
  var cpus = os.cpus()
  for(var i=0,len=cpus.length; i<len; i++){
    for(var type in cpus[i].times) totalTick += cpus[i].times[type]
    totalIdle += cpus[i].times.idle
  }
  return {idle: totalIdle / cpus.length,  total: totalTick / cpus.length}
}
var lastMeasure = cpuAverage()
var getLoad = function(cb){
  setTimeout(function(){
    var thisMeasure = cpuAverage()
    var percentageCPU = 100 - ~~(100 * (thisMeasure.idle - lastMeasure.idle) / (thisMeasure.total - lastMeasure.total))
    lastMeasure = thisMeasure
    cb(percentageCPU)
  },100)
}

var sendAnnounce = function(){
  var message = {}
  getLoad(function(load){
    message.hostname = config.get('hostname')
    message.load = load
    var spacepath = path.resolve(config.get('serve.dataRoot'))
    if('win32' === os.platform()) spacepath = spacepath.substr(0,1)
    ds.check(spacepath,function(total,free){
      message.free = parseInt(free,10) || 0
      message.sent = new Date().getTime()
      console.log(message)
      var buf = bencode.encode(message)
      client.send(buf,0,buf.length,config.get('serve.port'),config.get('mesh.address'))
      setTimeout(sendAnnounce,config.get('mesh.interval'))
    })
  })
}

sendAnnounce()