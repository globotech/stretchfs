'use strict';
var fs = require('graceful-fs')
var ObjectManage = require('object-manage')
var oose = require('oose-sdk')
var os = require('os')
var pkg = require('./package.json')


/**
 * DO NOT EDIT THIS FILE make a config.local.js or config.test.js
 * or make your own config file and use the environment variable OOSE_CONFIG
 */


/**
 * Configuration
 * @type {*|ObjectManage}
 */
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
  /**
   * Databases
   */
  //redis
  redis: {
    host: '127.0.0.1',
    port: 6379,
    db: 0,
    prefix: 'oose',
    options: {}
  },
  //couchbase
  couch: {
    protocol: 'couchbase://',
    host: '127.0.0.1',
    port: '8091',
    username: '',
    password: '',
    prefix: '',
    connectionTimeout: 60000,
    operationTimeout: 30000,
    bucket: {
      heartbeat: {
        name: 'oose-heartbeat',
        secret: '',
        ramQuotaMB: 128
      },
      job: {
        name: 'oose-job',
        secret: '',
        ramQuotaMB: 512
      },
      inventory: {
        name: 'oose-inventory',
        secret: '',
        ramQuotaMB: 512
      },
      oose: {
        name: 'oose',
        secret: '',
        ramQuotaMB: 256
      },
      peer: {
        name: 'oose-peer',
        secret: '',
        ramQuotaMB: 128
      },
      purchase: {
        name: 'oose-purchase',
        secret: '',
        ramQuotaMB: 512
      }
    }
  },
  /**
   * Subsystems
   */
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
  //job system
  job: {
    enabled: false,
    superviseFrequency: 7000, //7 seconds
    dispatchFrequency: 11000, //11 seconds
    maxExecutionTime: 14400, // 4 hours
    concurrency: 2,
    timeout: {
      process: 7200000, //2 hours
      cleanup: 7200000, //2 hours
      complete: 7200000 //2 hours
    },
    programs: []
  },
  //purchase system
  purchase: {
    life: 7200000, //2 hrs
    afterlife: 7200000 //2hrs
  },
  /**
   * Interfaces
   */
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
