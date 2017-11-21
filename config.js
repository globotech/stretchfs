'use strict';
var fs = require('graceful-fs')
var ObjectManage = require('object-manage')
var stretchfs = require('stretchfs-sdk')
var os = require('os')
var pkg = require('./package.json')


/**
 * DO NOT EDIT THIS FILE make a config.local.js or config.test.js
 * or make your own config file and use the env variable STRETCHFS_CONFIG
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
    pem: stretchfs.mock.sslOptions.pemFile
  },
  api: {
    maxSockets: 64,
    sessionTokenName: 'X-STRETCHFS-Token'
  },
  /**
   * Databases
   */
  //redis
  redis: {
    host: '127.0.0.1',
    port: 6379,
    db: 0,
    prefix: 'stretchfs',
    options: {}
  },
  //couchbase
  couch: {
    protocol: 'couchbase://',
    host: '127.0.0.1',
    dsnHost: null,
    port: '8091',
    admin: {
      username: '',
      password: ''
    },
    username: '',
    password: '',
    prefix: '',
    connectionTimeout: 60000,
    operationTimeout: 30000,
    bucket: {
      stretchfs: {
        name: 'stretchfs',
        secret: '',
        ramQuotaMB: 256
      },
      inventory: {
        name: 'stretchfs-inventory',
        secret: '',
        ramQuotaMB: 512
      },
      purchase: {
        name: 'stretchfs-purchase',
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
  //inventory
  inventory: {
    unsafe: false, //when true system will not complain about single copies
    copiesOnWrite: 2, //how many copies to make during the write
    defaultRules: [{type: 'copyMinimum', value: 2}], //minimum copy count
    keepDeadRecords: false, // keep missing inventory records
    balance: {
      enabled: true, //enable the balance system (runs per store)
      concurrency: 4, //files to process concurrently
      frequency: 180000, // 3 minutes
      expiration: 2592000000, //30 days (all records are balanced this often)
      maxLockout: 5, //maxLockout * frequency = max runtime default 15 minutes
      //the frequency plus the limit can be used to sort out records processed
      //per day, use the descriptions below to tune appropriately
      limit: {
        //single copy records in a normal cluster are considered degraded
        //and must be brought back to the global minimum of 2 copies, to avoid
        //this section set inventory.unsafe = true, the idea of this limit
        //is based on the number records on hand and how long it will take to
        //recover sections of the cluster, if a group has 500,000 records if it
        //were permanently removed it would require 300 minutes or 5 hours to
        //recover all records, (this doesnt have anything to do with how quickly
        //the jobs are processed), just how quickly they are filed. this is used
        //to throttle job filings, jobs that are filed too prior to being
        //processed are a risk to data duplication and unpredictability
        single: 5000, //up to 5000 single copy records touched per run
        //cache limit will control how often and how hot
        //records need to be before copies are added to the count, if there is
        //much more than 250 hot records within the frequency period tune this
        //higher
        cache: 250, //up to 250 hot non-cached records touched per run
        //the goal would be for general to touch the entire cluster
        //in less than 7 days, if there is more content increase the general
        //param above 1000,
        general: 1000 //up to 1000 general records touched per run
      }
    },
    scan: {
      concurrency: 4, //files to process concurrently
      throttle: 100 //ms between requests
    },
    verifyExpiration: 15552000000//ms  (180 days = 7776000000)
  },
  //job system
  job: {
    enabled: false,
    recordLife: 2591999, //29.99 days
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
    life: 7200, //2 hrs
    afterLife: 7200 //2hrs
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
      secret: 'stretchfs',
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
      //or use the default stretchfs cert
      {port: 443, host: null, ssl: true}
    ],
    */
    username: 'stretchfs',
    password: 'stretchfs',
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
    name: 'store1',
    group: 'group1',
    defaultRoles: ['active','online','read','write'],
    accessLog: false,
    port: 5972,
    host: null,
    /*
    listen: [
      {port: 80, host: null},
      //use your own cert
      {port: 443, host: null, sslKey: '/key', sslCert: '/cert'},
      //or use the default stretchfs cert
      {port: 443, host: null, ssl: true}
    ],
    */
    username: 'stretchfs',
    password: 'stretchfs',
    workers: {
      count: 1,
      maxConnections: 10000
    },
    stat: {
      enabled: true,
      syncFrequency: 30000 //30 seconds
    },
    //go ahead and put this at 0 if you like corrupt files
    minFreeBytes: 67108864 //64MB (every hard drive needs this much free)
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
if(process.env.STRETCHFS_CONFIG){
  config.$load(require(process.env.STRETCHFS_CONFIG))
}


/**
 * Export config
 * @type {ObjectManage}
 */
module.exports = config
