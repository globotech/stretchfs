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
    host: '127.0.2.5',
    name: 'send5',
    prism: 'prism1',
    store: 'store5',
    timeout: 2000,
    workers: {count: 2, maxConnections: 1000000}
  }
}
