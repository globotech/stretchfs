'use strict';
var P = require('bluebird')
var debug = require('debug')('oose:clearPurchases')
var eventStream = require('event-stream')
var infant = require('infant')
var JSONStream = require('JSONStream')
var ProgressBar = require('progress')
var promisePipe = require('promisepipe')
var request = require('request')

var config = require('../config')
var cradle = require('../helpers/couchdb')
var logger = require('../helpers/logger')


/**
 * Setup migration concurrency
 * @type {{store: number, prism: number, inventory: number, purchase: number}}
 */
var concurrency = {
  store: 4,
  prism: 4,
  inventory: 256,
  purchase: 256
}


/**
 * Stat counter
 * @type {{moved: number, warning: number, error: number}}
 */
var counter = {
  moved: 0,
  exists: 0,
  skipped: 0,
  warning: 0,
  error: 0
}


/**
 * Migrate Items
 * @param {string} name
 * @param {string} itemKey
 * @param {string} dbName
 * @param {function} keyFunc
 * @param {function} filterFunc
 * @return {P}
 */
var migrateItems = function(name,itemKey,dbName,keyFunc,filterFunc){
  logger.log('info','Starting to migrate ' + name + ' records')
  var progress
  debug('requesting ' + name,itemKey)
  var result = []
  var readSize = 0
  var readStreamOpts = {
    url: 'http://' +
      config.couchdb.options.auth.username + ':' +
      config.couchdb.options.auth.password + '@' +
      config.couchdb.host + ':' +
      config.couchdb.port + '/' +
      config.couchdb.database + '/_all_docs?' +
      'startkey=' + encodeURIComponent('"' + itemKey + '"') + '&' +
      'endkey=' + encodeURIComponent('"' + itemKey + '\uffff' + '"')
  }
  debug('creating read stream',readStreamOpts)
  var writeStream = JSONStream.parse('rows.*')
  var readStream = request.get(readStreamOpts)
  var chunkFunc = function(data){
    result.push(data.id)
  }
  readStream.on('data',function(chunk){
    readSize = readSize + chunk.length
    process.stdout.write('Receiving from couch ' +
      (readSize / 1024).toFixed(0) + 'kb\r')
  })
  return promisePipe(readStream,writeStream,eventStream.mapSync(chunkFunc))
    .then(function(){
      debug('write ended',result.length)
      //clear to a new line now that the data print is done
      process.stdout.write('\n')
      //this gives us the inventory keys and now we must select all the docs
      //and place them into the new database, so we will setup a progress bar
      progress = new ProgressBar(
        name + ' [:bar] :current/:total :percent :rate/rps :etas',
        {
          total: result.length,
          width: 50,
          complete: '=',
          incomplete: '-'
        }
      )
      return P.try(function(){
        return result
      })
      .map(function(row){
        if('function' === typeof filterFunc && false === filterFunc(row)){
          throw new Error('skipped')
        }
        return cradle.oose.getAsync(row)
          .then(function(record){
            //we need the new row
            var newKey = keyFunc(record)
            record._id = newKey
            delete record._rev
            return new P(function(resolve){
              cradle[dbName].head(newKey,function(err,res,code){
                if(200 === code){
                  counter.exists++
                  resolve(true)
                }
                else{
                  counter.moved++
                  resolve(cradle[dbName].saveAsync(newKey,record))
                }
              })
            })
          })
          .then(
            function(){
            },
            function(err){
              if(err.message.match(/conflict/i)) counter.exists++
              else throw err
            }
          )
          .catch(function(err){
            if('skipped' !== err.message){
              logger.log('error', err.stack)
              counter.error++
            }
          })
          .finally(function(){
            progress.tick()
          })
        },{concurrency: concurrency[name]})
    })
}


/**
 * Run the interval
 * @param {function} done
 */
var runInterval = function(done){
  //first lets get all the purchases
  migrateItems(
    'store',
    'oose:store:',
    'peer',
    function(record){return cradle.schema.store(record.prism,record.name)}
  )
    .then(function(){
      return migrateItems(
        'prism',
        'oose:prism:',
        'peer',
        function(record){return cradle.schema.prism(record.name)}
      )
    })
    .then(function(){
      return migrateItems(
        'inventory',
        'oose:inventory:',
        'inventory',
        function(record){
          return cradle.schema.inventory(record.hash,record.prism,record.store)
        },
        function(record){return (record.length > 0)}
      )
    })
    .then(function(){
      return migrateItems(
        'purchase',
        'oose:purchase:',
        'purchase',
        function(record){
          return cradle.schema.purchase(record.token)
        },
        function(record){return (record.length > 0)}
      )
    })
    .then(function(){
      logger.log('info',
        'Migration complete, ' +
        counter.moved + ' moved ' +
        counter.exists + ' already exist ' +
        counter.skipped + ' skipped ' +
        counter.warning + ' warn ' +
        counter.error + ' error '
      )
      done()
    })
    .catch(function(err){
      logger.log('error', err.stack)
      done(err)
    })
    .finally(function(){
      logger.log('info','CouchDB Migration complete')
      process.exit()
    })
}

if(require.main === module){
  infant.child(
    'oose:couchMigrator',
    function(done){
      runInterval(done)
    },
    function(done){
      process.nextTick(done)
    }
  )
}

