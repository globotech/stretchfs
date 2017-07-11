'use strict';
var P = require('bluebird')

var e2e = require('./helpers/e2e')
var logger = require('../helpers/logger')

describe('outage',function(){
  describe('outage:prism',function(){
    //spin up an entire cluster here
    this.timeout(20000)
    //start servers and create a user
    before(function(){
      var that = this
      return e2e.before(that)
        .then(function(){
          return e2e.contentUpload(e2e.clconf.prism1)()
        })
    })
    //remove user and stop services
    after(function(){
      var that = this
      return e2e.after(that)
    })
    describe('status',function(){
      it('prism1 should be up',e2e.checkUp('prism',e2e.clconf.prism1))
      it('prism2 should be up',e2e.checkUp('prism',e2e.clconf.prism2))
      it('store1 should be up',e2e.checkUp('store',e2e.clconf.store1))
      it('store2 should be up',e2e.checkUp('store',e2e.clconf.store2))
      it('store3 should be up',e2e.checkUp('store',e2e.clconf.store3))
      it('store4 should be up',e2e.checkUp('store',e2e.clconf.store4))
    })
    describe('prism outage',function(){
      describe('prism2 down',function(){
        before(function(){
          return e2e.prismLogin(e2e.clconf.prism1)()
            .then(function(session){
              e2e.user.session = session
              return e2e.server.prism2.stopAsync()
            })
        })
        after(function(){
          return e2e.server.prism2.startAsync()
            .then(function(){
              return e2e.prismLogout(e2e.clconf.prism1,e2e.user.session)()
            })
            .then(function(){
              return e2e.contentPurchaseRemove(e2e.clconf.prism2)()
            })
        })
        it('prism2 should be down',e2e.checkDown('prism',e2e.clconf.prism2))
        it('should still upload content',e2e.contentUpload(e2e.clconf.prism1))
        it('should still retrieve content',
          e2e.contentRetrieve(e2e.clconf.prism1))
        it('should still show existence',e2e.contentExists(e2e.clconf.prism1,{
          count: 1,
          deepChecks: ['prism1']
        }))
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
          return e2e.prismLogin(e2e.clconf.prism1)()
            .then(function(session){
              e2e.user.session = session
              return e2e.server.prism1.stopAsync()
            })
        })
        after(function(){
          return e2e.server.prism1.startAsync()
            .then(function(){
              return e2e.prismLogout(e2e.clconf.prism1,e2e.user.session)()
            })
        })
        it('prism1 should be down',e2e.checkDown('prism',e2e.clconf.prism1))
        it('should still upload content',e2e.contentUpload(e2e.clconf.prism2))
        it('should still retrieve content',
          e2e.contentRetrieve(e2e.clconf.prism2))
        it('should still show existence',e2e.contentExists(e2e.clconf.prism2,{
          count: 1,
          deepChecks: ['prism2']
        }))
        it('should still purchase content',function(){
          return e2e.contentPurchase(e2e.clconf.prism2)()
            .then(function(result){
              e2e.purchase = result
            })
        })
        it('should still deliver content',e2e.contentDeliver(e2e.clconf.prism2))
        it('should still download content',function(){
          return e2e.contentDownload(e2e.clconf.prism2)()
            .catch(function(e){
              logger.log('error', e.message)
              logger.log('error', e.stack)
              process.exit()
            })
        })
      })
    })
    describe('store1 and store2 down',function(){
      before(function(){
        return e2e.prismLogin(e2e.clconf.prism1)()
          .then(function(session){
            e2e.user.session = session
            return P.all([
              e2e.server.store1.stopAsync(),
              e2e.server.store2.stopAsync()
            ])
          })
      })
      after(function(){
        return P.all([
          e2e.server.store1.startAsync(),
          e2e.server.store2.startAsync()
        ])
          .then(function(){
            return e2e.prismLogout(e2e.clconf.prism1,e2e.user.session)()
          })
      })
      it('store1 should be down',e2e.checkDown('store',e2e.clconf.store1))
      it('store2 should be down',e2e.checkDown('store',e2e.clconf.store2))
      it('should still upload content',e2e.contentUpload(e2e.clconf.prism1))
      it('should still retrieve content',e2e.contentRetrieve(e2e.clconf.prism1))
      it('should still show existence',e2e.contentExists(e2e.clconf.prism1,{
        checkExists: true,
        count: 1,
        countGreaterEqual: true,
        deepChecks: ['prism2']
      }))
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
        return e2e.prismLogin(e2e.clconf.prism1)()
          .then(function(session){
            e2e.user.session = session
            return P.all([
              e2e.server.store3.stopAsync(),
              e2e.server.store4.stopAsync()
            ])
          })
      })
      after(function(){
        return P.all([
          e2e.server.store3.startAsync(),
          e2e.server.store4.startAsync()
        ])
          .then(function(){
            return e2e.prismLogout(e2e.clconf.prism1,e2e.user.session)()
          })
      })
      it('store3 should be down',e2e.checkDown('store',e2e.clconf.store3))
      it('store4 should be down',e2e.checkDown('store',e2e.clconf.store4))
      it('should still upload content',e2e.contentUpload(e2e.clconf.prism2))
      it('should still retrieve content',e2e.contentRetrieve(e2e.clconf.prism2))
      it('should still show existence',e2e.contentExists(e2e.clconf.prism1,{
        checkExists: true,
        count: 1,
        countGreaterEqual: true,
        deepChecks: ['prism1']
      }))
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
        return e2e.prismLogin(e2e.clconf.prism1)()
          .then(function(session){
            e2e.user.session = session
            return P.all([
              e2e.server.prism1.stopAsync(),
              e2e.server.store1.stopAsync(),
              e2e.server.store2.stopAsync()
            ])
          })
      })
      after(function(){
        return P.all([
          e2e.server.store1.startAsync(),
          e2e.server.store2.startAsync(),
          e2e.server.prism1.startAsync()
        ])
          .then(function(){
            return e2e.prismLogout(e2e.clconf.prism1,e2e.user.session)()
          })
      })
      it('prism1 should be down',e2e.checkDown('prism',e2e.clconf.prism1))
      it('store1 should be down',e2e.checkDown('store',e2e.clconf.store1))
      it('store2 should be down',e2e.checkDown('store',e2e.clconf.store2))
      it('should still upload content',e2e.contentUpload(e2e.clconf.prism2))
      it('should still retrieve content',e2e.contentRetrieve(e2e.clconf.prism2))
      it('should still show existence',e2e.contentExists(e2e.clconf.prism2,{
        checkExists: true,
        count: 1,
        countGreaterEqual: true,
        deepChecks: ['prism2']
      }))
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
        return e2e.prismLogin(e2e.clconf.prism1)()
          .then(function(session){
            e2e.user.session = session
            return P.all([
              e2e.server.prism2.stopAsync(),
              e2e.server.store3.stopAsync(),
              e2e.server.store4.stopAsync()
            ])
          })
      })
      after(function(){
        return P.all([
          e2e.server.store3.startAsync(),
          e2e.server.store4.startAsync(),
          e2e.server.prism2.startAsync()
        ])
          .then(function(){
            return e2e.prismLogout(e2e.clconf.prism1,e2e.user.session)()
          })
      })
      it('prism2 should be down',e2e.checkDown('prism',e2e.clconf.prism2))
      it('store3 should be down',e2e.checkDown('store',e2e.clconf.store3))
      it('store4 should be down',e2e.checkDown('store',e2e.clconf.store4))
      it('should still upload content',e2e.contentUpload(e2e.clconf.prism1))
      it('should still retrieve content',e2e.contentRetrieve(e2e.clconf.prism1))
      it('should still show existence',e2e.contentExists(e2e.clconf.prism1,{
        checkExists: true,
        count: 1,
        countGreaterEqual: true,
        deepChecks: ['prism1']
      }))
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
