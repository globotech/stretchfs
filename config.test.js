'use strict';


/**
 * Config overrides
 * @type {object}
 */
module.exports = {
  couch: {
    bucket: {
      heartbeat: {
        secret: 'password',
        ramQuotaMB: 128
      },
      job: {
        secret: 'password',
        ramQuotaMB: 128
      },
      inventory: {
        secret: 'password',
        ramQuotaMB: 128
      },
      oose: {
        secret: 'password',
        ramQuotaMB: 128
      },
      peer: {
        secret: 'password',
        ramQuotaMB: 128
      },
      purchase: {
        secret: 'password',
        ramQuotaMB: 128
      }
    }
  },
  prism: {
    enabled: true
  },
  store: {
    enabled: true
  }
}
