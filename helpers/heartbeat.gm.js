'use strict';
var P = require('bluebird')
var extend = require('util')._extend
var oose = require('oose-sdk')

var NetworkError = oose.NetworkError

var api = require('../helpers/api')
var couch = require('./couchbase')
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
            tmpPrism.request = api.setupAccess('prism',tmpPrism)
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
            tmpStore.request = api.setupAccess('store',tmpStore)
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
      couch.schema.prism(host.name) :
      couch.schema.store(host.prism,host.name)

    var downKey = couch.schema.downVote(host.name)
    var myDownKey = couch.schema.downVote(host.name, name)
    debug('DOWNVOTING: '+key)
    var currentVoteLog = null
    var hostInfo = null
    //if(downHost.request) delete(downHost.request)
    return couch.heartbeat.getAsync(key)
      .then(function(result){
        var node = result.value
        //got the node
        if(!(node.available && node.active)) throw new Error('Already down')
        hostInfo = node
        var qstring = 'SELECT * FROM ' +
          couch.getName(couch.type.HEARTBEAT,true) + ' b ' +
          'WHERE META(b).id LIKE $1'
        var query = couch.N1Query.fromString(qstring)
        downKey = downKey + '%'
        return couch.heartbeat.queryAsync(query,[downKey])
      }).then(function(vL){
        currentVoteLog = vL
        for(var i=0; i< vL.length; i++){
          if(vL[i].key === myDownKey) {
            debug('Already recorded')
            return false
          }
        }
        return couch.heartbeat.upsertAsync(myDownKey,{date:Date.now()})
      },function(err){
        if(!err.statusCode) throw err
        if(404 !== err.statusCode) throw err
        currentVoteLog = []
        return couch.heartbeat.upsertAsync(myDownKey,{date:Date.now()})
      }).then(function(myVote){
        if(myVote !== false)
          currentVoteLog.push(myVote)
        var count = pingList.length
        var votes = currentVoteLog.length
        if(count === 0 || votes < (count/2))throw new Error('Ok, got it')
        hostInfo.available = false
        return couch.heartbeat.upsertAsync(key,hostInfo)
      }).then(function(){
        //Delete the vote log, it has served its purpose
        var promises = []
        //Added reflect() to avoid a race condition.
        for(var i = 0; i<currentVoteLog.length; i++)
          promises.push(couch.heartbeat.removeAsync(
            currentVoteLog[i].key))
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
      couch.schema.prism(prismName) : couch.schema.store(prismName,name)
    //The key used to track downvotes against me :(
    var downKey = couch.schema.downVote(name)
    return couch.peer.getAsync(key)
      .then(function(result){
        var node = result.value
        node.available = true
        node.active = true
        return couch.peer.upsertAsync(key,node,{cas: result.cas})
      })
      .then(function(){
        //Time to delete the downvote log
        var qstring = 'DELETE FROM ' +
          couch.getName(couch.type.HEARTBEAT,true) +
          ' b WHERE META(b).id LIKE $1'
        var query = couch.N1Query.fromString(qstring)
        downKey = downKey + '%'
        return couch.purchase.queryAsync(query,[downKey])
      })
      .then(function(result){
        debug('deleted ' + result.length + ' records')
      })
      .catch(function(err){
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
