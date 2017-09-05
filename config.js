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
    retries: 8,
    concurrency: 8, //number of simultaneous connections and queries
    startDelay: 60000, //ms default: 30 second start delay
    frequency: 5000, //ms static frequency; duration and shift added to this
    votePruneFrequency: 60000, //ms
    voteLife: 60000, //ms vote hold down time (no pings during this window)
    pingResponseTimeout: 2000 //ms
  },
  //statsPush
  statsPush: {
    systemKey: null,
    systemType: null,
    startDelay: 0, //ms default: 0/false which autodelays to next round minute
    frequency: (156000/11) //ms static reporting frequency
  },
  //databases
  redis: {
    host: '127.0.0.1',
    port: 6379,
    db: 0,
    prefix: 'oose',
    options: {}
  },
  couchdb: {
    protocol: 'http://',
    host: '127.0.0.1',
    port: '5984',
    prefix: '',
    database: 'oose',
    options: {
      secure: false,
      cache: false,
      retries: 3,
      retryTimeout: 10000,
      auth: {
        username: 'oose',
        password: ''
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
    port: 5971,
    host: null,
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
    existsCacheLife: 30, //seconds
    purchaseCacheLife: 30, //seconds
    purchaseZone: 'a',
    purchaseZoneCouch: {}
    /*
    purchaseZoneCouch: {
      'a': [
        {
          host: '192.168.100.100',
          port: '5984'
        },
        {
          host: '192.168.100.101',
          port: '5984'
        }
      ],
      'b': [
        host: '192.168.100.101',
        port: '5984'
      ],
     'c': [
        host: '192.168.100.102',
        port: '5984'
      ]
    }
    */
  },
  //storage system
  store: {
    enabled: false,
    prism: 'prism1',
    name: 'store1',
    port: 5972,
    host: null,
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
  //send system
  send: {
    enabled: false,
    prism: 'prism1',
    name: 'store1',
    port: 5973,
    host: null,
    workers: {
      count: 1,
      maxConnections: 10000
    }
  },
  //supervisor system
  supervisor: {
    enabled: false,
    name: 'supervisor1',
    port: 5974,
    host: null,
    username: 'oose',
    password: 'oose',
    workers: {
      count: 1,
      maxConnections: 10000
    }
  },
  //clonetool utility
  clonetool: {
    //desired is the default desired number of copies
    desired: 2,
    //hashes in this list will never be modified without force action
    hashWhitelist: [],
    //stores in this list will never have any hashes deleted in automodes
    //  NOTE: --drop WILL STILL WORK as it is forced
    storeProtected: []
  },
  //stats utility
  stats: {
    //stats can/should use a different db+server than the core services
    redis: {
      host: '127.0.0.1',
      port: 6379,
      db: 15,
      prefix: 'oose',
      options: {}
    },
    life: 86400, //1 day
    afterlife: 604800  //1 week
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
