'use strict';
var P = require('bluebird')
var expect = require('chai').expect
var infant = require('infant')
var request = require('request')

var api = require('../helpers/api')

var config = require('../config')

//make some promises
P.promisifyAll(infant)
P.promisifyAll(request)

var user = {
  session: {},
  name: 'localhost',
  secret: 'bigpassword'
}


describe('prism',function(){
  this.timeout(10000)
  var prismServer = infant.parent('../prism')
  var client
  //start servers and create a user
  before(function(){
    client = api.setupAccess('prism',config.prism)
    return prismServer.startAsync()
  })
  //remove user and stop services
  after(function(){
    return prismServer.stopAsync()
  })
  //home page
  describe('prism:basic',function(){
    it('should have a homepage',function(){
      return client
        .postAsync(client.url('/'))
        .spread(function(res,body){
          expect(body.message).to.equal(
            'Welcome to OOSE version ' + config.version)
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
  describe('prism:users',function(){
    it('should login',function(){
      return client
        .postAsync({
          url: client.url('/user/login'),
          json: {
            name: user.name,
            secret: user.secret
          }
        })
        .spread(function(res,body){
          if(!body.session) throw new Error('No session created')
          user.session = body.session
          expect(body.message).to.equal('Login successful')
          expect(body.success).to.equal('User logged in')
          expect(body.session).to.be.an('Object')
        })
    })
    it('should validate a session',function(){
      return api.setSession(user.session,client)
        .postAsync({url: client.url('/user/session/validate'), json: true})
        .spread(function(res,body){
          expect(body.success).to.equal('Session valid')
          expect(body.session).to.be.an('object')
          expect(body.session.token).to.be.a('string')
        })
    })
    it('should logout',function(){
      return api.setSession(user.session,client)
        .postAsync({url: client.url('/user/logout'), json: true})
        .spread(function(res,body){
          expect(body.success).to.equal('User logged out')
        })
    })
  })
  describe('prism:job',function(){
    var job = {}
    var sessionClient
    before(function(){
      return client
        .postAsync({
          url: client.url('/user/login'),
          json: {
            name: user.name,
            secret: user.secret
          }
        })
        .spread(function(res,body){
          if(!body.session) throw new Error('No session created')
          user.session = body.session
          expect(body.message).to.equal('Login successful')
          expect(body.success).to.equal('User logged in')
          expect(body.session).to.be.an('Object')
          sessionClient = api.setSession(user.session,client)
        })
    })
    after(function(){
      return sessionClient.postAsync({
        url: client.url('/user/logout'), json: true
      })
        .spread(function(res,body){
          expect(body.success).to.equal('User logged out')
        })
    })
    it('should create a job',function(){
      return sessionClient.postAsync({
        url: client.url('/job/create'),
        json: {
          priority: 5,
          description: {save: ['foo']},
          category: 'augment'
        }
      })
        .spread(function(res,body){
          job = body
          expect(body.handle).to.be.a('string')
          expect(body.description).to.be.a('string')
          expect(body.priority).to.equal(5)
          expect(body.status).to.equal('staged')
        })
    })
    it('should update a job',function(){
      return sessionClient
        .postAsync({
          url: client.url('/job/update'),
          json: {
            handle: job.handle,
            priority: 10
          }
        })
        .spread(function(res,body){
          expect(body.priority).to.equal(10)
        })
    })
    it('should get job detail',function(){
      return sessionClient
        .postAsync({url: client.url('/job/detail'), json: {handle: job.handle}})
        .spread(function(res,body){
          expect(body.handle).to.equal(job.handle)
          expect(body.priority).to.equal(10)
        })
    })
    it('should start a job',function(){
      return sessionClient
        .postAsync({
          url: client.url('/job/start'),
          json: {
            handle: job.handle
          }
        })
        .spread(function(res,body){
          expect(body.status).to.equal('queued')
        })
    })
    it('should retry a job',function(){
      return sessionClient
        .postAsync({
          url: client.url('/job/update?force=true'),
          json: {
            handle: job.handle,
            status: 'error'
          }
        })
        .spread(function(res,body){
          expect(body.status).to.equal('error')
          return sessionClient
            .postAsync({
              url: client.url('/job/retry'),
              json: {
                handle: job.handle
              }
            })
        })
        .spread(function(res,body){
          expect(body.status).to.equal('queued_retry')
        })
    })
    it('should abort a job',function(){
      return sessionClient
        .postAsync({
          url: client.url('/job/update?force=true'),
          json: {
            handle: job.handle,
            status: 'processing'
          }
        })
        .spread(function(res,body){
          expect(body.status).to.equal('processing')
          return sessionClient
            .postAsync({
              url: client.url('/job/abort'),
              json: {
                handle: job.handle
              }
            })
        })
        .spread(function(res,body){
          expect(body.status).to.equal('queued_abort')
        })
    })
    it('should remove a job',function(){
      return sessionClient
        .postAsync({
          url: client.url('/job/remove?force=true'),
          json: {
            handle: job.handle
          }
        })
        .spread(function(res,body){
          expect(body.success).to.equal('Job removed')
          expect(body.count).to.equal(1)
        })
    })
  })
})
