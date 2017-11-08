'use strict';
var P = require('bluebird')
var expect = require('chai').expect
var fs = require('graceful-fs')
var infant = require('infant')
var ObjectManage = require('object-manage')
var stretchfs = require('stretchfs-sdk')
var path = require('path')
var promisePipe = require('promisepipe')
var rmfr = require('rmfr')
var hashStream = require('sha1-stream')

var api = require('../helpers/api')
var purchasedb = require('../helpers/purchasedb')

var content = stretchfs.mock.content

var config = require('../config')
config.$load(require(__dirname + '/assets/store1.config.js'))

var makeEnv = function(configFile){
  var env = new ObjectManage()
  env.$load(process.env)
  env.STRETCHFS_CONFIG = path.resolve(configFile)
  return env.$strip()
}

//make some promises
P.promisifyAll(fs)
P.promisifyAll(infant)

describe('store',function(){
  this.timeout(30000)
  var storeServer = infant.parent('../store',{
    fork: {env: makeEnv(__dirname + '/assets/store1.config.js')}
  })
  var client
  //start servers and create a user
  before(function(){
    client = api.setupAccess('store',config.store)
    return rmfr(config.root)
      .then(function(){
        return storeServer.startAsync()
      })
  })
  //remove user and stop services
  after(function(){
    return storeServer.stopAsync()
  })
  describe('basic',function(){
    //home page
    it('should have a homepage',function(){
      return client
        .postAsync(client.url('/'))
        .spread(function(res,body){
          return P.all([
            expect(body.message).to.equal('Welcome to StretchFS version ' +
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
  describe('store:content',function(){
    before(function(){
      return promisePipe(
        fs.createReadStream(content.file),
        client.put(
          client.url('/content/put/') + content.hash + '.' + content.ext)
      )
    })
    after(function(){
      return client
        .postAsync({
          url: client.url('/content/remove'),
          json: {
            hash: content.hash
          }
        })
        .spread(function(res,body){
          expect(body.success).to.equal('File removed')
        })
    })
    it('should do a speed test',function(){
      return client
        .getAsync(client.url('/content/speedtest?size=10k'))
        .spread(function(res,body){
          expect(body.length).to.equal(10000)
        })
    })
    it('should have pizza',function(){
      return client
        .getAsync(client.url('/content/pizza'))
        .spread(function(res,body){
          expect(body).to.equal(
            '<html><head><title>Pizza</title></head>' +
            '<body style="margin: 0; padding: 0">' +
            '<img src="' +
            fs.readFileSync(__dirname + '/assets/pizza.txt') +
            '"/></body></html>'
          )
        })
    })
    it('should check if content exists',function(){
      return client
        .postAsync({
          url: client.url('/content/exists'),
          json: {
            hash: content.hash,
            ext: content.ext
          }
        })
        .spread(function(res,body){
          expect(body.exists.exists).to.equal(true)
          expect(body.exists.ext).to.equal(content.ext)
        })
    })
    it('should check bulk content exists',function(){
      return client
        .postAsync({
          url: client.url('/content/exists'),
          json: {
            hash: [
              content.hash + '.' + content.ext,
              content.sha1Bogus
            ]
          }
        })
        .spread(function(res,body){
          expect(body[content.hash].exists).to.equal(true)
          expect(body[content.hash].ext).to.equal(content.ext)
          expect(body[content.sha1Bogus].exists).to.equal(false)
          expect(body[content.sha1Bogus].ext).to.equal('')
        })
    })
    it('should fail for bogus content',function(){
      return client
        .postAsync({
          url: client.url('/content/exists'),
          json: {hash: content.sha1Bogus}
        })
        .spread(function(res,body){
          expect(body.exists.exists).to.equal(false)
          expect(body.exists.ext).to.equal('')
        })
    })
    it('should download content',function(){
      var sniff = hashStream.createStream()
      return promisePipe(
        client.post({
          url: client.url('/content/download'),
          json: {hash: content.hash}
        }),
        sniff
      )
        .then(function(){
          expect(sniff.hash).to.equal(content.hash)
        })
    })
    it('should verify content',function(){
      return client
        .postAsync({
          url: client.url('/content/verify'),
          json: {file: content.sha1 + '.' + content.ext, force: true}
        })
        .spread(function(res,body){
          expect(body.verified).to.equal(true)
          expect(body.verifySkipped).to.equal(false)
          expect(body.expectedHash).to.equal(content.sha1)
          expect(body.actualHash).to.equal(content.sha1)
          expect(body.success).to.equal('Verification complete')
          expect(body.status).to.equal('ok')
          expect(body.verifiedAt).to.be.a('number')
        })
    })
    it('should cache content verifications',function(){
      return client
        .postAsync({
          url: client.url('/content/verify'),
          json: {file: content.sha1 + '.' + content.ext}
        })
        .spread(function(res,body){
          expect(body.verified).to.equal(true)
          expect(body.verifySkipped).to.equal(true)
          expect(body.expectedHash).to.equal(content.sha1)
          expect(body.actualHash).to.equal(content.sha1)
          expect(body.success).to.equal('Verification complete')
          expect(body.status).to.equal('ok')
          expect(body.verifiedAt).to.be.a('number')
        })
    })
    it('should fail to verify missing content',function(){
      return client
        .postAsync({
          url: client.url('/content/verify'),
          json: {file: content.sha1Bogus + '.' + content.ext}
        })
        .spread(function(res,body){
          expect(body.error).to.equal('File not found')
          expect(res.statusCode).to.equal(404)
        })
    })
    it('should verify and remove invalid content',function(){
      var testFile = './test/assets/data/test/store1/content/' +
        content.relativePath
      //first we need to modify our file
      fs.writeFileSync(testFile,'bah humbug')
      return client
        .postAsync({
          url: client.url('/content/verify'),
          json: {file: content.sha1 + '.' + content.ext, force: true}
        })
        .spread(function(res,body){
          expect(body.verified).to.equal(false)
          expect(body.verifySkipped).to.equal(false)
          expect(body.expectedHash).to.equal(content.sha1)
          expect(body.actualHash)
            .to.equal('4820c2195b35ad725c41c500176fe7be8b903d78')
          expect(body.success).to.equal('Verification complete')
          expect(body.status).to.equal('fail')
          expect(body.verifiedAt).to.be.a('number')
        })
        .finally(function(){
          fs.writeFileSync(testFile,'The fox is brown')
        })
    })
  })
  //content
  describe('send:content',function(){
    //get tokens
    var purchaseToken = purchasedb.generate()
    var badPurchaseToken = purchasedb.generate()
    before(function(){
      return promisePipe(
        fs.createReadStream(content.file),
        client.put(
          client.url('/content/put/') + content.hash + '.' + content.ext)
      )
      //make a purchase against this
        .then(function(){
          return purchasedb.create(purchaseToken,{
            hash: content.hash,
            ext: content.ext,
            referrer: 'localhost,127.0.0.1'
          })
        })
    })
    after(function(){
      //delete purchase record
      return P.try(function(){
        return purchasedb.remove(purchaseToken)
      })
      //delete inventory record
        .then(function(){
          return client.postAsync({
            url: client.url('/content/remove'),
            json: {hash: content.hash}
          })
        })
        .spread(function(res,body){
          expect(body.success).to.equal('File removed')
        })
    })
    it('should 404 on bad static content',function(){
      return client.getAsync(
        client.url('/static/' + content.sha1Bogus + '/' + content.name)
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
      var url = client.url('/play/' + purchaseToken + '/video.mp4')
      return client.getAsync(url)
        .spread(function(result,body){
          expect(body).to.equal('The fox is brown')
          expect(result.statusCode).to.equal(200)
        })
    })
  })
})
