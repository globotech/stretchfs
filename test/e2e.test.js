'use strict';
var expect = require('chai').expect

var e2e = require('./helpers/e2e')

describe('e2e',function(){
  this.timeout(60000)
  describe('e2e:prism',function(){
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
    describe('cluster status',function(){
      it('prism1 should be up',e2e.checkUp('prism',e2e.clconf.prism1))
      it('prism2 should be up',e2e.checkUp('prism',e2e.clconf.prism2))
      it('store1 should be up',e2e.checkUp('store',e2e.clconf.store1))
      it('store2 should be up',e2e.checkUp('store',e2e.clconf.store2))
      it('store3 should be up',e2e.checkUp('store',e2e.clconf.store3))
      it('store4 should be up',e2e.checkUp('store',e2e.clconf.store4))
    })
    describe('speed testing',function(){
      it('prism1 should speed test',e2e.speedTest('prism',e2e.clconf.prism1))
      it('prism2 should speed test',e2e.speedTest('prism',e2e.clconf.prism2))
      it('store1 should speed test',e2e.speedTest('store',e2e.clconf.store1))
      it('store2 should speed test',e2e.speedTest('store',e2e.clconf.store2))
      it('store3 should speed test',e2e.speedTest('store',e2e.clconf.store3))
      it('store4 should speed test',e2e.speedTest('store',e2e.clconf.store4))
    })
    describe('authentication',function(){
      it('should not require authentication for public functions',
        e2e.checkPublic(e2e.clconf.prism1))
      it('should require a session for all protected prism functions',
        e2e.checkProtected(e2e.clconf.prism1))
      it('should login to prism1',function(){
        return e2e.prismLogin(e2e.clconf.prism1)()
          .then(function(session){
            e2e.user.session = session
          })
      })
      it('should login to prism2',function(){
        var prism = e2e.clconf.prism2
        return e2e.prismLogin(prism)()
      })
      it('should logout',function(){
        var prism = e2e.clconf.prism1
        return e2e.prismLogout(prism,e2e.user.session)()
      })
    })
    describe('content',function(){
      before(function(){
        return e2e.prismLogin(e2e.clconf.prism1)()
          .then(function(session){
            e2e.user.session = session
            return e2e.contentUpload(e2e.clconf.prism1)
          })
      })
      after(function(){
        return e2e.prismLogout(e2e.clconf.prism1,e2e.user.session)()
      })
      it('should retrieve content',e2e.contentRetrieve(e2e.clconf.prism1))
      it('should show the content exists in 2 places',
        e2e.contentExists(e2e.clconf.prism1))
      it('should send content between stores',
        e2e.contentSend(e2e.clconf.prism1))
      it('should do a bulk content exists',
        e2e.contentExistsBulk(e2e.clconf.prism1))
      it('should show content detail publicly',
        e2e.contentDetail(e2e.clconf.prism1))
      it('should show content detail in bulk',
        e2e.contentDetailBulk(e2e.clconf.prism1))
      it('should allow API download of the content',
        e2e.contentDownload(e2e.clconf.prism1))
      it('should deliver static content on prism1',
        e2e.contentStatic(e2e.clconf.prism1))
      it('should deliver static content on prism2',
        e2e.contentStatic(e2e.clconf.prism2))
      it('should receive content from store on prism1',
        e2e.contentReceive(e2e.clconf.prism1))
      it('should receive content from stroe on prism2',
        e2e.contentReceive(e2e.clconf.prism2))
      it('should deny static content that must be purchased',function(){
        return e2e.contentStatic(e2e.clconf.prism1,'127.0.0.1','mp4')()
          .catch(function(err){
            expect(err.message).to.equal('expected 500 to equal 302')
          })
      })
      describe('inventory balance',function(){
        before(function(){
          //start balance
          return e2e.balanceStart()
        })
        after(function(){
          //stop balance
          return e2e.balanceStop()
        })
        it('should balance existing inventory')
        it('should expand copies for hot inventory')
        it('should reduce copies for cold inventory')
        it('should apply rules')
        it('should expand copies')
        it('should reduce copies')
        it('should recover copies')
      })
    })
    describe('purchases',function(){
      before(function(){
        return e2e.prismLogin(e2e.clconf.prism1)()
          .then(function(session){
            e2e.user.session = session
            return e2e.contentUpload(e2e.clconf.prism1)()
          })
      })
      after(function(){
        return e2e.prismLogout(e2e.clconf.prism1,e2e.user.session)()
      })
      it('should allow purchase of the content',function(){
        return e2e.contentPurchase(e2e.clconf.prism1)()
          .then(function(result){
            e2e.purchase = result
          })
      })
      it('should accept a purchased URL and deliver content on prism1',
        e2e.contentDeliver(e2e.clconf.prism1))
      it('should accept a purchased URL and deliver content on prism2',
        e2e.contentDeliver(e2e.clconf.prism2))
      it('should accept a request from a different ip',
        e2e.contentDeliver(e2e.clconf.prism1,'127.0.0.2'))
      it('should deny a request from a bad referrer',function(){
        return e2e.contentDeliver(e2e.clconf.prism1,'127.0.0.1','foo')()
          .catch(Error,function(err){
            expect(err.message).to.equal('expected 500 to equal 302')
          })
      })
      it('should allow removal of purchases',
        e2e.contentPurchaseRemove(e2e.clconf.prism2))
    })
  })
})
