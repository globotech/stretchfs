'use strict';


/**
 * Confg overrides
 * @type {object}
 */
module.exports = {
  domain: 'oose-test',
  group: 'group2',
  root: __dirname + '/data/test/store4',
  redis: {
    db: 5
  },
  store: {
    enabled: true,
    host: '127.0.2.7',
    name: 'store4',
    prism: 'prism2',
    username: 'oose-store',
    password: 'that',
    timeout: 2000,
    workers: {count: 2, maxConnections: 1000000}
  },
  prism: {
    enabled: false,
    name: 'prism2',
    username: 'oose-prism',
    password: 'it',
    timeout: 2000
  }
}
