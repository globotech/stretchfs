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
    console.log('Bucket creation complete, waiting 5 seconds')
    return new P(function(resolve){
      setTimeout(resolve,5000)
    })
  })
  .then(function(){
    console.log('Creating user')
    return couch.createUser(config.couch.username,config.couch.password,roles)
  })
  .then(function(){
    console.log('User creation complete')
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
