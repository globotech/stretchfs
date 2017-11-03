'use strict';


/**
 * Confg overrides
 * @type {object}
 */
module.exports = {
  domain: 'oose-test',
  group: 'group2',
  root: __dirname + '/data/test/prism2',
  redis: {
    db: 1
  },
  store: {
    enabled: false,
    username: 'oose-store',
    password: 'that',
    timeout: 2000
  },
  prism: {
    enabled: true,
    host: '127.0.2.3',
    name: 'prism2',
    username: 'oose-prism',
    password: 'it',
    timeout: 2000,
    workers: {count: 2, maxConnections: 1000000}
  }
}
