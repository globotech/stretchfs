#!/usr/bin/node
'use strict';
var P = require('bluebird')
var clc = require('cli-color')
var cp = require('child_process')
var debug = require('debug')('clonetool')
var Table = require('cli-table')
var program = require('commander')
var fs = require('graceful-fs')
var MemoryStream = require('memory-stream')
var ObjectManage = require('object-manage')
var oose = require('oose-sdk')
var path = require('path')
var prettyBytes = require('pretty-bytes')
var ProgressBar = require('progress')
var promisePipe = require('promisepipe')
var random = require('random-js')()

var UserError = oose.UserError

var couchdb = require('../helpers/couchdb')
var hasher = require('../helpers/hasher')
var prismBalance = require('../helpers/prismBalance')
var dns = require('../helpers/dns')
var logger = require('../helpers/logger')
var redis = require('../helpers/redis')()
var FileOp = require('../helpers/FileOp')

var config = require('../config')

var cacheKeyTempFile = '/tmp/oosectkeycache'

//store our master peerList
var peerList = {}

//setup cli parsing
var optDefs = [
  //'short:full:arg:desc'
  'F:folder    :folder:Folder to scan',
  'X:allfiles  :      :Use all files',
  'P:prism     :prism :Use file list from this prism',
  'S:store     :store :Use file list from this store',
  'H:hash      :hash  :Hash of file to check',
  'i:input     :s     :List of Hashes to analyze, use - for stdin',
  'a:above     :n     :Files above this count will be analyzed',
  'A:at        :n     :Files at this count will be analyzed',
  'b:below     :n     :Files below this count will be analyzed',
  'd:desired   :n     :Desired clone count',
  'D:detail    :hash  :Hash of file to get details about',
  'f:force     :      :Force the operation even on this hash',
  'u:verify    :      :Verify file(s), by having stores verify integrity',
  'p:pretend   :      :Don\'t actually make any clones just analyze',
  'v:verbose   :      :Be verbose and show hash list before processing',
  'B:block-size:n     :Number of files to analyze at once',
  ' :clone     :s     :Name of direct store for clones to be sent',
  ' :drop      :s     :Name of direct store to remove clones from'
]
program.version(config.version)
optDefs.forEach(function(v){
  var optDef = v.split(':').map(
    Function.prototype.call.bind(String.prototype.trim)
  )
  var optArg = [
    (optDef[0]?'-'+optDef[0]:'') +
    (optDef[1]?(optDef[0]?', ':'')+'--'+optDef[1]:'') +
    (optDef[2]?' <'+optDef[2]+'>':''),
    (optDef[3]?optDef[3]:undefined)
  ]
  program.option(optArg[0],optArg[1])
})
program
  .parse(process.argv)

var printHeader = function(op){
  console.log('--------------------')
  console.log(op.file.hash + ' starting to process changes')
}

var pluralize = function(a,b,c,d,e){
  var number,printNumber,string,appendSingular,appendMultiple
  if('function' === typeof a){
    //usage case: pluralize(printCb,number,string,appendSingular,appendMultiple)
    number = b
    string = c
    appendSingular = d
    appendMultiple = e
    printNumber = a(number)
  } else {
    //usage case: pluralize(number,string,appendSingular,appendMultiple)
    number = a
    string = b
    appendSingular = c
    appendMultiple = d
    printNumber = ''
  }
  appendSingular = ('string' === typeof appendSingular) ? appendSingular : ''
  appendMultiple = ('string' === typeof appendMultiple) ? appendMultiple : 's'
  return printNumber + string +
    ((1 === (+number)) ? appendSingular : appendMultiple)
}

var printFooter = function(op){
  console.log(op.file.hash,'Processing complete')
}


var analyzeFiles = function(program,progress,fileList){
  var above = false !== program.above ? +program.above : null
  var at = false !== program.at ? +program.at : null
  var below = false !== program.below ? +program.below : null
  var desired = false !== program.desired ? + program.desired : 2
  var ops = {}
  var fileCount = fileList.length
  var blockSize = program.blockSize || 250
  var blockCount = Math.ceil(fileCount / blockSize)
  var analyzeBlock = function(fileBlock){
    return P.try(function(){
      return fileBlock
    })
      .map(function(file){
        if(program.force){
          redis.del(redis.schema.inventory(file))
        }
        return prismBalance.contentExists(file)
          .then(function(record){
            var op = new FileOp(record)
            //do clone math now
            var add = 0
            var remove = 0
            if(
              (null !== above && record.count > above) ||
              (null !== below && record.count < below) ||
              (null !== at && record.count === at)
            )
            {
              if(desired > record.count){
                add = desired - record.count
              }
              else if(desired < record.count){
                remove = record.count - desired
              }
            }
            if(program.clone){
              add = 1
              remove = 0
              op.destination = program.clone
            }
            if(program.drop){
              add = 0
              remove = 1
              op.source = program.drop
            }
            if(0 < add){
              op.action = op.FILE_ACTIONS.copy
              op.repeat = add
            }
            if(0 < remove){
              op.action = op.FILE_ACTIONS.unlink
              op.repeat = remove
            }
            if(program.verify){
              op.action = op.FILE_ACTIONS.verify
            } else if(0 === record.count && 0 < op.repeat){
              //can't clone/verify a file, when we don't have any copies
              op.repeat = 0
            }
            if(0 === op.repeat){
              //operation should be NOP if there is zero repeat
              op.action = op.FILE_ACTIONS.nop
            }
            //compile our record
            ops[record.hash] = op
            progress.tick()
          })
      })
  }
  return P.try(function(){
    var blockList = []
    for(var i = 0; i < blockCount; i++){
      blockList.push(fileList.slice(i * blockSize,(i + 1) * blockSize))
    }
    progress.update(0)
    return blockList
  })
    .each(function(block){
      return analyzeBlock(block)
    })
    .then(function(){
      return ops
    })
}

var addClones = function(file){
  var promises = []
  var storeWinnerList = []
  var addClone = function(file){
    // so to create a clone we need to figure out a source store
    var startStamp = +new Date()
    var prismFromWinner
    var storeFromWinner
    var prismToWinner
    var storeToWinner
    var storeFromList =[]
    var storeToList = []
    //iteration vars
    var prismNameList = []
    var storeNameList = []
    file.map.forEach(function(entry){
      var parts = entry.split(':')
      var prismName = parts[0]
      var storeName = parts[1]
      prismNameList.push(prismName)
      storeNameList.push(storeName)
      storeFromList.push({prism: prismName, store: storeName})
    })
    // randomly select one source store
    storeFromWinner = storeFromList[
      random.integer(0,(storeFromList.length - 1))]
    prismFromWinner = storeFromWinner.prism
    // figure out a destination store
    peerList.forEach(function(peer){
      //skip prisms and whatever else
      if('store' !== peer.type) return
      if(
        peer.prism !== prismFromWinner &&
        -1 === storeWinnerList.indexOf(peer.name) &&
        -1 === file.map.indexOf(peer.prism + ':' + peer.name) &&
        true === peer.available &&
        true === peer.writable
      ){
        storeToList.push({prism: peer.prism, store: peer.name})
      }
    })
    //make sure there is a possibility of a winner
    if(!storeToList.length){
      logger.log('error', file.hash +
        'Sorry! No more available stores to send this to :(')
    } else {
      //figure out a dest winner
      storeToWinner = storeToList[
        random.integer(0,(storeToList.length - 1))]
      storeWinnerList.push(storeToWinner.store)
      prismToWinner = storeToWinner.prism
      //inform of our decision
      logger.log('info',file.hash +
        'Sending from ' + storeFromWinner.store +
        ' on prism ' + prismFromWinner +
        ' to ' + storeToWinner.store + ' on prism ' + prismToWinner)
      var storeFromInfo = selectPeer('store',storeFromWinner.store)
      var sendClient = setupStore(storeFromInfo)
      var sendOptions = {
        file: file.hash + '.' + file.mimeExtension.replace('.',''),
        store: storeToWinner.prism + ':' + storeToWinner.store
      }
      return sendClient.postAsync({
        url: sendClient.url('/content/send'),
        json: sendOptions
      })
        .spread(function(res,body){
          if(body.error){
            var err = new Error(body.error)
            err.stack = body.stack
            throw err
          } else {
            var endStamp = +new Date()
            var fileSize = 1024
            if(body && body.fileDetail &&
              body.fileDetail.stat && body.fileDetail.stat.size){
              fileSize = body.fileDetail.stat.size
            }
            var duration = (endStamp - startStamp) / 1000
            var rate = (((fileSize) / duration) / 1024).toFixed(2)
            logger.log('info', file.hash +
              'Sent ' + prettyBytes(fileSize) + ' to ' + storeToWinner.store +
              ' taking ' + duration +
              ' seconds averaging ' + rate + '/KBs, success!')
          }
        })
        .catch(function(err){
          logger.log('error', file.hash +
            'Failed to send clone to ' + storeToWinner.store,err.message)
        })
        .finally(function(){
          var existsKey = couchdb.schema.inventory(file.hash)
          redis.del(existsKey)
        })
    }
  }
  for(var i = 0; i < file.add; i++){
    promises.push(addClone(file))
  }
  return P.all(promises)
}

var removeClones = function(file){
  var promises = []
  var storeWinnerList = []
  var removeClone = function(file){
    // so to create a clone we need to figure out a source store
    var storeRemoveWinner
    var storeRemoveList = []
    //iteration vars
    var prismNameList = []
    var storeNameList = []
    file.map.forEach(function(entry){
      var parts = entry.split(':')
      var prismName = parts[0]
      var storeName = parts[1]
      if(-1 === config.clonetool.storeProtected.indexOf(storeName)){
        var peer = selectPeer('store',storeName)
        prismNameList.push(prismName)
        storeNameList.push(storeName)
        if(-1 === storeWinnerList.indexOf(storeName) && true === peer.available){
          storeRemoveList.push({prism: prismName,store: storeName})
        }
      }
    })
    //make sure there is a possibility of a winner
    if(!storeRemoveList.length){
      logger.log('error', file.hash +
        'Sorry! No more available stores to remove this from, it is gone. :(')
    } else {
      // now we know possible source stores, randomly select one
      storeRemoveWinner = storeRemoveList[
        random.integer(0,(storeRemoveList.length - 1))]
      storeWinnerList.push(storeRemoveWinner.store)
      //inform of our decision
      logger.log('info',file.hash +
        'Removing from ' + storeRemoveWinner.store +
        ' on prism ' + storeRemoveWinner.prism)
      var selectedStoreInfo = selectPeer('store',storeRemoveWinner.store)
      var storeClient = setupStore(selectedStoreInfo)
      return storeClient.postAsync({
        url: storeClient.url('/content/remove'),
        json: {
          hash: file.hash
        }
      })
        .spread(storeClient.validateResponse())
        .catch(function(err){
          logger.log('error', file.hash + 'Failed to remove clone' +err.message)
        })
        .finally(function(){
          var existsKey = couchdb.schema.inventory(file.hash)
          redis.del(existsKey)
        })
    }
  }
  for(var i = 0; i < file.remove; i++){
    promises.push(removeClone(file))
  }
  return P.all(promises)
}

var verifyFile = function(file){
  //first grab a store to ask for info
  if(!file.count || !file.exists || !(file.map instanceof Array)){
    logger.log('error', file.hash + 'Doesnt exist, cant verify')
    return
  }
var processOp = function(op){
  return P.try(function(){
    return file.map
  })
    .map(function(storeKey){
      var keyParts = storeKey.split(':')
      var storeInfo = selectPeer('store',keyParts[1])
      var storeClient = setupStore(storeInfo)
      return storeClient.postAsync({
        url: storeClient.url('/content/verify'),
        json: {
          file: file.hash + '.' + ('' + file.mimeExtension).replace('.','')
        }
      })
        .spread(function(res,body){
          if(body && body.error){
            logger.log('error', file.hash + 'Verify failed ' + body.error +
              ' on ' + keyParts[1] + ' inventory purged')
          } else if(body && 'ok' === body.status){
            logger.log('info', file.hash +
              'Inventory verification complete on ' + keyParts[1])
          } else if(body && 'fail' === body.status){
            logger.log('error', file.hash +
              'Invalid content on ' + keyParts[1] + ' clone removed')
          } else {
            logger.log('error', file.hash + 'Unknown issue' +body)
          }
        })
        .catch(function(err){
          logger.log('error', file.hash +
            'Failed to verify inventory' + err.message)
        })
        .finally(function(){
          var existsKey = couchdb.schema.inventory(file.hash)
          redis.del(existsKey)
        })
    })
}

var printHeader = function(file){
  logger.log('info','--------------------')
  logger.log('info', file.hash + ' starting to process changes')
}

var printFooter = function(file){
  logger.log('info', file.hash + 'Processing complete')
}

var cloneFile = function(file){
  //first grab a store to ask for info
  if(!file.count || !file.exists || !(file.map instanceof Array)){
    logger.log('error', file.hash + 'Doesnt exist, cannot clone')
    return
  }
  return P.try(function(){
    return file.map[random.integer(0,file.map.length - 1)]
  })
    .then(function(storeKey){
      var keyParts = storeKey.split(':')
      var storeFromInfo = selectPeer('store',keyParts[1])
      var storeToInfo = selectPeer('store',program.clone)
      var storeFromClient = setupStore(storeFromInfo)
      var sendOptions = {
        file: file.hash + '.' + file.mimeExtension.replace('.',''),
        store: storeToInfo.prism + ':' + storeToInfo.name
      }
      return storeFromClient.postAsync({
        url: storeFromClient.url('/content/send'),
        json: sendOptions
      })
        .spread(function(res,body){
          if(body.error){
            var err = new Error(body.error)
            err.stack = body.stack
            throw err
          } else {
            logger.log('info', file.hash +
              'Send from ' + storeFromInfo.name +
              ' to ' + storeToInfo.name + ' complete')
          }
        })
        .catch(function(err){
          logger.log('error', file.hash +
            'Failed to send clone to ' + storeToInfo.store,err.message)
        })
        .finally(function(){
          var existsKey = couchdb.schema.inventory(file.hash)
          redis.del(existsKey)
        })
    })
}

var removeFile = function(file){
  //first grab a store to ask for info
  if(!file.count || !file.exists || !(file.map instanceof Array)){
    logger.log('error', file.hash + 'Doesnt exist, cannot remove')
    return
  }
  return P.try(function(){
    var storeInfo = selectPeer('store',program.drop)
    var storeClient = setupStore(storeInfo)
    return storeClient.postAsync({
      url: storeClient.url('/content/remove'),
      json: {
        hash: file.hash
      }
    })
      .spread(function(res,body){
        if(body.error){
          var err = new Error(body.error)
          err.stack = body.stack
          throw err
        } else {
          logger.log('info', file.hash + 'Remove from ' +
            storeInfo.name + ' complete')
        }
      })
      .catch(function(err){
        logger.log('error', file.hash +
          'Failed to remove clone from ' + storeInfo.store + err.message)
      })
      .finally(function(){
        var existsKey = couchdb.schema.inventory(file.hash)
        redis.del(existsKey)
      })
  })
}

var processFile = function(file){
  return P.try(function(){
    if(program.clone || program.drop || op.FILE_ACTIONS.nop < op.action)
      printHeader(op)
    //manual processing
    if(program.clone){
      return op.cloneFile(op)
        .then(function(){printFooter(op)})
    } else if(program.drop){
      return op.removeFile(op)
        .then(function(){printFooter(op)})
    } else if(0 < op.repeat &&
      -1 < [
        op.FILE_ACTIONS.copy,
        op.FILE_ACTIONS.unlink,
        op.FILE_ACTIONS.verify
      ].indexOf(op.action)
    ){
      //normal processing
      switch(op.action){
      case op.FILE_ACTIONS.copy:
        return op.addClones(op)
          .then(function(){printFooter(op)})
        break
      case op.FILE_ACTIONS.unlink:
        return op.removeClones(op)
          .then(function(){printFooter(op)})
        break
      case op.FILE_ACTIONS.verify:
        return op.verifyFile(op)
          .then(function(){printFooter(op)})
        break
      default:
        return P.try(function(){console.log('processOp hit default case??',op)})
      }
    }
  })
}

var relativePath = function(hash,ext){
  ext = ('' + ext).replace('.','')
  var result = ''
  for(var i = 0; i < hash.length; i++){
    if(0 === i % 2) result = result + '/'
    result = result + hash.charAt(i)
  }
  result = result + '.' + ext
  return result
}

var contentDetail = function(hash){
  return prismBalance.contentExists(hash,false)
    .then(function(result){
      var _conlog = function(str){
        console.log(process.stdout.isTTY ? str : clc.strip(str))
      }
      var table = new Table()
      table.push(
        {HASH: clc.yellow(result.hash)},
        {'File Extension': clc.cyan(result.mimeExtension)},
        {'Size': clc.cyan(prettyBytes(+(result.size || 0)))},
        {'Relative Path': clc.yellow(
          relativePath(result.hash,result.mimeExtension))},
        {Exists: result.exists ? clc.green('Yes') : clc.red('No')},
        {'Clone Count': clc.green(result.count)}
      )
      logger.log('info', table.toString())
      logger.log('info','Storage Map')
      logger.log('info','--------------------')
      _conlog(table.toString())
      _conlog('Storage Map')
      _conlog('--------------------')
      result.map.forEach(function(entry){
        var parts = entry.split(':')
        var prismName = parts[0]
        var storeName = parts[1]
        logger.log('info', '    ' + clc.cyan(prismName) +
          ':' + clc.green(storeName))
        _conlog('    ' + clc.cyan(prismName) + ':' + clc.green(storeName))
      })
      logger.log('info', '\n Total: ' +
        clc.yellow(result.count) + ' clone(s)\n')
      _conlog('\n Total: ' +
        pluralize(clc.yellow,result.count,' clone') + '\n'
      )
      process.exit()
    })
}


/**
 * Scan folder for files to check
 * @param {string} folderPath
 * @param {Stream} fileStream
 * @return {P}
 */
var folderScan = function(folderPath,fileStream){
  var root = path.resolve(folderPath)
  var contentFolder = root
  var hashList = []
  if(!fs.existsSync(root))
    throw new Error('Scan folder does not exist')


  /**
   * Stat counters
   * @type {object}
   */
  var counter = {
    warning: 0,
    error: 0,
    invalid: 0,
    valid: 0,
    bytes: 0,
    bytesReceived: 0
  }

  debug('starting to scan',contentFolder)
  return new P(function(resolve,reject){
    var buffer = ''
    var cmd = cp.spawn(
      'find',
      [contentFolder,'-type','f'],
      {
        cwd: '/',
        maxBuffer: 4294967296,
        stdio: ['pipe','pipe',process.stderr]
      }
    )
    cmd.stdout.on('data',function(chunk){
      counter.bytesReceived = counter.bytesReceived + chunk.length
      process.stdout.write('Receiving from find ' +
        (counter.bytesReceived / 1024).toFixed(0) + 'kb\r')
      buffer = buffer + '' + chunk.toString()
    })
    cmd.on('close',function(code){
      //clear to a new line now that the data print is done
      process.stdout.write('\n')
      if(code > 0) return reject(new Error('Find failed with code ' + code))
      debug('finished find, splitting and starting processing')
      var fileCount = 0
      var progress
      P.try(function(){
        var lines = buffer
          .split('\n')
          .filter(function(item){return '' !== item})
          .map(function(val){
            return path.resolve(val)
          })
        fileCount = lines.length
        logger.log('info','Parsed find result into ' + fileCount + ' files')
        progress = new ProgressBar(
          '  scanning [:bar] :current/:total :percent :rate/fps :etas',
          {
            renderThrottle: 1000,
            total: fileCount,
            width: 50,
            complete: '=',
            incomplete: '-'
          }
        )
        return lines
      })
        .map(function(filePath){
          filePath = path.posix.resolve(filePath)
          debug('got a hit',filePath)
          var relativePath = path.posix.relative(contentFolder,filePath)
          var stat = fs.statSync(filePath)
          counter.bytes += stat.size
          var ext = relativePath.match(/\.(.+)$/)[0]
          var hash = relativePath.replace(/[\\\/]/g,'').replace(/\..+$/,'')
          var hashType = hasher.identify(hash)
          //skip invalid inventory entries
          progress.tick()
          if(!hash.match(hasher.hashExpressions[hashType])){
            counter.invalid++
            debug(hash,hashType,'invalid hash')
          }
          //otherwise try and insert them into inventory if they are not already
          //there
          else {
            counter.valid++
            debug(hash,'inventory scan found',ext,relativePath)
            fileStream.write(hash + '\n')
            hashList.push({
              hashType: hashType,
              hash: hash,
              ext: ext,
              relativePath: relativePath
            })
          }
        },{concurrency: config.store.inventoryConcurrency})
        .then(function(){
          debug('folder scan complete',counter,hashList)
          resolve(counter,hashList)
        })
        .catch(function(err){
          logger.log('error', 'file process error' +err)
          reject(err)
        })
    })
  })
}


/**
 * Scan inventory keys and return filtered hashes to the file stream
 * @param {string} type type of key either prism or store
 * @param {string} key the key itself such as om101
 * @param {object} fileStream the file stream to write results to
 * @return {P}
 */
var keyScan = function(type,key,fileStream){
  var keyBlockSize = 250000
  var keyList = []
  var totalRows = 1
  var inventoryKeyDownload = function(progress){
    // use a view to only transfer _id (no data since we don't use it here)
    // _design/keyList/all: { map: function(doc){emit(null,'')} }
    return couchdb.inventory.viewAsync('keyList/all',
      {limit: keyBlockSize, skip: keyList.length}
    )
      .then(function(result){
        totalRows = result.total_rows
        if(totalRows !== progress.total){
          progress.total = totalRows
        }
        result.rows.forEach(function(row){
          keyList.push(row.id)
          progress.tick()
        })
        if(!progress.complete){
          return inventoryKeyDownload(progress)
        } else {
          return keyList
        }
      })
  }
  var cacheKeyDownload = function(){
    return new P(function(resolve,reject){
      if(!fs.existsSync(cacheKeyTempFile)){
        logger.log('info','Starting to download a fresh copy ' +
          'of inventory keys, stand by.')
        var progress = new ProgressBar(
          ' downloading [:bar] :current/:total :percent :rate/ks :etas',
          {
            renderThrottle: 1000,
            complete: '=',
            incomplete: ' ',
            width: 20,
            total: totalRows
          }
        )
        progress.update(0)
        return inventoryKeyDownload(progress)
          .then(function(result){
            result = result.sort()
            fs.writeFileSync(cacheKeyTempFile,JSON.stringify(result))
            resolve(result)
          })
      } else {
        logger.log('info','Reading inventory keys from cache')
        var result = fs.readFileSync(cacheKeyTempFile)
        console.log('Reading inventory keys from cache')
        try {
          result = JSON.parse(result)
          resolve(result)
        } catch(e){
          reject(e)
        }
      }
    })
  }
  var prevHash = 8675309
  return cacheKeyDownload()
    .map(function(inventoryKey){
      var parts = inventoryKey.split(':')
      if(!parts || 3 !== parts.length) return;
      if(prevHash === parts[0]) return; // skip dupes of previous winners
      if('allfiles' !== type && 'prism' === type && parts[1] !== key) return;
      if('allfiles' !== type && 'store' === type && parts[2] !== key) return;
      if(8675309 !== prevHash) fileStream.write('\n')
      fileStream.write(prevHash = parts[0])
    })
}

var ops = {}
var fileStream = new MemoryStream()
var fileList = []
var fileCount = 0
P.try(function(){
  var welcomeMessage = 'Welcome to the OOSE v' + config.version + ' clonetool!'
  logger.log('info', welcomeMessage)
  logger.log('info','--------------------')
  if(program.detail){
    return contentDetail(program.detail)
  }
  //do some validation
  if(!program.hash && !program.input && !program.folder &&
    !program.store && !program.prism && !program.allfiles){
    throw new UserError('No hash list or hash provided')
  }
  if(program.drop && !program.force){
    throw new UserError('Clone removal operation called without -f, bye.')
  }
  //set the desired to the default from config if not set
  if(!program.desired) program.desired = config.clonetool.desired
  //validate some logic states into booleans once, here
  program.at = parseInt(program.at,10)
  program.above = parseInt(program.above,10)
  program.below = parseInt(program.below,10)
  var validAt = function(){
    return (('number' === typeof program.at) && (-1<program.at))
  }
  var validAbove = function(){
    return (('number' === typeof program.above) && (0<program.above))
  }
  var validBelow = function(){
    return (('number' === typeof program.below) && (0<program.below))
  }
  //if no other target information provided look for files below the default
  if(!validBelow() && !validAbove() && !validAt()){
    program.below = +program.desired
  }
  if(validBelow()){
    program.at = false
    program.above = false
  }
  if(validAt()){
    program.above = false
    program.below = false
  }
  //print rule changes
  var changeVerb = 'somewhat near'
  if(validBelow()) changeVerb = 'below'
  if(validAbove()) changeVerb = 'above'
  if(validAt())    changeVerb = 'at'
  logger.log('info', 'You have asked for ' + program.desired +
    ' clone(s) of each file ' + changeVerb +
    ' ' + program[changeVerb] + ' clone(s)')
  logger.log('info','--------------------')
  //obtain peer list
  logger.log('info','Obtaining peer list')
  return prismBalance.peerList()
})
  .then(function(result){
    peerList = result
    //post-process peerList
    logger.log('info','Resolving location information from DNS')
    var promises = []
    var progress = new ProgressBar(
      '  resolving [:bar] :current/:total :percent :rate/s :etas',
      {
        total: peerList.length,
        width: 20,
        complete: '=',
        incomplete: ' '
      }
    )
    progress.update(0)
    for(var i=0; i<peerList.length; i++){
      var peer = peerList[i]
      //overlay any tagged 'protected' into config list
      if(true === peerList[i].protected && -1 === config.clonetool.storeProtected.indexOf(peerList[i].name)){
        config.clonetool.storeProtected.push(peerList[i].name)
      }
      //load location info from DNS PTRs
      var dnsReverse = function(peerList,i){
        return dns.reverseAsync(peerList[i].host)
        .spread(function(res,err){
          progress.tick()
          if(err){ throw err } else {
            var parts = res.split('-')
            if(peerList[i].name === parts[0]){
              peerList[i].machine = parts[1]
              peerList[i].zone    = parts[2]
              peerList[i].domain  = parts[3]
            }
          }
        })
        .catch(function(err){
          logger.log('error', 'Failed to lookup reverse DNS for ' +
            peerList[i].host,err)
        })
      }
      promises.push(dnsReverse(peerList,i))
    }
    return P.all(promises)
  })
  .then(function(){
    logger.log('info','Peer list obtained!')
    //get file list together
    if(program.hash){
      fileStream.write(program.hash)
    } else if(program.force){
      fileStream.write(program.force)
    } else if(program.store){
      return keyScan('store',program.store,fileStream)
    } else if(program.prism){
      return keyScan('prism',program.prism,fileStream)
    } else if(program.allfiles){
      return keyScan('allfiles',null,fileStream)
    } else if(program.folder){
      return folderScan(program.folder,fileStream)
    } else if('-' === program.input){
      return promisePipe(process.stdin,fileStream)
    } else {
      return promisePipe(fs.createReadStream(program.input),fileStream)
    }
  })
  if(validAt()) changeVerb = 'at'
  console.log('You have asked for ' + program.desired +
    pluralize(program.desired,' clone') +
    ' of each file ' + changeVerb +
    ' ' + program[changeVerb] +
    pluralize(program[changeVerb],' clone')
  )
  console.log('--------------------')

  //get file list together
  if(program.hash){
    fileStream.write(program.hash)
  } else if(program.force){
    fileStream.write(program.force)
  } else if(program.store){
    return keyScan('store',program.store,fileStream)
  } else if(program.prism){
    return keyScan('prism',program.prism,fileStream)
  } else if(program.allfiles){
    return keyScan('allfiles',null,fileStream)
  } else if(program.folder){
    return folderScan(program.folder,fileStream)
  } else if('-' === program.input){
    return promisePipe(process.stdin,fileStream)
  } else {
    return promisePipe(fs.createReadStream(program.input),fileStream)
  }
})
  .then(function(){
    fileList = fileStream.toString().split('\n')
    console.log('Input ' + fileList.length +
      pluralize(fileList.length,' entr','y','ies') + ', filtering'
    )
    var pruned = {}
    fileList = fileList.filter(function(a){
      return a.match(hasher.hashExpressions[hasher.identify(a)])
    })
    if(!program.force){
      fileList.forEach(function(file,i){
        if(config.clonetool.hashWhitelist.indexOf(file) >= 0){
          logger.log('info', file +
            'Is whitelisted and will not be analyzed, use -f to force')
          fileList.splice(i,1)
        }
      })
    }
      var rv = !!(a.match(hasher.hashExpressions[hasher.identify(a)]))
      if(rv && (!program.force) &&
        (-1 !== config.clonetool.hashWhitelist.indexOf(a))
      ){
        pruned[a] = true
        rv = false
      }
      return rv
    })
    Object.keys(pruned).forEach(function(k){
      console.log(k,'is whitelisted and will not be analyzed, use -f to force')
    })
    fileCount = fileList.length
    if(0 === fileCount){
      logger.log('info','No files left to analyze, bye')
      process.exit()
    }
    console.log('Found ' + fileCount +
      pluralize(fileCount,' file') +
      ' to be analyzed'
    )
    //console.log(fileList)

    var progress = new ProgressBar(
      '  analyzing [:bar] :current/:total :percent :rate/fs :etas',
      {
        renderThrottle: 1000,
        total: fileCount,
        width: 20,
        complete: '=',
        incomplete: ' '
      }
    )
    logger.log('info', 'Found ' + fileCount + ' file(s) to be analyzed')
    //console.log(fileList)
    return analyzeFiles(program,progress,fileList)
  })
  .then(function(result){
    ops = result
    var keys = Object.keys(ops)
    var op
    var doesntExist = 0
    var add = 0
    var addTotal = 0
    var remove = 0
    var removeTotal = 0
    var verify = 0
    var unchanged = 0
    keys.forEach(function(hash){
      op = ops[hash]
      if(!op.file.exists){
        doesntExist++
        if(program.verbose){
          console.log(op.file.hash + ' doesn\'t exist. :(')
        }
      }
      else if(op.FILE_ACTIONS.copy === op.action && op.repeat > 0){
        addTotal = addTotal + (+op.repeat)
        add++
        if(program.verbose){
          logger.log('info', file.hash + ' has ' + file.count +
            ' clones and needs ' + file.add + ' more')
          console.log(op.file.hash + ' has ' + op.file.count +
            ' clones and needs ' + op.repeat + ' more')
        }
      }
      else if(op.FILE_ACTIONS.unlink === op.action && op.repeat > 0){
        removeTotal = removeTotal + (+op.repeat)
        remove++
        if(program.verbose){
          logger.log('info', file.hash + ' has ' + file.count +
            ' clones and needs ' + file.remove + ' less')
          console.log(op.file.hash + ' has ' + op.file.count +
            ' clones and needs ' + op.repeat + ' less')
        }
      }
      else if(op.FILE_ACTIONS.verify === op.action && op.repeat > 0){
        verify++
        if(program.verbose){
          console.log(op.file.hash + ' has ' + op.file.count +
            ' clones to be verified')
        }
      }
      else unchanged++
    })
    logger.log('info','Analysis complete...')
    logger.log('info','--------------------')
    logger.log('info', fileCount + ' total file(s)')
    logger.log('info', add + ' file(s) want clones totalling ' +
      addTotal + ' new clone(s)')
    logger.log('info', remove + ' file(s) dont need as many clones totalling ' +
      removeTotal + ' fewer clones')
    logger.log('info', unchanged + ' file(s) will not be changed')
    logger.log('info', doesntExist + ' file(s) dont exist')
    logger.log('info', '--------------------')
    console.log('Analysis complete...')
    console.log('--------------------')
    console.log(fileCount + ' total ' + pluralize(fileCount,'file'))
    console.log(add + pluralize(add,' file') +
      pluralize(add,' want','s','') + ' clones' +
      ' totalling ' + addTotal + ' new ' + pluralize(addTotal,'clone')
    )
    console.log(remove + pluralize(remove,' file') +
      pluralize(remove,' want','s','') + ' less clones' +
      ' totalling ' + removeTotal + ' fewer ' + pluralize(removeTotal,'clone')
    )
    console.log(verify + pluralize(verify,' file') +
      ' will be verified'
    )
    console.log(unchanged + pluralize(unchanged,' file') +
      ' will not be changed'
    )
    console.log(doesntExist + pluralize(doesntExist,' file') +
      pluralize(doesntExist,' ','does','do') + 'n\'t exist'
    )
    console.log('--------------------')
    if(program.pretend){
      logger.log('info', 'Pretend mode selected, taking no action, bye!')
      process.exit()
    }

    //obtain peer list
    console.log('Obtaining peer list')
    return prismBalance.peerList()
  })
  .then(function(result){
    peerList = result
    console.log('Peer list obtained!')
    //process the files
    return Object.keys(ops)
  })
  .each(function(hash){
    ops[hash].setPeerList(peerList)
    return processOp(ops[hash])
  })
  .then(function(){
    logger.log('info','Operations complete, bye!')
    process.exit()
  })
  .catch(UserError,function(err){
    logger.log('error','Oh no! An error has occurred :(')
    logger.log('error', err.message)
    process.exit()
  })
