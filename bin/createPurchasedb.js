'use strict';
var program = require('commander')
var moment = require('moment')
var Password = require('node-password').Password

var purchasedb = require('../helpers/purchasedb')

var config = require('../config')

program
  .version(config.version)
  .option('-r, --replicate','Whether or not to setup replication $ -T -r')
  .option('-t, --token','Supply token to setup database from $ -t a20161202xxx')
  .option('-T, --tomorrow','Setup tomorrows database $ -T')
  .option('-z, --zone','Supply zone $ -z a')
  .option('-d, --date','Supply date, example $ -z a -d 20161202')
  .parse(process.argv)

var zone = program.zone || 'a'
var token = program.token || (zone + moment().format('YYYYMMDD'))

if(program.tomorrow)
  token = zone + moment().add(1,'d').format('YYYYMMDD')

if(program.date)
  token = zone + program.date

if(!token.match(/^[a-z]{1}[0-9]{8}$/))
  throw new Error('Invalid database token')

//now that we have the token we just add a random string
token = token + new Password({length: 11, special: false}).toString()

//next create the database
purchasedb.createDatabase(token,!!program.replicate)
  .then(function(){
    console.log('Database created')
    process.exit()
  })
