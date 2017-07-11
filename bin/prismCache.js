'use strict';
var clc = require('cli-color')
var program = require('commander')
var Table = require('cli-table')

var api = require('../helpers/api')
var logger = require('../helpers/logger')

var config = require('../config')

var prism = api.prism(config.prism)

var commandList = [
  'all',
  'session',
  'stats',
  'prismHits',
  'storeHits'
]

program
  .version(config.version)
  .option('-c, --command <s>','Cache command')
  .option('-l, --list','List commands')
  .option('-D, --detail','Detail of the command')
  .option('-F, --flush','Flush cache of the command')
  .parse(process.argv)

if(program.list){
  logger.log('info','Command list')
  commandList.forEach(function(command){
    logger.log('info', '  ' + command)
  })
  process.exit()
}

if(!program.command){
  logger.log('info','No command provided')
  process.exit()
}

if(program.detail){
  prism.postAsync({
    url: prism.url('/cache/detail'),
    json: {
      command: program.command
    }
  })
    .spread(prism.validateResponse())
    .spread(function(res,body){
      var table = new Table()
      var keys = Object.keys(body)
      var key, value
      for(var i = 0; i < keys.length; i++){
        key = keys[i]
        value = body[key]
        table.push({key: value})
      }
      logger.log('info', table.toString())
      logger.log('info', '  ' + clc.cyan(keys.length) + ' Total records')
      process.exit()
    })
}

if(program.flush){
  prism.postAsync({
    url: prism.url('/cache/flush'),
    json: {
      command: program.command
    }
  })
    .spread(prism.validateResponse())
    .spread(function(res,body){
      logger.log('info', '  Success! ' +
        clc.cyan(body.count) + ' records flushed.')
      process.exit()
    })
}
