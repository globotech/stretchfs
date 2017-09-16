'use strict';
var P = require('bluebird')
//var debug = require('debug')('helper:FileOp')
var ObjectManage = require('object-manage')
var oose = require('oose-sdk')
var random = require('random-js')()
var prettyBytes = require('pretty-bytes')

var config = require('../config')

var couchdb = require('./couchbase')
var redis = require('../helpers/redis')()



/**
 * @constructor
 * @param {FILE_RECORD} file - File record to be processed
 * @param {Array=} opt_peerList - Cached list of peers
 * @return {FileOp}
 */
var FileOp = function(file,opt_peerList){
  this.file = file
  //store our snapshot of a peerList
  this.peerList = opt_peerList || []
  //populate properties
  this.action = this.FILE_ACTIONS.nop
  this.repeat = 0
  this.source = ''
  this.destination = ''
  return this
}


/**
 * Valid file actions
 * @enum {string} FILE_ACTIONS
 */
FileOp.prototype.FILE_ACTIONS = {
  'nop': 0,
  'stat': 1,
  'copy': 2,
  'verify': 3,
  'unlink': 4
}
/**
 * FileOp record structure
 * @typedef {Object} FileOp {{
 * file:FILE_RECORD,
 * peerList:array,
 * action:FILE_ACTIONS,
 * source:string,
 * destination:string
 * }}
 */


/**
 * Select a peer of type, optionally by name as well
 *
 * @param {PEER_TYPES} type - Peer type filter. Must be an enumerated
 * value of {@link PEER_TYPES}.
 * @param {string=} opt_peerName - Peer name for further filtering
 * @return {PEER_RECORD}
 */
FileOp.prototype.selectPeer = function(type,opt_peerName){
  var that = this
  if(!type) type = couchdb.schema.PEER_TYPES.store
  var result = {}
  that.peerList.forEach(function(peer){
    if(peer.type !== type || peer.name !== opt_peerName) return
    result = peer
  })
  return result
}


/**
 * Setup an API request object to target store
 *
 * @param {string} store - Peer name
 * @return {request}
 */
FileOp.prototype.setupStore = function(store){
  var opts = new ObjectManage()
  opts.$load(config.store)
  opts.$load(store)
  opts = opts.$strip()
  return oose.api.setupAccess('store',opts)
}


/**
 * Set the peerList for this FileOp
 *
 * @param {Array} peerList - Peer list
 */
FileOp.prototype.setPeerList = function(peerList){
  this.peerList = peerList
}


/**
 * Add clones per the instructions in FileOp
 * @return {Promise} Chain of promises that accomplish the objective
 */
FileOp.prototype.addClones = function(){
  var that = this
  var promises = []
  var storeWinnerList = []
  var addClone = function(file){
    // so to create a clone we need to figure out a source store
    var startStamp = +new Date()
    var prismFromWinner
    var storeFromWinner
    var prismToWinner
    var storeToWinner
    var storeFromList =[]
    var storeToList = []
    //iteration vars
    var prismNameList = []
    var storeNameList = []
    file.map.forEach(function(entry){
      var parts = entry.split(':')
      var prismName = parts[0]
      var storeName = parts[1]
      prismNameList.push(prismName)
      storeNameList.push(storeName)
      storeFromList.push({prism: prismName, store: storeName})
    })
    // randomly select one source store
    storeFromWinner = storeFromList[
      random.integer(0,(storeFromList.length - 1))]
    prismFromWinner = storeFromWinner.prism
    // figure out a destination store
    that.peerList.forEach(function(peer){
      //skip prisms and whatever else
      if(couchdb.schema.PEER_TYPES.store !== peer.type) return
      if(
        -1 === storeWinnerList.indexOf(peer.name) &&
        -1 === file.map.indexOf(peer.prism + ':' + peer.name) &&
        true === peer.available &&
        true === peer.writable
      ){
        storeToList.push({prism: peer.prism, store: peer.name})
      }
    })
    //make sure there is a possibility of a winner
    if(!storeToList.length){
      console.error(file.hash,
        'Sorry! No more available stores to send this to :(')
    } else {
      //figure out a dest winner
      storeToWinner = storeToList[
        random.integer(0,(storeToList.length - 1))]
      storeWinnerList.push(storeToWinner.store)
      prismToWinner = storeToWinner.prism
      //inform of our decision
      console.log(file.hash,
        'Sending from ' + storeFromWinner.store +
        ' on prism ' + prismFromWinner +
        ' to ' + storeToWinner.store + ' on prism ' + prismToWinner)
      var storeFromInfo = that.selectPeer(
        couchdb.schema.PEER_TYPES.store,
        storeFromWinner.store
      )
      var sendClient = that.setupStore(storeFromInfo)
      var sendOptions = {
        file: file.hash + '.' + file.mimeExtension.replace('.',''),
        store: storeToWinner.prism + ':' + storeToWinner.store
      }
      return sendClient.postAsync({
        url: sendClient.url('/content/send'),
        json: sendOptions
      })
        .spread(function(res,body){
          if(body.error){
            var err = new Error(body.error)
            err.stack = body.stack
            throw err
          } else {
            var endStamp = +new Date()
            var fileSize = 1024
            if(body && body.fileDetail &&
              body.fileDetail.stat && body.fileDetail.stat.size){
              fileSize = body.fileDetail.stat.size
            }
            var duration = (endStamp - startStamp) / 1000
            var rate = (((fileSize) / duration) / 1024).toFixed(2)
            console.log(file.hash,
              'Sent ' + prettyBytes(fileSize) + ' to ' + storeToWinner.store +
              ' taking ' + duration +
              ' seconds averaging ' + rate + '/KBs, success!')
          }
        })
        .catch(function(err){
          console.error(file.hash,
            'Failed to send clone to ' + storeToWinner.store,err.message)
        })
        .finally(function(){
          var existsKey = couchdb.schema.inventory(file.hash)
          redis.del(existsKey)
        })
    }
  }
  for(var i = 0; i < that.repeat; i++){
    promises.push(addClone(that.file))
  }
  return P.all(promises)
}


/**
 * Remove clones per the instructions in FileOp
 * @return {Promise} Chain of promises that accomplish the objective
 */
FileOp.prototype.removeClones = function(){
  var that = this
  var promises = []
  var storeWinnerList = []
  var removeClone = function(file){
    // so to create a clone we need to figure out a source store
    var storeRemoveWinner
    var storeRemoveList = []
    //iteration vars
    var prismNameList = []
    var storeNameList = []
    file.map.forEach(function(entry){
      var parts = entry.split(':')
      var prismName = parts[0]
      var storeName = parts[1]
      if(-1 === config.clonetool.storeProtected.indexOf(storeName)){
        var peer = that.selectPeer(couchdb.schema.PEER_TYPES.store,storeName)
        prismNameList.push(prismName)
        storeNameList.push(storeName)
        if((true === peer.available) &&
          (-1 === storeWinnerList.indexOf(storeName))
        ){
          storeRemoveList.push({prism: prismName,store: storeName})
        } else console.log(file.hash,'Unavailable on ' + storeName)
      } else console.log(file.hash,'Protected on ' + storeName)
    })
    //make sure there is a possibility of a winner
    if(!storeRemoveList.length){
      console.error(file.hash,
        'Sorry! No available/unprotected stores to remove this from.')
    } else {
      // now we know possible source stores, randomly select one
      storeRemoveWinner = storeRemoveList[
        random.integer(0,(storeRemoveList.length - 1))]
      storeWinnerList.push(storeRemoveWinner.store)
      //inform of our decision
      console.log(file.hash,
        'Removing from ' + storeRemoveWinner.store +
        ' on prism ' + storeRemoveWinner.prism)
      var selectedStoreInfo = that.selectPeer(
        couchdb.schema.PEER_TYPES.store,
        storeRemoveWinner.store
      )
      var storeClient = that.setupStore(selectedStoreInfo)
      return storeClient.postAsync({
        url: storeClient.url('/content/remove'),
        json: {
          hash: file.hash
        }
      })
        .spread(storeClient.validateResponse())
        .catch(function(err){
          console.error(file.hash,'Failed to remove clone',err.message)
        })
        .finally(function(){
          var existsKey = couchdb.schema.inventory(file.hash)
          redis.del(existsKey)
        })
    }
  }
  for(var i = 0; i < that.repeat; i++){
    promises.push(removeClone(that.file))
  }
  return P.all(promises)
}


/**
 * Verify clones per the instructions in FileOp
 * @return {Promise} Chain of promises that accomplish the objective
 */
FileOp.prototype.verifyFile = function(){
  var that = this
  var file = that.file
  //first grab a store to ask for info
  if(!file.count || !file.exists || !(file.map instanceof Array)){
    console.error(file.hash,'Doesn\'t exist, can\'t verify')
    return P.try(function(){})
  }
  return P.try(function(){
    return file.map
  })
    .map(function(storeKey){
      var keyParts = storeKey.split(':')
      var storeInfo = that.selectPeer(
        couchdb.schema.PEER_TYPES.store,
        keyParts[1]
      )
      var storeClient = that.setupStore(storeInfo)
      return storeClient.postAsync({
        url: storeClient.url('/content/verify'),
        json: {
          file: file.hash + '.' + ('' + file.mimeExtension).replace('.','')
        }
      })
        .spread(function(res,body){
          if(body && body.error){
            console.error(file.hash,'Verify failed ' + body.error +
              ' on ' + keyParts[1] + ' inventory purged')
          } else if(body && 'ok' === body.status){
            console.log(file.hash,
              'Inventory verification complete on ' + keyParts[1])
          } else if(body && 'fail' === body.status){
            console.error(file.hash,
              'Invalid content on ' + keyParts[1] + ' clone removed')
          } else {
            console.error(file.hash,'Unknown issue',body)
          }
        })
        .catch(function(err){
          console.error(file.hash,'Failed to verify inventory',err.message)
        })
        .finally(function(){
          var existsKey = couchdb.schema.inventory(file.hash)
          redis.del(existsKey)
        })
    })
}


/**
 * Directly clone per the instructions in FileOp
 * @return {Promise} Chain of promises that accomplish the objective
 */
FileOp.prototype.cloneFile = function(){
  var that = this
  var file = that.file
  //first grab a store to ask for info
  if(!file.count || !file.exists || !(file.map instanceof Array)){
    console.error(file.hash,'Doesn\'t exist, cannot clone')
    return P.try(function(){})
  }
  return P.try(function(){
    return file.map[random.integer(0,file.map.length - 1)]
  })
    .then(function(storeKey){
      var keyParts = storeKey.split(':')
      var storeFromInfo = that.selectPeer(
        couchdb.schema.PEER_TYPES.store,
        keyParts[1]
      )
      var storeToInfo = that.selectPeer(
        couchdb.schema.PEER_TYPES.store,
        that.destination
      )
      var storeFromClient = that.setupStore(storeFromInfo)
      var sendOptions = {
        file: file.hash + '.' + file.mimeExtension.replace('.',''),
        store: storeToInfo.prism + ':' + storeToInfo.name
      }
      return storeFromClient.postAsync({
        url: storeFromClient.url('/content/send'),
        json: sendOptions
      })
        .spread(function(res,body){
          if(body.error){
            var err = new Error(body.error)
            err.stack = body.stack
            throw err
          } else {
            console.log(file.hash,
              'Send from ' + storeFromInfo.name +
              ' to ' + storeToInfo.name + ' complete')
          }
        })
        .catch(function(err){
          console.error(file.hash,
            'Failed to send clone to ' + storeToInfo.store,err.message)
        })
        .finally(function(){
          var existsKey = couchdb.schema.inventory(file.hash)
          redis.del(existsKey)
        })
    })
}


/**
 * Directly remove per the instructions in FileOp
 * @return {Promise} Chain of promises that accomplish the objective
 */
FileOp.prototype.removeFile = function(){
  var that = this
  var file = that.file
  //first grab a store to ask for info
  if(!file.count || !file.exists || !(file.map instanceof Array)){
    console.error(file.hash,'Doesn\'t exist, cannot remove')
    return P.try(function(){})
  }
  return P.try(function(){
    var storeInfo = that.selectPeer(
      couchdb.schema.PEER_TYPES.store,
      that.source
    )
    var storeClient = that.setupStore(storeInfo)
    return storeClient.postAsync({
      url: storeClient.url('/content/remove'),
      json: {
        hash: file.hash
      }
    })
      .spread(function(res,body){
        if(body.error){
          var err = new Error(body.error)
          err.stack = body.stack
          throw err
        } else {
          console.log(file.hash,'Remove from ' + storeInfo.name + ' complete')
        }
      })
      .catch(function(err){
        console.error(file.hash,
          'Failed to remove clone from ' + storeInfo.store,err.message)
      })
      .finally(function(){
        var existsKey = couchdb.schema.inventory(file.hash)
        redis.del(existsKey)
      })
  })
}


/**
 * Export class
 * @param {object} options
 * @return {function} constructor
 */
module.exports = FileOp
