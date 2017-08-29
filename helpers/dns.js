'use strict';
var P = require('bluebird')
var dns = require('dnscache')({
  'enable' : true,
  'ttl' : 300,
  'cachesize' : 1000
})
//make some promises
P.promisifyAll(dns)


/**
 * Export client
 * @return {object} client
 */
module.exports = dns
