'use strict';
var fs = require('graceful-fs')
var ObjectManage = require('object-manage')
var oose = require('oose-sdk')
var os = require('os')
var pkg = require('./package.json')


var config = new ObjectManage()
config.$load({
  //options
  version: pkg.version,
  //locale
  domain: 'localhost',
  group: 'localgroup',
  host: os.hostname(),
  //storage
  root: __dirname + '/data',
  defaultHashType: 'sha1',
  //api setup
  ssl: {
    pem: oose.mock.sslOptions.pemFile
  },
  api: {
    maxSockets: 64,
    sessionTokenName: 'X-OOSE-Token'
  },
  //heartbeat
  heartbeat: {
    systemKey: null,
    systemType: null,
    retries: 4,
    concurrency: 2, //number of simultaneous connections and queries
    startDelay: 500, //ms default: 30 second start delay
    frequency: 30000, //ms static frequency; duration and shift added to this
    votePruneFrequency: 300000, //ms
    voteLife: 60000, //ms vote hold down time (no pings during this window)
    pingResponseTimeout: 2000, //ms
    peerListExpire: 60000 //cache the peer list for this long ms
  },
  //databases
  redis: {
    host: '127.0.0.1',
    port: 6379,
    db: 0,
    prefix: 'oose',
    options: {}
  },
  couch: {
    protocol: 'couchbase://',
    host: '127.0.0.1',
    port: '8091',
    prefix: '',
    operationTimeout: 30000,
    bucket: {
      heartbeat: {
        name: 'oose-heartbeat',
        secret: '',
        operationTimeout: null
      },
      job: {
        name: 'oose-job',
        secret: '',
        operationTimeout: null
      },
      inventory: {
        name: 'oose-inventory',
        secret: '',
        operationTimeout: null
      },
      oose: {
        name: 'oose',
        secret: '',
        operationTimeout: null
      },
      peer: {
        name: 'oose-peer',
        secret: '',
        operationTimeout: null
      },
      purchase: {
        name: 'oose-purchase',
        secret: '',
        operationTimeout: null
      }
    }
  },
  purchase: {
    redis: {
      host: '127.0.0.1',
      port: 6379,
      db: 1,
      prefix: 'oose',
      options: {}
    },
    life: 7200000, //2 hrs
    afterlife: 7200000 //2hrs
  },
  //admin
  admin: {
    enabled: false,
    port: 5973,
    host: null,
    workers: {
      count: 1,
      maxConnections: 10000
    },
    cookie: {
      secret: 'oose',
      maxAge: 2592000000 //30 days
    }
  },
  //prism
  prism: {
    enabled: false,
    ghost: false, //when enabled will not register to peer db
    name: 'prism1',
    accessLog: false,
    port: 5971,
    host: null,
    /*
    listen: [
      {port: 80, host: null},
      //use your own cert
      {port: 443, host: null, sslKey: '/key', sslCert: '/cert'},
      //or use the default oose cert
      {port: 443, host: null, ssl: true}
    ],
    */
    username: 'oose',
    password: 'oose',
    workers: {
      count: 1,
      maxConnections: 10000
    },
    denyStaticTypes: [
      'aac',
      'ape',
      'asf',
      'avi',
      'dv',
      'flac',
      'flv',
      'm2v',
      'm3a',
      'm4v',
      'mkv',
      'mp2',
      'mp3',
      'mp4',
      'mov',
      'moov',
      'mpeg',
      'mpg',
      'ogg',
      'ogm',
      'ts',
      'webm',
      'wmv'
    ],
    purchaseZone: 'a'
  },
  //storage system
  store: {
    enabled: false,
    prism: 'prism1',
    name: 'store1',
    accessLog: false,
    port: 5972,
    host: null,
    /*
    listen: [
      {port: 80, host: null},
      //use your own cert
      {port: 443, host: null, sslKey: '/key', sslCert: '/cert'},
      //or use the default oose cert
      {port: 443, host: null, ssl: true}
    ],
    */
    username: 'oose',
    password: 'oose',
    workers: {
      count: 1,
      maxConnections: 10000
    },
    inventoryConcurrency: 64,
    inventoryThrottle: 100, //ms between requests
    purchasePruneConcurrency: 512,
    verifyExpiration: 15552000000//ms  (180 days = 7776000000)
  },
  //shredder
  shredder: {
    enabled: false,
    name: 'localworker',
    port: 5981,
    host: null,
    superviseFrequency: 7000, //7 seconds
    dispatchFrequency: 11000, //11 seconds
    maxExecutionTime: 14400, // 4 hours
    concurrency: 2,
    job: {
      timeout: {
        process: 7200000, //2 hours
        cleanup: 7200000, //2 hours
        complete: 7200000 //2 hours
      },
      programs: []
    },
    username: 'shredder',
    password: 'shredder',
    workers: {
      count: 1,
      maxConnections: 10000
    }
  }
})

//load test overrides
if('travis' === process.env.TRAVIS){
  config.$load(require(__dirname + '/config.test.js'))
}

//load global local overrides
if(fs.existsSync(__dirname + '/config.local.js')){
  config.$load(require(__dirname + '/config.local.js'))
}

//load instance overrides
if(process.env.OOSE_CONFIG){
  config.$load(require(process.env.OOSE_CONFIG))
}


/**
 * Export config
 * @type {ObjectManage}
 */
module.exports = config
