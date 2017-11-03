'use strict';

var couch = require('../helpers/couchbase')

console.log('Creating Couchbase Buckets')
couch.createBuckets()
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
