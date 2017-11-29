'use strict';
var async = require('async')
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
var servicedir = '/etc/service/oose'
var dtStop = ['svc -d ' + servicedir]
var dtStart =
  ['chmod +x /opt/oose/dt/run /opt/oose/dt/log/run','svc -u ' + servicedir]
var actions = {
  restart: {
    name: 'restart',
    status: 'ok',
    cmd: [].concat(dtStop,dtStart)
  },
  stop: {
    name: 'stop',
    status: 'stopped',
    cmd: dtStop
  },
  start: {
    name: 'start',
    status: 'ok',
    cmd: dtStart
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
 * @param {string} id
 * @param {function} done
 */
var peerFind = function(id,done){
  PeerModel.findById(id,function(err,result){
    if(err) return done(err.message)
    if(!result) return done('Could not find peer')
    done(null,result)
  })
}


/**
 * Connect to a peer using net
 * @param {object} peer
 * @param {function} done
 * @return {*}
 */
var peerNetConnect = function(peer,done){
  if(!peer.ip) return done('No IP defined for the peer')
  var client = net.connect(peer.sshPort || 22,peer.ip)
  client.on('connect',function(){
    client.end()
    done()
  })
  client.on('error',function(err){
    done('Failed to connect to peer SSH: ' + err.code)
  })
}


/**
 * Start a new SSH helper and connect to a peer
 * @param {object} peer
 * @param {function} done
 */
var peerSshConnect = function(peer,done){
  var ssh = new SSH()
  ssh.connect(peer,fs.readFileSync(config.executioner.ssh.privateKey),done)
}


/**
 * Log the result of an action to the peer
 * @param {object} peer
 * @param {string} level
 * @param {string} msg
 * @param {string} status
 * @param {function} done
 */
var peerLog = function(peer,level,msg,status,done){
  peer.log.push({message: msg, level: level})
  if(status && -1 < validStatuses.indexOf(status)) peer.status = status
  peer.save(function(err){
    if(err) return done(err.message)
    done()
  })
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
 * @param {function} next
 */
exports.test = function(key,next){
  var peer
  async.series(
    [
      //retrieve the peer
      function(next){
        peerFind(key,function(err,result){
          if(err) return next(err)
          peer = result
          next()
        })
      },
      //attempt connect to the peer
      function(next){
        peerNetConnect(peer,next)
      },
      //attempt to login to the peer with ssh
      function(next){
        peerSshConnect(peer,function(err,client){
          if(err) return next(err)
          client.on('error',commandFail(next))
          //find out some information about the peer
          client.commandBuffered('cat /etc/debian_version',function(err,result){
            // jshint bitwise:false
            if(err) return next(err)
            var version = result.trim()
            if(!version) return next('Could not get the version of Debian')
            var match = version.match(/^(\d+)\.(\d+)/)
            if((!match[1]) || ((match[1] >> 0) < 7))
              return next('This version of Debian is too old: ' + version)
            next()
          })
        })
      }
    ],
    function(err){
      if('object' === typeof err) err = err.message
      async.series(
        [
          function(next){
            if(err) peerLog(peer,'error',err,'error',next)
            else {
              peerLog(
                peer,
                'success',
                'Successfully communicated with peer and tested OS validity',
                peer.status.match(/error|unknown/i) ? 'staging' : peer.status,
                next
              )
            }
          }
        ],
        function(error){
          next(err || error)
        }
      )
    }
  )
}


/**
 * Refresh a peer
 * @param {string} key
 * @param {function} next
 */
exports.refresh = function(key,next){
  var peer
  async.series(
    [
      //retrieve the peer
      function(next){
        peerFind(key,function(err,result){
          if(err) return next(err)
          peer = result
          next()
        })
      },
      //attempt to login to the peer with ssh
      function(next){
        peerSshConnect(peer,function(err,client){
          if(err) return next(err)
          client.on('error',commandFail(next))
          //collect some information about the peer
          async.parallel(
            [
              //get the os version
              function(next){
                client.commandBuffered(
                  'cat /etc/debian_version',
                  function(err,result){
                    if(err) return next(err)
                    result = result.trim()
                    if(!result)
                      return next('Could not get the version of Debian')
                    peer.os.name = 'Debian'
                    peer.os.version = result
                    next()
                  }
                )
              },
              //get the kernel version
              function(next){
                client.commandBuffered('uname -r',function(err,result){
                  result = result.trim() || peer.os.kernel
                  peer.os.kernel = result
                  next()
                })
              },
              //get the arch
              function(next){
                client.commandBuffered('uname -m',function(err,result){
                  result = result.trim() || peer.os.arch
                  peer.os.arch = result
                  next()
                })
              },
              //get the oose version (if we can)
              function(next){
                client.commandBuffered(
                  'node -p "JSON.parse(' +
                  'require(\'fs\').readFileSync(\'/opt/oose/package.json\'))' +
                  '.version"',
                  function(err,result){
                    peer.version = result.trim() || 'unknown'
                    next()
                  }
                )
              },
              //get the uptime
              function(next){
                client.commandBuffered('cat /proc/uptime',function(err,result){
                  if(err) return next(err)
                  peer.os.uptime = result.trim().split(' ')[0] || undefined
                  next()
                })
              },
              //get the load average
              function(next){
                client.commandBuffered('cat /proc/loadavg',function(err,result){
                  if(err) return next(err)
                  result = result.trim().split(' ').splice(0,3) || undefined
                  peer.os.load = result
                  next()
                })
              }
            ],
            next
          )
        })
      }
    ],
    function(err){
      if('object' === typeof err) err = err.message
      async.series(
        [
          function(next){
            if(err) peerLog(peer,'warning',err,null,next)
            else peerLog(peer,'info','Successfully refreshed peer',null,next)
          }
        ],
        function(error){
          next(err || error)
        }
      )
    }
  )
}


/**
 * Prepare peer for installation
 * @param {string} id peer id
 * @param {Stream.Writable} writable
 * @param {function} next
 */
exports.prepare = function(id,writable,next){
  var peer
  async.series(
    [
      //retrieve the peer
      function(next){
        peerFind(id,function(err,result){
          if(err) return next(err)
          peer = result
          next()
        })
      },
      //attempt to login to the peer with ssh
      function(next){
        peerSshConnect(peer,function(err,client){
          if(err) return next(err)
          client.on('error',commandFail(next))
          async.series(
            [
              //send the ssl key
              function(next){
                if(!config.executioner.ssl.key) return next()
                client.sendFile(
                  config.executioner.ssl.key,
                  '/etc/nginx/ssl/ssl.key',
                  next
                )
              },
              //send the ssl cert
              function(next){
                if(!config.executioner.ssl.crt) return next()
                client.sendFile(
                  config.executioner.ssl.crt,
                  '/etc/nginx/ssl/ssl.crt',
                  next
                )
              },
              //run preparation script
              function(next){
                client.scriptStream(
                  __dirname + '/../scripts/prepare.sh',
                  writable,next
                )
              }
            ],
            next
          )
        })
      }
    ],
    function(err){
      if('object' === typeof err) err = err.message
      async.series(
        [
          function(next){
            if(err) peerLog(peer,'error',err,'error',next)
            else {
              peerLog(
                peer,
                'success',
                'Successfully prepared peer for installation',
                null,
                next
              )
            }
          }
        ],
        function(error){
          next(err || error)
        }
      )
    }
  )
}


/**
 * Install peer
 * @param {string} id peer id
 * @param {Stream.Writable} writable
 * @param {function} next
 */
exports.install = function(id,writable,next){
  var peer
  async.series(
    [
      //retrieve the peer
      function(next){
        peerFind(id,function(err,result){
          if(err) return next(err)
          peer = result
          next()
        })
      },
      //attempt to login to the peer with ssh
      function(next){
        peerSshConnect(peer,function(err,client){
          if(err) return next(err)
          client.on('error',commandFail(next))
          client.scriptStream(
            __dirname + '/../scripts/install.sh',
            writable,
            next
          )
        })
      }
    ],
    function(err){
      if('object' === typeof err) err = err.message
      async.series(
        [
          function(next){
            if(err) peerLog(peer,'error',err,'error',next)
            else {
              peerLog(
                peer,
                'success',
                'Successfully installed peer',
                'stopped',
                next)
            }
          }
        ],
        function(error){
          next(err || error)
        }
      )
    }
  )
}


/**
 * Upgrade a peer
 * @param {string} key
 * @param {Stream.Writable} writable
 * @param {function} next
 */
exports.upgrade = function(key,writable,next){
  var peer
  async.series(
    [
      //retrieve the peer
      function(next){
        peerFind(key,function(err,result){
          if(err) return next(err)
          peer = result
          next()
        })
      },
      //attempt to login to the peer with ssh
      function(next){
        peerSshConnect(peer,function(err,client){
          if(err) return next(err)
          client.on('error',commandFail(next))
          client.scriptStream(
            __dirname + '/../scripts/upgrade.sh',
            writable,
            next
          )
        })
      }
    ],
    function(err){
      if('object' === typeof err) err = err.message
      async.series(
        [
          function(next){
            if(err) peerLog(peer,'error',err,null,next)
            else peerLog(peer,'success','Successfully upgraded peer',null,next)
          }
        ],
        function(error){
          next(err || error)
        }
      )
    }
  )
}


/**
 * Update config
 * @param {string} id peer id
 * @param {function} next
 */
exports.updateConfig = function(id,next){
  var peer
  async.series(
    [
      //retrieve the peer
      function(next){
        peerFind(id,function(err,result){
          if(err) return next(err)
          peer = result
          next()
        })
      },
      //attempt to login to the peer with ssh
      function(next){
        peerSshConnect(peer,function(err,client){
          if(err) return next(err)
          client.on('error',commandFail(next))
          client.client.sftp(function(err,sftp){
            if(err) return next(err)
            async.series(
              [
                //rename old config file
                function(next){
                  sftp.rename(
                    '/opt/oose/config.local.js',
                    '/opt/oose/config.local.js.bak',
                    next
                  )
                },
                //upload new config file
                function(next){
                  var stream = sftp.createWriteStream(
                    '/opt/oose/config.local.js'
                  )
                  stream.on('error',function(err){next(err)})
                  stream.on('finish',function(){next()})
                  stream.end(peer.config)
                }
              ],
              next
            )
          })
        })
      }
    ],
    function(err){
      if('object' === typeof err) err = err.message
      async.series(
        [
          function(next){
            if(err) peerLog(peer,'warning',err,null,next)
            else peerLog(peer,'info','Successfully updated config',null,next)
          }
        ],
        function(error){
          next(err || error)
        }
      )
    }
  )
}


/**
 * Peer action (start,stop,restart)
 * @param {string} key
 * @param {object} action
 * @param {function} next
 * @return {*}
 */
exports.action = function(key,action,next){
  action = actions[action]
  if(!action) return next('Could not find action preset')
  var peer
  async.series(
    [
      //retrieve the peer
      function(next){
        peerFind(key,function(err,result){
          if(err) return next(err)
          peer = result
          next()
        })
      },
      //attempt to login to the peer with ssh
      function(next){
        peerSshConnect(peer,function(err,client){
          if(err) return next(err)
          client.on('error',commandFail(next))
          async.series(
            [
              //stop/start/restart
              function(next){
                client.commandBuffered(action.cmd,next)
              }
            ],
            next
          )
        })
      }
    ],
    function(err){
      if('object' === typeof err) err = err.message
      async.series(
        [
          function(next){
            if(err) peerLog(peer,'warning',err,null,next)
            else
              peerLog(
                peer,
                'info',
                'Peer ' + action.name + ' successful',
                action.status || null,
                next
              )
          }
        ],function(error){
          next(err || error)
        }
      )
    }
  )
}


/**
 * Custom command
 * @param {string} key
 * @param {string} command
 * @param {Stream.Writable} writable
 * @param {function} next
 */
exports.custom = function(key,command,writable,next){
  var peer
  async.series(
    [
      //retrieve the peer
      function(next){
        peerFind(key,function(err,result){
          if(err) return next(err)
          peer = result
          exports.banner(writable,'Peer ' + peer.hostname)
          next()
        })
      },
      //attempt to login to the peer with ssh
      function(next){
        peerSshConnect(peer,function(err,client){
          if(err) return next(err)
          client.on('error',commandFail(next))
          client.commandShell(command,writable,next)
        })
      }
    ],
    function(err){
      if('object' === typeof err) err = err.message
      async.series(
        [
          function(next){
            if(err)
              peerLog(
                peer,
                'error',
                'Error executing ' + command + ':' + err,
                null,
                next
              )
            else
              peerLog(
                peer,
                'success',
                  'Successfully executed: ' + command,
                null,
                next
              )
          }
        ],
        function(error){
          next(err || error)
        }
      )
    }
  )
}
