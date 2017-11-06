'use strict';


/**
 * Confg overrides
 * @type {object}
 */
module.exports = {
  domain: 'stretchfs-test',
  group: 'group1',
  root: __dirname + '/data/test/prism1',
  redis: {
    db: 0
  },
  store: {
    enabled: false,
    username: 'stretchfs-store',
    password: 'that',
    timeout: 2000
  },
  prism: {
    enabled: true,
    host: '127.0.2.2',
    name: 'prism1',
    username: 'stretchfs-prism',
    password: 'it',
    timeout: 2000,
    workers: {count: 2, maxConnections: 1000000}
  }
}
