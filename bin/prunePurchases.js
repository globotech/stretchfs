'use strict';
var P = require('bluebird')
var debug = require('debug')('oose:store:purchase')
var fs = require('graceful-fs')
var infant = require('infant')
var path = require('path')
var ProgressBar = require('progress')
var readdirp = require('readdirp-walk')

var config = require('../config')
var purchasedb = require('../helpers/purchasedb')

//make some promises
P.promisifyAll(fs)

var prunePurchases = function(done){
  var root = path.resolve(config.root)
  if(!fs.existsSync(root))
    done(new Error('Root folder doesnt exist'))

  var purchaseFolder = path.resolve(root + '/purchased')
  var pruneFolders = []

  if(!fs.existsSync(purchaseFolder))
    done(new Error('Purchase folder doesnt exist'))


  /**
   * Stat counters
   * @type {{warning: number, error: number, removed: number, valid: number}}
   */
  var counter = {
    warning: 0,
    error: 0,
    valid: 0,
    expired: 0,
    deleted: 0,
    folder: 0,
    skipped: 0,
    cleaned: 0
  }
  var progress
  debug('Starting to prune purchases')
  debug('Purchase folder: ' + purchaseFolder)
  var dirstream = readdirp({
    root: purchaseFolder,
    concurrency: (+config.store.purchasePruneConcurrency || 32)
  })
  dirstream.on('warn',function(err){
    console.log('readdirp warning',err)
  })
  dirstream.on('error',function(err){
    console.log('readdirp error',err)
  })
  var entryList = []
  dirstream.on('data',function(entry){
    if(entry.stat.isDirectory()){
      pruneFolders.push(entry.fullPath)
    } else {
      entryList.push(entry)
    }
  })
  dirstream.on('end',function(){
    progress = new ProgressBar(
      '  pruning [:bar] :current/:total :percent :rate/pps :etas',
      {
        total: entryList.length,
        width: 50,
        complete: '=',
        incomplete: '-'
      }
    )
    P.try(function(){
      return entryList
    })
      .map(function(entry){
        debug('got entry',entry.fullPath)
        var token = entry.path.replace(/[\/\\]+/g,'').replace(/\..+$/,'')
        debug(token,'got token')
        //here we need to validate the token or ignore this
        if(64 !== token.length){
          debug(token,'not a valid purchase token')
          counter.skipped++
          return
        }
        //okay so we get the purchase and if it does not exist we just remove
        //the entry, if it does exist we check the date and if the date is out
        //we set it to expired, if it is already expired for the afterlife
        //interval then we delete it, this will cause the rest of the cluster
        //to prune it
        var purchaseKey = purchasedb.schema.purchase(token)
        return purchasedb.existsAsync(purchaseKey)
          .then(function(purchaseKeyExists){
            if(purchaseKeyExists){
              return purchasedb.hgetallAsync(purchaseKey)
                .then(
                  function(doc){
                    var expirationDate = +doc.expirationDate
                    var now = +new Date()
                    //this is a valid purchase leave it alone
                    if(!doc.expired && (expirationDate > now)){
                      counter.valid++
                      debug(token,'valid')
                    }
                    //this purchase has expired but has yet to be marked expired
                    //so we expire it and calculate the final expiration date
                    else if(!doc.expired && (expirationDate <= now)){
                      debug(token,'expired')
                      counter.expired++
                      doc.expired = true
                      doc.afterlifeExpirationDate =
                        (+new Date() + config.purchase.afterlife)
                      return P.all([
                        //set the updated purchase record
                        purchasedb.hmsetAsync(purchaseKey,doc),
                        //actually expire the purchase record
                        purchasedb.expireAsyncAsync(
                          purchaseKey,
                          config.purchase.afterlife / 1000
                        )
                      ])
                    }
                    //now we have a doc that is expired when we encounter these
                    //and the afterlifeExpiration has also passed, we go ahead
                    //and prune the purchase out of the database, once this
                    //happens on the next prune cycle the purchase link will
                    //finally be removed
                    else if(doc.expired){
                      counter.archived++
                    }
                    //finally if nothing matches we throw an error
                    else {
                      var err = new Error(
                        'Unknown purchase rule hit ' + doc.toJSON())
                      err.doc = doc
                      throw err
                    }
                  }
                )
            } else {
              //regular 404s we just drop our symlink
              debug(token,'purchase does not exist, removing ours')
              return fs.unlinkAsync(entry.fullPath)
                .then(function(){
                  counter.cleaned++
                })
            }
          })
          .catch(function(err){
            counter.error++
            console.log(err.stack)
            console.log(err)
            console.log(token,'ERROR: ',err)
          })
          .finally(function(){
            progress.tick()
          })
      },{concurrency: (+config.store.purchasePruneConcurrency || 32)})
      //prune folders
      .then(function(){
        progress = new ProgressBar(
          '  folders [:bar] :current/:total :percent :rate/fps :etas',
          {
            total: pruneFolders.length,
            width: 50,
            complete: '=',
            incomplete: '-'
          }
        )
        return pruneFolders
      })
      .map(function(folder){
        var folderName = path.basename(folder)
        if(4 !== folderName.length){
          debug(folderName,'invalid folder, skipped')
          counter.skipped++
          return
        }
        return fs.rmdirAsync(folder)
          .then(function(){
            counter.folder++
          })
          .catch(function(err){
            debug('folder not empty skipped',err.message)
            counter.skipped++
          })
          .finally(function(){
            progress.tick()
          })
      },{concurrency: (+config.store.purchasePruneConcurrency || 32)})
      .then(function(){
        done(null,counter)
      })
      .catch(function(err){
        console.log(err.stack)
        done(err)
      })
  })
}

var prunePurchasesAsync = P.promisify(prunePurchases)


/**
 * Run the interval
 * @param {function} done
 */
var runInterval = function(done){
  console.log('Starting to prune purchases')
  prunePurchasesAsync()
    .then(function(counter){
      console.log('Purchase prune complete')
      console.log('  ' +
        counter.valid + ' valid ' +
        counter.expired + ' expired ' +
        counter.deleted + ' deleted ' +
        counter.cleaned + ' cleaned ' +
        counter.skipped + ' skipped ' +
        counter.warning + ' warnings ' +
        counter.error + ' errors'
      )
    })
    .catch(function(err){
      console.log(err.stack)
      console.log('Purchase prune error: ' + err.message)
    })
    .finally(done)
}

if(require.main === module){
  infant.child(
    'oose:' + config.store.name + ':purchase',
    function(done){
      //setup the interval for collection from master
      runInterval(done)
    },
    function(done){
      process.nextTick(done)
    }
  )
}

