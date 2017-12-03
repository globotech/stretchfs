'use strict';
var P = require('bluebird')

var couch = require('../../helpers/couchbase')
var isArray = function(o){
  return (('object' === typeof o) && Array.isArray(o))
}
var isSame = function(a,b){
  return (a === b) &&
    (a !== 0 || 1 / a === 1 / b) || // false for +0 vs -0
    (a !== a && b !== b) // true for NaN vs NaN
}


/**
 * Helper for Form Submit Diffing
 * @param {object} req
 * @param {object} res
 * @param {object} cb
 * @param {string} type
 * @param {object} identifier
 * @param {object} fields Fields to process
 * @return {P}
 */
exports.diff = function(
  req,res,
  cb,type,identifier,
  fields
){
  var form = req.body
  var keyTag = Object.keys(identifier)[0]
  var keyName = identifier[keyTag]
  var key = couch.schema[type](keyName)
  var doc = {}
  var updated = false
  var timestamp = new Date().toJSON()
  return cb.getAsync(key)
    .then(function(result){
      doc = result.value
      if(!doc) doc = {createdAt: timestamp}
      if(doc.roles){ doc.roles = doc.roles.sort() }
      if(doc.group){ doc.roles = doc.group.sort() }
      var docTypes = {}
      var formTypes = {}
      fields.forEach(function(k){
        docTypes[k] = (typeof doc[k])
        formTypes[k] = (typeof form[k])
        if('string' === formTypes[k]){
          switch(docTypes[k]){
          case 'object':
            form[k] = JSON.parse(form[k])
            formTypes[k] = (typeof form[k])
            break;
          case 'number':
            form[k] = parseInt(form[k],10)
            formTypes[k] = (typeof form[k])
            break;
          }
        }
        if('object' === formTypes[k]){
          if((isArray(form[k])) && (isArray(doc[k]))){
            if(!(
                (doc[k].length === form[k].length) &&
                (doc[k].every(function(u,i){
                  return isSame(u,form[k][i])
                }))
              )){
              doc[k] = form[k]
              updated = true
            }
          }
        } else {
          if((form[k]) && (doc[k] !== form[k])){
            doc[k] = form[k]
            updated = true
          }
        }
      })
      if(updated){ doc.updatedAt = timestamp }
      console.log(updated,doc,form)
      updated=false // for testing, stops actual DB saves
      if(updated){
        return cb.upsertAsync(key,doc,{cas: result.cas})
      } else {
        return P.try(function(){return updated})
      }
    })
    .then(function(updated){
      var alert = {
        subject: type.charAt(0).toUpperCase() + type.substr(1),
        href: '/'+type+'/edit?'+keyTag+'=' + keyName,
        id: keyName
      }
      if(false !== updated){
        alert.action = 'saved'
        req.flashPug('success','subject-id-action',alert)
      } else {
        alert.action = 'unchanged (try again?)'
        req.flashPug('warning','subject-id-action',alert)
      }
      res.redirect('/'+type+'/list')
    })
    .catch(function(err){
      res.render('error',{error: err})
    })
}
