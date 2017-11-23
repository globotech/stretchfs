'use strict';


/**
 * Confg overrides
 * @type {object}
 */
module.exports = {
  domain: 'stretchfs-test',
  group: 'group1',
  root: __dirname + '/data/test/store1',
  store: {
    enabled: true,
    host: '127.0.2.4',
    name: 'store1',
    group: 'group1',
    username: 'stretchfs-store',
    password: 'that',
    timeout: 2000,
    workers: {count: 2, maxConnections: 1000000}
  },
  prism: {
    enabled: false,
    name: 'prism1',
    username: 'stretchfs-prism',
    password: 'it',
    timeout: 2000
  }
}
