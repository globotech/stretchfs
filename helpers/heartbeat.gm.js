'use strict';
var P = require('bluebird')
var extend = require('util')._extend
var oose = require('oose-sdk')

var NetworkError = oose.NetworkError

var api = require('../helpers/api')
var couchdb = require('../helpers/couchdb')
var prismBalance = require('../helpers/prismBalance')
var redis = require('../helpers/redis')()
var storeBalance = require('../helpers/storeBalance')

var config = require('../config')
var debug = null
var instance = null
var interval = null
var voteLog = {}



/**
 * Heartbeat for Cluster Consistency
 * @param {string} type
 * @param {string} name
 * @constructor
 */
var Heartbeat = function(type,name){
  //var that = this
  //var myDesc = type+':'+name+':'+port
  var checkCounter = 0
  //var interval = null
  var storeList = null
  var prismList = null
  var pingList = null
  var prismName = (type==='prism') ? name : config.prism.name

  var collectPrismList = function(){
    return prismBalance.prismList()
      .then(function(prisms){
        debug('got prism list, record count?',prisms.length)
        prismList = []
        var strPrismList = JSON.stringify(prisms)

        if(prisms.length){
          for(var i = 0; i<prisms.length; i++){
            var tmpPrism = extend({},prisms[i])
            tmpPrism.request = api.prism(tmpPrism)
            tmpPrism.type = 'prism'
            prismList.push(tmpPrism)
          }
        }
        return redis.setAsync(redis.schema.prismList(),strPrismList)
        //return prismList
      })
      .catch(function(err){
        debug(err)
      })
  }

  var collectStoreList = function(){
    var srvStoreList
    return storeBalance.storeList(prismName)
      .then(function(stores){
        debug('got store list, record count?',stores.length)
        storeList = []
        srvStoreList = stores
        if(stores.length){
          for(var i = 0; i<stores.length; i++){
            var tmpStore = extend({},stores[i])
            tmpStore.request = api.store(tmpStore)
            tmpStore.type = 'store'
            storeList.push(tmpStore)
          }
        }
        return redis.setAsync(
          redis.schema.storeList(),
          JSON.stringify(srvStoreList)
        )
      })
      .then(function(){
        var promises = []
        var store
        for(var i = 0; i < srvStoreList.length; i++){
          store = srvStoreList[i]
          promises.push(
            redis.setAsync(redis.schema.storeEntry(store.name),
              JSON.stringify(store))
          )
        }
        return P.all(promises)
      })
      .catch(NetworkError,function(err){
        //continue as normal on a network error
        debug('network error',err)
      })
  }

  var collect = function(){
      return P.all([
        collectPrismList(),
        collectStoreList()
      ])
      .catch(NetworkError,function(err){
        //continue as normal on a network error
        debug('network error',err)
      })
  }

  var downVote = function(host){
    //var downHost = extend({},host)
    var key = (host.type === 'prism') ?
      couchdb.schema.prism(host.name) :
      couchdb.schema.store(host.prism,host.name)

    var downKey = couchdb.schema.downVote(host.name)
    var myDownKey = couchdb.schema.downVote(host.name, name)
    debug('DOWNVOTING: '+key)
    var currentVoteLog = null
    var hostInfo = null
    //if(downHost.request) delete(downHost.request)
    return couchdb.heartbeat.getAsync(key)
      .then(function(node){
        //got the node
        if(!(node.available && node.active)) throw new Error('Already down')
        hostInfo = node
        return couchdb.heartbeat.allAsync(
          {startkey: downKey, endkey: downKey + '\uffff'})
      }).then(function(vL){
        currentVoteLog = vL
        for(var i=0; i< vL.length; i++){
          if(vL[i].key === myDownKey) {
            debug('Already recorded')
            return false
          }
        }
        return couchdb.heartbeat.saveAsync(myDownKey,{date:Date.now()})
      },function(err){
        if(!err.headers)throw err
        if(404 !== err.headers.status) throw err
        currentVoteLog = []
        return couchdb.heartbeat.saveAsync(myDownKey,{date:Date.now()})
      }).then(function(myVote){
        if(myVote !== false)
          currentVoteLog.push(myVote)
        var count = pingList.length
        var votes = currentVoteLog.length
        if(count === 0 || votes < (count/2))throw new Error('Ok, got it')
        hostInfo.available = false
        return couchdb.heartbeat.saveAsync(key,hostInfo._rev,hostInfo)
      }).then(function(){
        //Delete the vote log, it has served its purpose
        var promises = []
        //Added reflect() to avoid a race condition.
        for(var i = 0; i<currentVoteLog.length; i++)
          promises.push(couchdb.heartbeat.removeAsync(
            currentVoteLog[i].key,currentVoteLog[i]._rev).reflect())
        return P.all(promises)
      }).catch(function(err){
        debug(err.message)
      })
  }

  var pingHost = function(host){
    debug('Pinging ' + host.name + '>>' + host.request.url('/ping'))
    return host.request.postAsync(host.request.url('/ping')+'')
      .spread(function(res,body){
        if(body && body.pong && 'pong' === body.pong){
          voteLog[host.name] = 0
          return true
        }else{
          voteLog[host.name] = (voteLog[host.name] !== undefined) ?
            voteLog[host.name] + 1 : 1
          return (voteLog[host.name] > config.heartbeat.retries) ?
            downVote(host) : true
        }
      })
      .catch(function(err){
        debug(err)
        voteLog[host.name] = (voteLog[host.name] !== undefined) ?
          voteLog[host.name] + 1 : 1
        return (voteLog[host.name] > config.heartbeat.retries) ?
          downVote(host) : true
      })
  }

  var pingAll = function(){
    var promises = []
    if(pingList && pingList.length){
      for(var i =0; i < pingList.length;i++){
        promises.push(pingHost(pingList[i]));
      }
    }/*
    if(storeList && storeList.length){
      for(var j =0; j < storeList.length;j++){
        promises.push(pingHost(storeList[j]));
      }
    }*/
    return P.all(promises)
  }

  var markMeUp = function(){
    debug('Marking myself up')
    var key = (type === 'prism') ?
      couchdb.schema.prism(prismName) : couchdb.schema.store(prismName,name)
    //The key used to track downvotes against me :(
    var downKey = couchdb.schema.downVote(name)
    return couchdb.heartbeat.getAsync(key)
      .then(function(node){
        node.available = true
        node.active = true
        return couchdb.heartbeat.saveAsync(key,node._rev,node)
      }).then(function(){
        //Time to delete the downvote log
        return couchdb.heartbeat.allAsync(
          {startkey: downKey, endkey: downKey + '\uffff'})
      }).then(function(votelog){
        //Delete the vote log, it has served its purpose
        var promises = []
        //Added reflect() to avoid a race condition.
        for(var i = 0; i < votelog.length; i++)
          promises.push(couchdb.heartbeat.removeAsync(
            votelog[i].key,votelog[i]._rev).reflect())
        return P.all(promises)
      }).catch(function(err){
        debug(err.mesage)
      })
  }

  var checkSystem = function(){
    if((checkCounter++ % 5) === 0){
      checkCounter = 1
      var allNodes = []
      return collect().then(function(){
          allNodes = allNodes.concat(storeList,prismList)
          return P.filter(allNodes,function(node){
            return (node.name !== name || node.type !== type)
          })
        }).then(function(filteredNodes){
          pingList = filteredNodes
          //This host was filtered out, no need to enable again
          if(pingList.length !== allNodes.length)
            return pingAll()
          return markMeUp().then(function(){
            pingAll()
          })

        }).catch(NetworkError,function(err){
          //continue as normal on a network error
          debug('network error',err)
        })
    }
    else{
      return pingAll()
    }
  }

  var createInterval = function(){
    interval = setInterval(function(){
      return checkSystem()
    },+config.heartbeat.frequency || 10000)
  }

  //this will start the heartbeat automatically
  createInterval()
}


/**
 * Return instance of Heartbeat handler, singleton
 * @param {string} type
 * @param {string} name
 * @param {number} port
 * @return {instance}
 */
exports.getInstance = function(type,name,port){
  if(!instance){
    debug = require('debug')('oose:ping:'+type)
    instance = new Heartbeat(type,name,port)
  }
  return instance
}
