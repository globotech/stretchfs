'use strict';
var P = require('bluebird')

var e2e = require('./helpers/e2e')

describe('outage',function(){
  describe('outage:prism',function(){
    //spin up an entire cluster here
    this.timeout(10000)
    //start servers and create a user
    before(function(){
      var that = this
      return e2e.before(that)
    })
    //remove user and stop services
    after(function(){
      var that = this
      return e2e.after(that)
    })
    it('master should be up',e2e.checkUp('master',e2e.clconf.master))
    it('prism1 should be up',e2e.checkUp('prism',e2e.clconf.prism1))
    it('prism2 should be up',e2e.checkUp('prism',e2e.clconf.prism2))
    it('store1 should be up',e2e.checkUp('store',e2e.clconf.store1))
    it('store2 should be up',e2e.checkUp('store',e2e.clconf.store2))
    it('store3 should be up',e2e.checkUp('store',e2e.clconf.store3))
    it('store4 should be up',e2e.checkUp('store',e2e.clconf.store4))
    it('login initially',function(){
      return e2e.prismLogin(e2e.clconf.prism1)()
        .then(function(session){
          e2e.user.session = session
        })
    })
    describe('master down',function(){
      before(function(){
        return e2e.contentUpload(e2e.clconf.prism1)()
          .then(function(){
            return e2e.server.master.stopAsync()
          })
      })
      after(function(){
        return e2e.server.master.startAsync()
      })
      it('master should be down',e2e.checkDown('prism',e2e.clconf.master))
      it('should still upload content',e2e.contentUpload(e2e.clconf.prism1))
      it('should still show existence',e2e.contentExists(e2e.clconf.prism1))
      it('should invalidate the content existence',
        e2e.contentExistsInvalidate(e2e.clconf.prism1))
      it('should still purchase content',function(){
        return e2e.contentPurchase(e2e.clconf.prism1)()
          .then(function(result){
            e2e.purchase = result
          })
      })
      it('should still deliver content',e2e.contentDeliver(e2e.clconf.prism1))
      it('should still download content',
        e2e.contentDownload(e2e.clconf.prism1))
    })
    describe('prism2 down',function(){
      before(function(){
        return e2e.server.prism2.stopAsync()
      })
      after(function(){
        return e2e.server.prism2.startAsync()
      })
      it('prism2 should be down',e2e.checkDown('prism',e2e.clconf.prism2))
      it('should still upload content',e2e.contentUpload(e2e.clconf.prism1))
      it('should still show existence',e2e.contentExists(e2e.clconf.prism1,{
        count: 1,
        deepChecks: ['prism1']
      }))
      it('should invalidate the content existence',
        e2e.contentExistsInvalidate(e2e.clconf.prism1))
      it('should still purchase content',function(){
        return e2e.contentPurchase(e2e.clconf.prism1)()
          .then(function(result){
            e2e.purchase = result
          })
      })
      it('should still deliver content',e2e.contentDeliver(e2e.clconf.prism1))
      it('should still download content',
        e2e.contentDownload(e2e.clconf.prism1))
    })
    describe('prism1 down',function(){
      before(function(){
        return e2e.server.prism1.stopAsync()
      })
      after(function(){
        return e2e.server.prism1.startAsync()
      })
      it('prism1 should be down',e2e.checkDown('prism',e2e.clconf.prism1))
      it('should still upload content',e2e.contentUpload(e2e.clconf.prism2))
      it('should still show existence',e2e.contentExists(e2e.clconf.prism2,{
        count: 1,
        deepChecks: ['prism2']
      }))
      it('should invalidate the content existence',
        e2e.contentExistsInvalidate(e2e.clconf.prism2))
      it('should still purchase content',function(){
        return e2e.contentPurchase(e2e.clconf.prism2)()
          .then(function(result){
            e2e.purchase = result
          })
      })
      it('should still deliver content',e2e.contentDeliver(e2e.clconf.prism2))
      it('should still download content',
        e2e.contentDownload(e2e.clconf.prism2))
    })
    describe('store1 and store2 down',function(){
      before(function(){
        return P.all([
          e2e.server.store1.stopAsync(),
          e2e.server.store2.stopAsync()
        ])
      })
      after(function(){
        return P.all([
          e2e.server.store1.startAsync(),
          e2e.server.store2.startAsync()
        ])
      })
      it('store1 should be down',e2e.checkDown('store',e2e.clconf.store1))
      it('store2 should be down',e2e.checkDown('store',e2e.clconf.store2))
      it('should still upload content',e2e.contentUpload(e2e.clconf.prism1))
      it('should still show existence',e2e.contentExists(e2e.clconf.prism1,{
        checkExists: true,
        count: 1,
        countGreaterEqual: true,
        deepChecks: ['prism2']
      }))
      it('should invalidate the content existence',
        e2e.contentExistsInvalidate(e2e.clconf.prism1))
      it('should still purchase content',function(){
        return e2e.contentPurchase(e2e.clconf.prism1)()
          .then(function(result){
            e2e.purchase = result
          })
      })
      it('should still deliver content',e2e.contentDeliver(e2e.clconf.prism1))
      it('should still download content',
        e2e.contentDownload(e2e.clconf.prism1))
    })
    describe('store3 and store4 down',function(){
      before(function(){
        return P.all([
          e2e.server.store3.stopAsync(),
          e2e.server.store4.stopAsync()
        ])
      })
      after(function(){
        return P.all([
          e2e.server.store3.startAsync(),
          e2e.server.store4.startAsync()
        ])
      })
      it('store3 should be down',e2e.checkDown('store',e2e.clconf.store3))
      it('store4 should be down',e2e.checkDown('store',e2e.clconf.store4))
      it('should still upload content',e2e.contentUpload(e2e.clconf.prism2))
      it('should still show existence',e2e.contentExists(e2e.clconf.prism1,{
        checkExists: true,
        count: 1,
        countGreaterEqual: true,
        deepChecks: ['prism1']
      }))
      it('should invalidate the content existence',
        e2e.contentExistsInvalidate(e2e.clconf.prism1))
      it('should still purchase content',function(){
        return e2e.contentPurchase(e2e.clconf.prism2)()
          .then(function(result){
            e2e.purchase = result
          })
      })
      it('should still deliver content',e2e.contentDeliver(e2e.clconf.prism2))
      it('should still download content',
        e2e.contentDownload(e2e.clconf.prism2))
    })
    describe('prism1, store1 and store2 down',function(){
      before(function(){
        return P.all([
          e2e.server.prism1.stopAsync(),
          e2e.server.store1.stopAsync(),
          e2e.server.store2.stopAsync()
        ])
      })
      after(function(){
        return P.all([
          e2e.server.store1.startAsync(),
          e2e.server.store2.startAsync(),
          e2e.server.prism1.startAsync()
        ])
      })
      it('prism1 should be down',e2e.checkDown('prism',e2e.clconf.prism1))
      it('store1 should be down',e2e.checkDown('store',e2e.clconf.store1))
      it('store2 should be down',e2e.checkDown('store',e2e.clconf.store2))
      it('should still upload content',e2e.contentUpload(e2e.clconf.prism2))
      it('should still show existence',e2e.contentExists(e2e.clconf.prism2,{
        checkExists: true,
        count: 1,
        countGreaterEqual: true,
        deepChecks: ['prism2']
      }))
      it('should invalidate the content existence',
        e2e.contentExistsInvalidate(e2e.clconf.prism2))
      it('should still purchase content',function(){
        return e2e.contentPurchase(e2e.clconf.prism2)()
          .then(function(result){
            e2e.purchase = result
          })
      })
      it('should still deliver content',e2e.contentDeliver(e2e.clconf.prism2))
      it('should still download content',
        e2e.contentDownload(e2e.clconf.prism2))
    })
    describe('prism2, store3 and store4 down',function(){
      before(function(){
        return P.all([
          e2e.server.prism2.stopAsync(),
          e2e.server.store3.stopAsync(),
          e2e.server.store4.stopAsync()
        ])
      })
      after(function(){
        return P.all([
          e2e.server.store3.startAsync(),
          e2e.server.store4.startAsync(),
          e2e.server.prism2.startAsync()
        ])
      })
      it('prism2 should be down',e2e.checkDown('prism',e2e.clconf.prism2))
      it('store3 should be down',e2e.checkDown('store',e2e.clconf.store3))
      it('store4 should be down',e2e.checkDown('store',e2e.clconf.store4))
      it('should still upload content',e2e.contentUpload(e2e.clconf.prism1))
      it('should still show existence',e2e.contentExists(e2e.clconf.prism1,{
        checkExists: true,
        count: 1,
        countGreaterEqual: true,
        deepChecks: ['prism1']
      }))
      it('should invalidate the content existence',
        e2e.contentExistsInvalidate(e2e.clconf.prism1))
      it('should still purchase content',function(){
        return e2e.contentPurchase(e2e.clconf.prism1)()
          .then(function(result){
            e2e.purchase = result
          })
      })
      it('should still deliver content',e2e.contentDeliver(e2e.clconf.prism1))
      it('should still download content',
        e2e.contentDownload(e2e.clconf.prism1))
    })
  })
})
