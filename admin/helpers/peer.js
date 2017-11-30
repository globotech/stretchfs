'use strict';
var P = require('bluebird')
var fs = require('graceful-fs')
var net = require('net')
var string = require('string')

var couch = require('../../helpers/couchbase')
var SSH = require('../helpers/ssh')

var config = require('../../config')

//open some buckets
var cb = couch.stretchfs()


/**
 * Valid peer status def
 * @type {[string,string,string]}
 */
module.exports.validStatuses = ['unknown','online','offline','error','inactive']
var validStatuses = module.exports.validStatuses


/**
 * Peer action settings
 * @type {{restart: {name: string, status: string, finalStatusSuccess: string, finalStatusError: string, cmd: string}, stop: {name: string, status: string, finalStatusSuccess: string, finalStatusError: string, cmd: string}, start: {name: string, status: string, finalStatusSuccess: string, finalStatusError: string, cmd: string}}}
 */
var actions = {
  restart: {
    name: 'restart',
    status: 'ok',
    cmd: ['ndt all restart']
  },
  stop: {
    name: 'stop',
    status: 'stopped',
    cmd: ['ndt all stop']
  },
  start: {
    name: 'start',
    status: 'ok',
    cmd: ['ndt all start']
  }
}


/**
 * Async Failure handler
 * @param {function} next
 * @return {Function}
 */
var commandFail = function(next){
  return function(err){ next('Command failed: ' + err) }
}


/**
 * Find a peer in mongo by id
 * @param {string} key
 * @return {P}
 */
var peerFind = function(key){
  return cb.getAsync(key)
}


/**
 * Connect to a peer using net
 * @param {object} peer
 * @return {P}
 */
var peerNetConnect = function(peer){
  return new P(function(resolve,reject){
    if(!peer.ip) return reject('No IP defined for the peer')
    var client = net.connect(peer.sshPort || 22,peer.ip)
    client.on('connect',function(){
      client.end()
      resolve()
    })
    client.on('error',function(err){
      reject('Failed to connect to peer SSH: ' + err.code)
    })
  })
}


/**
 * Start a new SSH helper and connect to a peer
 * @param {object} peer
 * @return {P}
 */
var peerSshConnect = function(peer){
  return new P(function(resolve,reject){
    var ssh = new SSH()
    ssh.connect(
      peer,
      fs.readFileSync(config.executioner.ssh.privateKey),
      function(err){
        if(err) return reject(err)
        resolve()
      })
  })
}


/**
 * Log the result of an action to the peer
 * @param {object} peer
 * @param {string} level
 * @param {string} msg
 * @param {string} status
 * @return {P}
 */
var peerLog = function(peer,level,msg,status){
  //TODO: this should be an atomic update
  peer.value.log.push({message: msg, level: level})
  if(status && -1 < validStatuses.indexOf(status)) peer.value.status = status
  return cb.upsertAsync(peerKey,peer.value,{cas: peer.cas})
}


/**
 * Display a banner in a writable stream
 * @param {Stream.Writable} writable
 * @param {string} msg
 */
exports.banner = function(writable,msg){
  var line = string('-').repeat(msg.length).s
  writable.write('\n' + line + '\n')
  writable.write(msg + '\n')
  writable.write(line + '\n')
}


/**
 * Prepare screen for output
 * @param {object} res
 * @param {string} title
 */
exports.outputStart = function(res,title){
  res.set('X-Accel-Buffering','no')
  res.set('Content-Type','text/html')
  res.write(
    '<html><head><title>' + ((title) ? title : '') + '</title>' +
    '<style type="text/css">' +
    'body {background:#000;color:#fff;font-family:monospace;font-size:16px;}' +
    '</style>' +
    '<script type="text/javascript">\n' +
    'var scrollBottom = ' +
    'function(){window.scrollTo(0,document.body.scrollHeight)};\n' +
    'var scrollInt = setInterval(scrollBottom,100);\n' +
    '</script></head><body>\n')
  res.write('<pre>') //this one begins streaming mode
}


/**
 * End output that was prepared
 * @param {object} res
 */
exports.outputEnd = function(res){
  res.end('</pre>' +
    '<script type="text/javascript">\nscrollBottom();\n' +
    'clearInterval(scrollInt);\n</script>' +
    '</body></html>')
}


/**
 * Test a peer
 * @param {string} key
 * @return {P}
 */
exports.test = function(key){
  var peer
  var client
  return peerFind(key)
    .then(function(result){
      peer = result
      exports.banner(writable,'Peer ' + peer.hostname)
      return peerNetConnect(peer)
    })
    .then(function(){
      //attempt to login to the peer with ssh
      return peerSshConnect(peer)
    })
    .then(function(result){
      client = result
      client.on('error',commandFail(function(err){
        throw new Error('Command failed: ' + err,err)
      }))
      //find out some information about the peer
      return client.commandBuffered('cat /etc/debian_version')
    })
    .then(function(result){
      var version = result.trim()
      if(!version) return next('Could not get the version of Debian')
      var match = version.match(/^(\d+)\.(\d+)/)
      if((!match[1]) || ((match[1] >> 0) < 7)){
        throw new Error('This version of Debian is too old: ' + version)
      }
      return peerLog(
        key,
        peer,
        'success',
        'Successfully communicated with peer and tested OS validity',
        peer.status.match(/error|unknown/i) ? 'staging' : peer.status,
        next
      )
    })
    .catch(function(err){
      return peerLog(key,peer,'error',err,'error',next)
    })
}


/**
 * Refresh a peer
 * @param {string} key
 * @return {P}
 */
exports.refresh = function(key){
  var peer
  var client
  return peerFind(key)
    .then(function(result){
      peer = result
      exports.banner(writable,'Peer ' + peer.hostname)
      return peerSshConnect(peer)
    })
    .then(function(result){
      client = result
      client.on('error',commandFail(function(err){
        throw new Error('Command failed: ' + err,err)
      }))
      return client.commandBuffered('cat /etc/debian_version')
    })
    .then(function(result){
      result = result.trim()
      if(!result)
        throw new Error('Could not get the version of Debian')
      peer.os.name = 'Debian'
      peer.os.version = result
      return client.commandBuffered('uname -r')
    })
    .then(function(result){
      result = result.trim() || peer.os.kernel
      peer.os.kernel = result
      return client.commandBuffered('uname -m')
    })
    .then(function(result){
      result = result.trim() || peer.os.arch
      peer.os.arch = result
      return client.commandBuffered(
        'node -p "JSON.parse(' +
        'require(\'fs\').readFileSync(\'/opt/oose/package.json\'))' +
        '.version"'
      )
    })
    .then(function(result){
      peer.version = result.trim() || 'unknown'
      return client.commandBuffered('cat /proc/uptime')
    })
    .then(function(result){
      peer.os.uptime = result.trim().split(' ')[0] || undefined
      return client.commandBuffered('cat /proc/loadavg')
    })
    .then(function(result){
      result = result.trim().split(' ').splice(0,3) || undefined
      peer.os.load = result
      return peerLog(key,peer,'info','Successfully refreshed peer',null)
    })
    .catch(function(err){
      return peerLog(key,peer,'warning',err,null)
    })
}


/**
 * Prepare peer for installation
 * @param {string} key peer id
 * @param {Stream.Writable} writable
 * @return {P}
 */
exports.prepare = function(key,writable){
  var peer
  var client
  return peerFind(key)
    .then(function(result){
      peer = result
      exports.banner(writable,'Peer ' + peer.hostname)
      return peerSshConnect(peer)
    })
    .then(function(result){
      client = result
      client.on('error',commandFail(function(err){
        throw new Error('Command failed: ' + err,err)
      }))
      return client.sendFile(
        config.executioner.ssl.key,
        '/etc/nginx/ssl/ssl.key'
      )
    })
    .then(function(){
      return client.sendFile(
        config.executioner.ssl.crt,
        '/etc/nginx/ssl/ssl.crt'
      )
    })
    .then(function(){
      //run preparation script
      return client.scriptStream(__dirname + '/../scripts/prepare.sh',writable)
    })
    .then(function(){
      return peerLog(
        key,
        peer,
        'success',
        'Successfully prepared peer for installation',
        null
      )
    })
    .catch(function(err){
      return peerLog(key,peer,'error',err,'error')
    })
}


/**
 * Install peer
 * @param {string} key peer id
 * @param {Stream.Writable} writable
 * @return {P}
 */
exports.install = function(key,writable){
  var peer
  var client
  return peerFind(key)
    .then(function(result){
      peer = result
      exports.banner(writable,'Peer ' + peer.hostname)
      return peerSshConnect(peer)
    })
    .then(function(result){
      client = result
      client.on('error',commandFail(function(err){
        throw new Error('Command failed: ' + err,err)
      }))
      return client.scriptStream(__dirname + '/../scripts/install.sh',writable)
    })
    .then(function(){
      return peerLog(
        key,
        peer,
        'success',
        'Successfully installed peer',
        'stopped'
      )
    })
    .catch(function(){
      return peerLog(key,peer,'error',err,'error')
    })
}


/**
 * Upgrade a peer
 * @param {string} key
 * @param {Stream.Writable} writable
 * @return {P}
 */
exports.upgrade = function(key,writable){
  var peer
  var client
  return peerFind(key)
    .then(function(result){
      peer = result
      exports.banner(writable,'Peer ' + peer.hostname)
      return peerSshConnect(peer)
    })
    .then(function(result){
      client = result
      client.on('error',commandFail(function(err){
        throw new Error('Command failed: ' + err,err)
      }))
      return client.scriptStream(__dirname + '/../scripts/upgrade.sh',writable)
    })
    .then(function(){
      return peerLog(key,peer,'success','Successfully upgraded peer',null)
    })
    .catch(function(err){
      return peerLog(peer,'error',err,null)
    })
}


/**
 * Update config
 * @param {string} key peer key
 * @return {P}
 */
exports.updateConfig = function(key){
  var peer
  var client
  var sftp
  return peerFind(key)
    .then(function(result){
      peer = result
      exports.banner(writable,'Peer ' + peer.hostname)
      return peerSshConnect(peer)
    })
    .then(function(result){
      client = result
      client.on('error',commandFail(function(err){
        throw new Error('Command failed: ' + err,err)
      }))
      return client.client.sftp()
    })
    .then(function(result){
      sftp = result
      //rename old config file
      return sftp.rename(
        '/opt/oose/config.local.js',
        '/opt/oose/config.local.js.bak'
      )
    })
    .then(function(){
      return new P(function(resolve,reject){
        var stream = sftp.createWriteStream(
          '/opt/oose/config.local.js'
        )
        stream.on('error',function(err){reject(err)})
        stream.on('finish',function(){resolve()})
        stream.end(peer.config)
      })
    })
    .then(function(){
      return peerLog(key,peer,'info','Successfully updated config',null)
    })
    .catch(function(err){
      return peerLog(key,peer,'warning',err,null)
    })
}


/**
 * Peer action (start,stop,restart)
 * @param {string} key
 * @param {object} action
 * @return {P}
 */
exports.action = function(key,action){
  var peer
  var client
  return peerFind(key)
    .then(function(result){
      peer = result
      exports.banner(writable,'Peer ' + peer.hostname)
      action = actions[action]
      if(!action) throw new Error('Could not find action preset')
      return peerSshConnect(peer)
    })
    .then(function(result){
      client = result
      client.on('error',commandFail(function(err){
        throw new Error('Command failed: ' + err,err)
      }))
      return client.commandBuffered(action.cmd)
    })
    .then(function(){
      return peerLog(
        key,
        peer,
        'info',
        'Peer ' + action.name + ' successful',
        action.status || null
      )
    })
    .catch(function(err){
      return peerLog(key,peer,'warning',err,null)
    })
}


/**
 * Custom command
 * @param {string} key
 * @param {string} command
 * @param {Stream.Writable} writable
 * @return {P}
 */
exports.custom = function(key,command,writable){
  var peer
  var client
  return peerFind(key)
    .then(function(result){
      peer = result
      exports.banner(writable,'Peer ' + peer.hostname)
      return peerSshConnect(peer)
    })
    .then(function(result){
      client = result
      client.on('error',commandFail(function(err){
        throw new Error('Command failed: ' + err,err)
      }))
      return client.commandShell(command,writable)
    })
    .then(function(){
      return peerLog(
        key,
        peer,
        'success',
        'Successfully executed: ' + command,
        null
      )
    })
    .catch(function(err){
      return peerLog(
        key,
        peer,
        'error',
        'Error executing ' + command + ':' + err,
        null
      )
    })
}
