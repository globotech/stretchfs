'use strict';
var Prism = require('stretchfs-sdk').Prism

var logger = require('../../helpers/logger')

var config = require('../../config')

//setup to talk to prism
var prism = new Prism({
  username: config.admin.prism.username,
  password: config.admin.prism.password,
  domain: config.admin.prism.domain
})


/**
 * Startup
 * @param {string} host
 * @param {number} port
 * @return {P}
 */
prism.doConnect = function(host,port){
  if(config.admin.prism.token){
    prism.setSession(config.admin.prism.token)
    prism.helperConnected = true
    return prism.connect(host,port)
  } else {
    prism.helperConnected = false
    logger.log('warn','No Prism token present,' +
      ' cannot establish admin connection to cluster,' +
      ' file management will be disabled. Login style auth' +
      ' is not enabled on this instance, tokens only.'
    )
  }
}


/**
 * Export the instance
 * @type {Prism}
 */
module.exports = prism
