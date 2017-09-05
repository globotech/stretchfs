'use strict';


/**
 * Config overrides
 * @type {object}
 */
module.exports = {
  domain: 'oose-test',
  group: 'group1',
  root: __dirname + '/send',
  redis: {
    db: 4
  },
  send: {
    enabled: true,
    host: '127.0.2.6',
    name: 'send3',
    prism: 'prism2',
    store: 'store3',
    timeout: 2000,
    workers: {count: 2, maxConnections: 1000000}
  }
}
