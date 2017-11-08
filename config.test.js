'use strict';


/**
 * Config overrides
 * @type {object}
 */
module.exports = {
  couch: {
    admin: {
      username: 'Administrator',
      password: 'password'
    },
    username: 'stretchfs',
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
  }
}
