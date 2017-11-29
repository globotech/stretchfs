'use strict';


/**
 * Confg overrides
 * @type {object}
 */
module.exports = {
  domain: 'stretchfs-test',
  group: 'group2',
  root: __dirname + '/data/test/store4',
  store: {
    enabled: true,
    host: '127.0.2.7',
    name: 'teststore4',
    group: 'group2',
    username: 'stretchfs-store',
    password: 'that',
    timeout: 2000,
    workers: {count: 2, maxConnections: 1000000}
  },
  prism: {
    enabled: false,
    name: 'testprism2',
    username: 'stretchfs-prism',
    password: 'it',
    timeout: 2000
  }
}
