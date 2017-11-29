'use strict';
var async = require('async')
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
 * @param {function} done
 * @return {*}
 */
SSH.prototype.connect = function(peer,privateKey,done){
  var that = this
  var client = new Ssh2()
  var complete = function(err){done(err)}
  client.once('error',complete)
  client.on('ready',function(){
    client.removeListener('error',complete)
    that.client = client
    done(null,that)
  })
  client.connect({
    host: peer.ip,
    port: peer.sshPort || 22,
    username: peer.sshUsername || 'root',
    privateKey: privateKey
  })
}


/**
 * Run an ssh command buffer the output
 * @param {string} cmd
 * @param {function} next
 */
SSH.prototype.commandBuffered = function(cmd,next){
  var client = this.client
  if(!(cmd instanceof Array)) cmd = [cmd]
  var out = ''
  async.eachSeries(
    cmd,
    function(cmd,next){
      client.exec(cmd,function(err,stream){
        if(err) return next(err)
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
        stream.on('exit',function(code){ exitCode = code })
        promisePipe(concat,writable).then(
          function(){
            var err = null
            if(0 !== exitCode)
              err = 'Failed to execute (' + exitCode + '): ' + cmd
            //save the buffer
            out = out + buffer
            next(err)
          },
          function(err){
            next('Failed in stream ' + err.source + ': ' + err.message)
          }
        )
      })
    },
    function(err){
      next(err,out)
    }
  )
}


/**
 * Run a ssh command stream the output
 * @param {string} cmd
 * @param {Stream.Writable} writable
 * @param {function} next
 */
SSH.prototype.commandStream = function(cmd,writable,next){
  var client = this.client
  if(!(cmd instanceof Array)) cmd = [cmd]
  async.eachSeries(
    cmd,
    function(cmd,next){
      client.exec(cmd,function(err,stream){
        if(err) return next(err)
        var exitCode
        stream.on('exit',function(code){
          exitCode = code
        })
        promisePipe(stream,writable).then(
          function(){
            if(0 !== exitCode)
              return next('Failed to execute (' + exitCode + '): ' + cmd)
            next()
          },
          function(err){
            next('Failed in stream ' + err.source + ': ' + err.message)
          }
        )
      })
    },
    next
  )
}


/**
 * Run a bash script and stream the output
 * @param {string} command
 * @param {Stream.Writable} writable
 * @param {function} done
 */
SSH.prototype.commandShell = function(command,writable,done){
  debug(command,'starting command shell')
  var that = this
  var client = that.client
  async.series(
    [
      //execute the command
      function(next){
        client.shell(
          {
            rows: 1024,
            cols: 1024,
            width: 1920,
            height: 1080,
            term: 'dumb'
          },
          function(err,stream){
            if(err) return next(err)
            debug(command,'got shell stream back')
            stream.write('export DEBIAN_FRONTEND=noninteractive\n')
            stream.end(command + ' ; exit $?\n')
            promisePipe(stream,writable).then(
              function(){
                debug(command,'piping to writable finished')
                next()
              },
              function(err){
                next('Failed in stream ' + err.source + ': ' + err.message)
              }
            )
          }
        )
      }
    ],
    done
  )
}


/**
 * Run a bash script and stream the output
 * @param {string} script
 * @param {Stream.Writable} writable
 * @param {function} next
 */
SSH.prototype.scriptStream = function(script,writable,next){
  var that = this
  var client = that.client
  var tmpfile = '/tmp/' + new Password({length: 12, special: false}).toString()
  async.series(
    [
      //put the file on the remote host
      function(next){
        client.sftp(function(err,sftp){
          if(err) return next(err)
          sftp.fastPut(script,tmpfile,function(err){
            if(err) return next(err)
            next()
          })
        })
      },
      //execute the script
      function(next){
        var cmd = '/bin/bash ' + tmpfile
        client.shell(function(err,stream){
          if(err) return next(err)
          stream.write('export TERM=dumb\n')
          stream.write('export DEBIAN_FRONTEND=noninteractive\n')
          stream.write(cmd + ' ; exit $?\n')
          stream.end()
          promisePipe(stream,writable).then(
            function(){
              next()
            },
            function(err){
              next('Failed in stream ' + err.source + ': ' + err.message)
            }
          )
        })
      },
      //remove the tmpfile
      function(next){
        var cmd = '/bin/rm -f ' + tmpfile
        that.commandBuffered(cmd,next)
      }
    ],
    function(err){
      if(err) return next(err)
      next()
    }
  )
}


/**
 * Send a file to the client
 * @param {string} src file
 * @param {string} dst file
 * @param {function} next
 */
SSH.prototype.sendFile = function(src,dst,next){
  var that = this
  var client = that.client
  async.series(
    [
      //create the folder
      function(next){
        that.commandBuffered('mkdir -p ' + path.dirname(dst),function(err){
          if(err) return next(err)
          next()
        })
      },
      //put the file on the remote host
      function(next){
        client.sftp(function(err,sftp){
          if(err) return next(err)
          sftp.fastPut(src,dst,function(err){
            if(err) return next(err)
            next()
          })
        })
      }
    ],
    next
  )
}


/**
 * SSH helper
 * @type {SSH}
 */
module.exports = SSH
