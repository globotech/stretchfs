'use strict';
var P = require('bluebird')
var expect = require('chai').expect
var fs = require('graceful-fs')
var infant = require('infant')
var ObjectManage = require('object-manage')
var oose = require('oose-sdk')
var path = require('path')

var api = require('../helpers/api')
var couchdb = require('../helpers/couchdb')
var purchasedb = require('../helpers/purchasedb')

var content = oose.mock.content


/**
 * Copy hash for proper naming
 * @type {*|null|RegExp|number|string|string}
 */
content.hash = content.sha1


/**
 * Copy bad hash for proper naming
 * @type {string}
 */
content.badHash = content.sha1Bogus

var config = require('../config')
config.$load(require(__dirname + '/assets/send.config.js'))

var makeEnv = function(configFile){
  var env = new ObjectManage()
  env.$load(process.env)
  env.OOSE_CONFIG = path.resolve(configFile)
  return env.$strip()
}

//make some promises
P.promisifyAll(fs)
P.promisifyAll(infant)

describe('send',function(){
  this.timeout(10000)
  var sendServer = infant.parent('../send',{
    fork: {env: makeEnv(__dirname + '/assets/send1.config.js')}
  })
  var client
  //start services
  before(function(){
    client = api.setupAccess('send',config.send)
    return sendServer.startAsync()
  })
  //stop services
  after(function(){
    return sendServer.stopAsync()
  })
  describe('basic',function(){
    //home page
    it('should have a homepage',function(){
      return client
        .postAsync(client.url('/'))
        .spread(function(res,body){
          return P.all([
            expect(body.message).to.equal('Welcome to OOSE version ' +
              config.version)
          ])
        })
    })
    it('should ping',function(){
      return client
        .postAsync(client.url('/ping'))
        .spread(function(res,body){
          expect(body.pong).to.equal('pong')
        })
    })
  })
  //content
  describe('send:content',function(){
    //get tokens
    var inventoryKey = couchdb.schema.inventory(content.hash,'prism1','store1')
    var purchaseToken = purchasedb.generate()
    var badPurchaseToken = purchasedb.generate()
    before(function(){
      //create inventory record
      return couchdb.inventory.insertAsync({
        hash: content.hash,
        mimeExtension: content.ext,
        mimeType: content.type,
        prism: 'prism1',
        store: 'store1',
        relativePath: content.relativePath,
        size: content.data.length,
        createdAt: +(new Date())
      },inventoryKey)
      //create purchasedb
        .then(
          function(){
            return purchasedb.createDatabase(purchaseToken,false)
              .catch(function(){})
          },
          function(){
            return purchasedb.createDatabase(purchaseToken,false)
              .catch(function(){})
          }
        )
        //make a purchase against this
        .then(function(){
          return purchasedb.create(purchaseToken,{
            hash: content.hash,
            expirationDate: (+(new Date()) + 72000), //2 hours
            ext: content.ext,
            referrer: 'localhost,127.0.0.1'
          })
        })
    })
    after(function(){
      //delete purchase record
      return purchasedb.remove(purchaseToken)
        //delete purchase db
        .then(function(){
          return couchdb.db.destroyAsync(
            purchasedb.databaseName(purchaseToken))
        })
        //delete inventory record
        .then(function(){
          return couchdb.inventory.getAsync(inventoryKey)
        })
        .then(function(result){
          return couchdb.inventory.destroyAsync(result._id,result._rev)
        })

    })
    it('should 404 on bad static content',function(){
      return client.getAsync(
        client.url('/static/' + content.badHash + '/' + content.name)
      )
        .spread(function(result,body){
          expect(body).to.equal('404 Not Found')
          expect(result.statusCode).to.equal(404)
        })
    })
    it('should 200 on good static content',function(){
      return client.getAsync(
        client.url('/static/' + content.hash + '/' + content.name)
      )
        .spread(function(result,body){
          expect(body).to.equal('The fox is brown')
          expect(result.statusCode).to.equal(200)
        })
    })
    it('should not play content without purchases',function(){
      return client.getAsync(
        client.url('/play/' + badPurchaseToken + '/video.mp4')
      )
        .spread(function(result,body){
          expect(body).to.equal('404 Not Found')
          expect(result.statusCode).to.equal(404)
        })
    })
    it('should play content with purchases',function(){
      return client.getAsync(
        client.url('/play/' + purchaseToken + '/video.mp4')
      )
        .spread(function(result,body){
          expect(body).to.equal('The fox is brown')
          expect(result.statusCode).to.equal(200)
        })
    })
  })
})
