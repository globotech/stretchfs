'use strict';
var P = require('bluebird')

var api = require('../helpers/api')
var NotFoundError = require('../helpers/NotFoundError')


/**
 * Pick a winner from a prism list
 * @param {Array} storeList
 * @param {Array} skip
 * @return {P}
 */
exports.winner = function(storeList,skip){
  if(!(skip instanceof Array)) skip = []
  if(!(storeList instanceof Array)) storeList = []
  var winner = false
  var store
  for(var i = 0; i < storeList.length; i++){
    store = storeList[i]
    if(-1 !== skip.indexOf(store.name)) continue
    if(!winner){
      winner = store
      continue
    }
    if(winner.hits > store.hits){
      winner = store
    }
  }
  return P.try(function(){
    if(!winner) return false
    return api.master.post('/store/increment-hits',{name: winner.name})
      .spread(function(){
        return winner
      })
  })
}


/**
 * Take an existence map and turn it into an array of store instances
 * @param {object} exists
 * @param {Array} skip
 * @return {Array}
 */
exports.existsToArray = function(exists,skip){
  if(!(skip instanceof Array)) skip = []
  var i, k
  var stores = []
  var prism, store, sk
  var pk = Object.keys(exists.map)
  for(i = 0; i < pk.length; i++){
    prism = exists.map[pk[i]]
    sk = Object.keys(prism.map)
    for(k = 0; k < sk.length; k++){
      store = prism.map[sk[k]]
      if(store && -1 === skip.indexOf(sk[k])) stores.push(sk[k])
    }
  }
  return stores
}


/**
 * Populate stores from array of names
 * @param {Array} stores
 * @return {P}
 */
exports.populateStores = function(stores){
  var result = []
  var populate = function(res,body){
    result.push(body)
  }
  var promises = []
  var store
  for(var i = 0; i < stores.length; i++){
    store = stores[i]
    promises.push(
      api.master.post('/store/find',{name: store}).spread(populate)
    )
  }
  return P.all(promises)
    .then(function(){
      return result
    })
}


/**
 * Take the result of an existence check and pick a winner
 * @param {object} exists
 * @param {Array} skip
 * @return {P}
 */
exports.winnerFromExists = function(exists,skip){
  var candidates = exports.existsToArray(exists,skip)
  var winner
  if(!candidates.length) throw new NotFoundError('No store candidates found')
  return exports.populateStores(candidates)
    .then(function(results){
      var store
      for(var i = 0; i < results.length; i++){
        store = results[i]
        if(!winner){
          winner = store
          continue
        }
        if(store.hits < winner.hits){
          winner = store
        }
      }
      return api.master.post('/store/increment-hits',{name: winner.name})
    })
    .spread(function(res,body){
      return body
    })
}
