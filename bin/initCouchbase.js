'use strict';

var couch = require('../helpers/couchbase')

console.log('Beginning initialization of Couchbase')
couch.init(couch)
  .then(function(){
    console.log('Init complete')
    process.exit()
  })
  .catch(function(err){
    console.log(err)
    process.exit(1)
  })
