'use strict';

var couch = require('../helpers/couchbase')

var username = process.argv[2]
var password = process.argv[3]

if(!username || !password)
  throw new Error('Couchbase Administrator username and password required')

console.log('Creating Couchbase Buckets')
couch.createBuckets(username,password)
  .then(function(){
    console.log('Bucket creation complete')
  })
  .finally(function(){
    couch.disconnect()
    process.exit()
  })
  .catch(function(err){
    console.log(err)
    process.exit(1)
  })
