'use strict';


/**
 * Confg overrides
 * @type {object}
 */
module.exports = {
  domain: 'oose-test',
  group: 'group1',
  root: __dirname + '/data/test/store2',
  redis: {
    db: 3
  },
  store: {
    enabled: true,
    host: '127.0.2.5',
    name: 'store2',
    prism: 'prism1',
    username: 'oose-store',
    password: 'that',
    timeout: 2000,
    workers: {count: 2, maxConnections: 1000000}
  },
  prism: {
    enabled: false,
    name: 'prism1',
    username: 'oose-prism',
    password: 'it',
    timeout: 2000
  }
}
