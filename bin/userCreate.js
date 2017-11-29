'use strict';
var bcrypt = require('bcrypt')

var couch = require('../helpers/couchbase')

var name = process.argv[2]
var secret = process.argv[3]

console.log('Create user ' + name)
var cb = couch.stretchfs()
var userKey = couch.schema.user(name)
var user = {
  name: name,
  secret: bcrypt.hashSync(
    secret,bcrypt.genSaltSync(12)),
  createdAt: new Date().toJSON(),
  roles: ['create','read','update','delete']
}
cb.upsertAsync(userKey,user)
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
