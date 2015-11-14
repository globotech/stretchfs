'use strict';


/**
 * Confg overrides
 * @type {object}
 */
module.exports = {
  domain: 'oose-test',
  site: 'site1',
  zone: 'zone2',
  root: __dirname + '/data/test/store4',
  redis: {
    db: 5
  },
  store: {
    enabled: true,
    host: '127.0.2.7',
    name: 'prism2:store4',
    prism: 'prism2',
    username: 'oose-store',
    password: 'fuckthat',
    timeout: 2000,
    workers: {count: 2, maxConnections: 1000000}
  },
  prism: {
    enabled: false,
    name: 'prism2',
    username: 'oose-prism',
    password: 'fuckit',
    timeout: 2000
  }
}
