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
    db: 5
  },
  send: {
    enabled: true,
    host: '127.0.2.7',
    name: 'send4',
    prism: 'prism2',
    store: 'store4',
    timeout: 2000,
    workers: {count: 2, maxConnections: 1000000}
  }
}
