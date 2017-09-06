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
    db: 2
  },
  send: {
    enabled: true,
    host: '127.0.3.4',
    name: 'send1',
    prism: 'prism1',
    store: 'store1',
    timeout: 2000,
    workers: {count: 2, maxConnections: 1000000}
  }
}
