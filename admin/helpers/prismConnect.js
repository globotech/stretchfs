'use strict';
var Prism = require('stretchfs-sdk').Prism

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
    return prism.connect(host,port)
  } else {
    return prism.connect(host,port)
      .then(function(){
        return prism.login(
          config.admin.prism.username,
          config.admin.prism.password
        )
      })
  }
}


/**
 * Export the instance
 * @type {Prism}
 */
module.exports = prism
