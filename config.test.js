'use strict';


/**
 * Config overrides
 * @type {object}
 */
module.exports = {
  couch: {
    bucket: {
      heartbeat: {
        secret: 'oose'
      },
      job: {
        secret: 'oose'
      },
      inventory: {
        secret: 'oose'
      },
      oose: {
        secret: 'oose'
      },
      peer: {
        secret: 'oose'
      },
      purchase: {
        secret: 'oose'
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
