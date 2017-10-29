'use strict';


/**
 * Config overrides
 * @type {object}
 */
module.exports = {
  couch: {
    bucket: {
      heartbeat: {
        secret: 'password'
      },
      job: {
        secret: 'password'
      },
      inventory: {
        secret: 'password'
      },
      oose: {
        secret: 'password'
      },
      peer: {
        secret: 'password'
      },
      purchase: {
        secret: 'password'
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
