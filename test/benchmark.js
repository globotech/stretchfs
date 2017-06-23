'use strict';
var P = require('bluebird')
var numeral = require('numeral')
var PromiseQueue = require('promiseq')

var e2e = require('./helpers/e2e')
var logger = require('../helpers/logger')


/**
 * Requests to run in parallel
 * @type {number}
 */
var concurrency = 64


/**
 * Iteration counts of tests
 * @type {object}
 */
var itn = {
  login: 50,
  contentUpload: 500,
  contentRetrieve: 500,
  contentExists: 500,
  contentDetail: 500,
  contentExistsInvalidate: 500,
  contentDownload: 500,
  contentPurchase: 500,
  contentDeliver: 500
}


/**
 * Repeat a test for benchmarking
 * @param {object} prism
 * @param {number} times
 * @param {string} test
 * @return {function}
 */
var repeatTest = function(prism,times,test){
  return function(){
    var start = +new Date()
    var queue = new PromiseQueue(concurrency)
    for(var i = 0; i < times; i++){
      queue.push(e2e[test](prism))
    }
    return queue.close()
      .then(function(){
        var rps = (times / (((+new Date()) - start) / 1000)).toFixed(2)
        logger.log('info', '            ' + test + ' ' +rps + '/rps ')
      })
  }
}

describe('benchmark',function(){
  describe('benchmark:prism',function(){
    //spin up an entire cluster here
    this.timeout(30000)
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
    it('login and logout ' + numeral(itn.login).format('0,0') + 'x',function(){
      var logout = function(prism){
        return function(session){
          return e2e.prismLogout(session,prism)
        }
      }
      var prism = e2e.clconf.prism2
      var promises = []
      for(var i = 0; i < itn.login; i++){
        promises.push(e2e.prismLogin(prism)().then(logout(prism)))
      }
      return P.all(promises)
    })

    it('should upload content initially',e2e.contentUpload(e2e.clconf.prism1))

    it('content upload ' + numeral(itn.contentUpload).format('0,0') + 'x',
      repeatTest(e2e.clconf.prism1,itn.contentUpload,'contentUpload'))

    it('content retrieve ' + numeral(itn.contentRetrieve).format('0,0') + 'x',
      repeatTest(e2e.clconf.prism1,itn.contentRetrieve,'contentRetrieve'))

    it('content exists ' + numeral(itn.contentExists).format('0,0') + 'x',
      repeatTest(e2e.clconf.prism1,itn.contentExists,'contentExists'))

    it('content details ' + numeral(itn.contentDetail).format('0,0') + 'x',
      repeatTest(e2e.clconf.prism1,itn.contentDetail,'contentDetail'))

    it('content download ' + numeral(itn.contentDownload).format('0,0') + 'x',
      repeatTest(e2e.clconf.prism1,itn.contentDownload,'contentDownload'))

    it('should purchase content initially',function(){
      return e2e.contentPurchase(e2e.clconf.prism1)()
        .then(function(result){
          e2e.purchase = result
        })
    })

    it('content purchase ' + numeral(itn.contentPurchase).format('0,0') + 'x',
      repeatTest(e2e.clconf.prism1,itn.contentPurchase,'contentPurchase'))

    it('content deliver ' + numeral(itn.contentDeliver).format('0,0') + 'x',
      repeatTest(e2e.clconf.prism1,itn.contentDeliver,'contentDeliver'))

    it('should remove purchase',
      e2e.contentPurchaseRemove(e2e.clconf.prism2))
  })
})
