'use strict';

var couch = require('../../helpers/couchbase')

console.log('Beginning initialization of Couchbase')
couch.createIndexes()
  .then(function(){
    console.log('Init complete')
  })
  .finally(function(){
    couch.disconnect()
    process.exit()
  })
  .catch(function(err){
    console.log(err)
    process.exit(1)
  })
