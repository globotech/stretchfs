'use strict';
var P = require('bluebird')
var debug = require('debug')('oose:executioner:helper:ssh')
var EventEmitter = require('events').EventEmitter
var Password = require('node-password').Password
var path = require('path')
var promisePipe = require('promisepipe')
var ss = require('stream-stream')
var Ssh2 = require('ssh2')
var through2 = require('through2')



/**
 * SSH Peer Helper
 * @constructor
 */
var SSH = function(){
  var that = this
  EventEmitter.call(that)
  that.client = new Ssh2()
  that.client.on('error',function(err){that.emit('error',err)})
}
SSH.prototype = Object.create(EventEmitter.prototype)


/**
 * Prepare an SSH connection to a peer
 * @param {peer} peer
 * @param {string} privateKey
 * @return {P}
 */
SSH.prototype.connect = function(peer,privateKey){
  var that = this
  return new P(function(resolve,reject){
    var client = new Ssh2()
    var complete = function(err){
      if(err) reject(err)
      else resolve(err)
    }
    client.once('error',complete)
    client.on('ready',function(){
      client.removeListener('error',complete)
      that.client = client
      resolve(that)
    })
    client.connect({
      host: peer.ip,
      port: peer.sshPort || 22,
      username: peer.sshUsername || 'root',
      privateKey: privateKey
    })
  })
}


/**
 * Run an ssh command buffer the output
 * @param {string} cmd
 * @return {P}
 */
SSH.prototype.commandBuffered = function(cmd){
  var client = this.client
  if(!(cmd instanceof Array)) cmd = [cmd]
  var out = ''
  return P.try(function(){
    return cmd
  })
    .each(function(command){
      return new P(function(resolve,reject){
        client.exec(command,function(err,stream){
          if(err) return reject(err)
          var exitCode = 0
          var buffer = ''
          var concat = ss()
          var writable = through2(function(chunk,enc,next){
            buffer = buffer + chunk
            next(null,chunk)
          })
          writable.setEncoding('utf-8')
          concat.write(stream)
          concat.write(stream.stderr)
          concat.end()
          stream.on('exit',function(code){
            exitCode = code
          })
          promisePipe(concat,writable)
            .then(function(){
              var err = null
              if(0 !== exitCode)
                err = 'Failed to execute (' + exitCode + '): ' + command
              //save the buffer
              out = out + buffer
              if(err) reject(err)
              else resolve(out)
            })
            .catch(function(err){
              reject('Failed in stream ' + err.source + ': ' + err.message)
            })
        })
      })
    })
}


/**
 * Run a ssh command stream the output
 * @param {string} cmd
 * @param {Stream.Writable} writable
 * @return {P}
 *
SSH.prototype.commandStream = function(cmd,writable){
  var client = this.client
  if(!(cmd instanceof Array)) cmd = [cmd]
  return P.try(function(){
    return cmd
  })
    .each(function(command){
      return new P(function(resolve,reject){
        client.exec(command,function(err,stream){
          if(err) return reject(err)
          var exitCode
          stream.on('exit',function(code){
            exitCode = code
          })
          promisePipe(stream,writable)
            .then(function(){
              if(0 !== exitCode)
                throw new Error('Failed to execute (' + exitCode + '): ' + cmd)
              resolve()
            })
            .catch(function(err){
              reject('Failed in stream ' + err.source + ': ' + err.message)
            })
        })
      })
    })
}
*/


/**
 * Run a bash script and stream the output
 * @param {string} command
 * @param {Stream.Writable} writable
 * @return {P}
 */
SSH.prototype.commandShell = function(command,writable){
  debug(command,'starting command shell')
  var that = this
  var client = that.client
  return new P(function(resolve,reject){
    client.shell(
      {
        rows: 1024,
        cols: 1024,
        width: 1920,
        height: 1080,
        term: 'dumb'
      },
      function(err,stream){
        if(err) return reject(err)
        debug(command,'got shell stream back')
        stream.write('export DEBIAN_FRONTEND=noninteractive\n')
        stream.end(command + ' ; exit $?\n')
        promisePipe(stream,writable)
          .then(function(){
            debug(command,'piping to writable finished')
            resolve()
          })
          .catch(function(err){
            reject('Failed in stream ' + err.source + ': ' + err.message)
          })
      }
    )
  })
}


/**
 * Run a bash script and stream the output
 * @param {string} script
 * @param {Stream.Writable} writable
 * @return {P}
 */
SSH.prototype.scriptStream = function(script,writable){
  var that = this
  var client = that.client
  var tmpfile = '/tmp/' + new Password({length: 12, special: false}).toString()
  return new P(function(resolve,reject){
    client.sftp(function(err,sftp){
      if(err) return reject(err)
      sftp.fastPut(script,tmpfile,function(err){
        if(err) return reject(err)
        resolve()
      })
    })
  })
    .then(function(){
      var cmd = '/bin/bash ' + tmpfile
      return new P(function(resolve,reject){
        client.shell(function(err,stream){
          if(err) return reject(err)
          stream.write('export TERM=dumb\n')
          stream.write('export DEBIAN_FRONTEND=noninteractive\n')
          stream.write(cmd + ' ; exit $?\n')
          stream.end()
          promisePipe(stream,writable)
            .then(function(){
              resolve()
            })
            .catch(function(err){
              reject('Failed in stream ' + err.source + ': ' + err.message)
            })
        })
      })
    })
    .then(function(){
      var cmd = '/bin/rm -f ' + tmpfile
      return that.commandBuffered(cmd)
    })
}


/**
 * Send a file to the client
 * @param {string} src file
 * @param {string} dst file
 * @return {P}
 */
SSH.prototype.sendFile = function(src,dst){
  var that = this
  var client = that.client
  return that.commandBuffered('mkdir -p ' + path.dirname(dst))
    .then(function(){
      //put the file on the remote host
      return new P(function(resolve,reject){
        client.sftp(function(err,sftp){
          if(err) return reject(err)
          sftp.fastPut(src,dst,function(err){
            if(err) return reject(err)
            resolve()
          })
        })
      })
    })
}


/**
 * SSH helper
 * @type {SSH}
 */
module.exports = SSH
