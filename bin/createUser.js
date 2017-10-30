'use strict';

var couch = require('../helpers/couchbase')

var name = process.argv[2]
var secret = process.argv[3]

console.log('Create user ' + name + ' with secret ' + secret)
var couchOOSE = couch.oose()
var userKey = couch.schema.ooseUser(name)
var user = {
  name: name,
  secret: secret,
  roles: ['create','read','update','delete']
}
couchOOSE.upsertAsync(userKey,user)
  .then(function(){
    console.log('User ' + name + ' created!')
  })
  .finally(function(){
    couch.disconnect()
    process.exit()
  })
  .catch(function(err){
    console.log(err)
    process.exit(1)
  })
