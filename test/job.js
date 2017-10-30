'use strict';
var P = require('bluebird')
var expect = require('chai').expect
var fs = require('graceful-fs')
var infant = require('infant')

var api = require('../helpers/api')

var config = require('../config')

var job = require('./helpers/job')

//make some promises
P.promisifyAll(fs)
P.promisifyAll(infant)

describe('worker',function(){
  this.timeout(5000)
  var workerServer = infant.parent('../worker')
  var client
  //start servers and create a user
  before(function(){
    client = api.worker(config.worker)
    return workerServer.startAsync()
  })
  //remove user and stop services
  after(function(){
    return workerServer.stopAsync()
  })
  //home page
  it('should have a homepage',function(){
    return client
      .postAsync(client.url('/'))
      .spread(function(res,body){
        return P.all([
          expect(body.message).to.equal('Welcome to Shredder worker version ' +
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
  describe('worker:job',function(){
    it.skip('should create',function(){
      return client
        .postAsync({
          url: client.url('/job/create'),
          json: {
            handle: job.handle,
            description: job.description
          }
        })
        .spread(function(res,body){
          console.log(res,body)
          expect(body.handle).to.equal(job.handle)
          expect(body.description.save[0]).to.equal(job.description.save[0])
        })
    })
    it.skip('should detail',function(){
      return client
        .postAsync({
          url: client.url('/job/detail'),
          json: {
            handle: job.handle
          }
        })
        .spread(function(res,body){
          expect(body.handle).to.equal(job.handle)
          expect(body.description).to.be.a('string')
          var description = JSON.parse(body.description)
          expect(description.resource[0].request.url)
            .to.equal(job.description.resource[0].request.url)
        })
    })
    it.skip('should update',function(){
      return client
        .postAsync({
          url: client.url('/job/update'),
          json: {
            handle: job.handle,
            description: {save: ['foo']}
          }
        })
        .spread(function(res,body){
          expect(body.handle).to.equal(job.handle)
          expect(body.description.save[0]).to.equal('foo')
        })
    })
    it.skip('should have status',function(){
      return client
        .postAsync({
          url: client.url('/job/status'),
          json: {
            handle: job.handle
          }
        })
        .spread(function(res,body){
          expect(body).to.be.an('object')
          expect(Object.keys(body).length).to.equal(0)
        })
    })
    it.skip('should show content existence',function(){
      return client
        .postAsync({
          url: client.url('/job/content/exists'),
          json: {
            handle: job.handle,
            file: 'test.txt'
          }
        })
        .spread(function(res,body){
          expect(body.exists).to.equal(false)
        })
    })
    it.skip('should download content',function(){
      return client
        .getAsync({
          url: client.url('/job/content/download/' + job.handle + '/text.txt')
        })
        .spread(function(res){
          expect(res.statusCode).to.equal(404)
        })
    })
    it.skip('should remove',function(){
      return client
        .postAsync({
          url: client.url('/job/remove'),
          json: {
            handle: job.handle
          }
        })
        .spread(function(res,body){
          expect(body.handle).to.equal(job.handle)
        })
    })

  })
})
