'use strict';


/**
 * Config overrides
 * @type {object}
 */
module.exports = {
  couch: {
    admin: {
      username: 'root',
      password: 'password'
    },
    username: 'test',
    password: 'password',
    bucket: {
      inventory: {
        ramQuotaMB: 128
      },
      stretchfs: {
        ramQuotaMB: 128
      },
      purchase: {
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
