'use strict';
var P = require('bluebird')

//list of valid roles
var roleList = [
  'active',
  'online',
  'read',
  'write'
]


/**
 * Provide the ruleSet to client side
 * @return {object} ruleSet with key as ruleName and value as ruleDataType
 */
exports.roleList = function(){
  return P.try(function(){return roleList.sort()})
}


/**
 * Helper for Updating Roles
 * @param {array} roles
 * @param {object} formData
 * @return {P}
 */
exports.roleUpdate = function(roles,formData){
  var rv = Array.isArray(roles) ? roles : []
  formData = ('object' === typeof formData) ? formData : {}
  roleList.forEach(function(v){
    var formVal = !!formData['role_'+v]
    if(-1 !== rv.indexOf(v)){
      if(!formVal){
        //Role exists but checkbox said remove...
        rv = rv.filter(function(s){
          return v !== s
        })
      }
    } else {
      if(formVal){
        //Role doesn't exist but checkbox said add it...
        rv.push(v)
      }
    }
  })
  return rv
}
