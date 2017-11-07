'use strict';
var P = require('bluebird')

var couch = require('../../helpers/couchbase')

var config = require('../../config')

console.log('Beginning Couchbase setup')
console.log('Creating Couchbase Buckets')
var roles = []
couch.createBuckets()
  .then(function(result){
    roles = result
    console.log('Bucket creation complete')
    console.log('Creating user')
    return couch.createUser(config.couch.username,config.couch.password,roles)
  })
  .then(function(){
    var waitSeconds = 5
    if(process.env.TRAVIS) waitSeconds = 60
    console.log('User creation complete, waiting ' + waitSeconds + ' seconds')
    return new P(function(resolve){
      setTimeout(resolve,waitSeconds * 1000)
    })
  })
  .then(function(){
    console.log('Creating indexes ')
    return couch.createIndexes()
  })
  .then(function(){
    console.log('Index creation complete')
  })
  .catch(function(err){
    console.log(err)
    process.exit(1)
  })
  .finally(function(){
    console.log('Couchbase setup complete, run this again any time')
    couch.disconnect()
    process.exit()
  })
