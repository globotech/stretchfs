'use strict';
var stretchfs = require('stretchfs-sdk')

var config = require('../config')

//update the config
stretchfs.api.updateConfig(config.$strip())


/**
 * Export the API
 * @type {Object}
 */
module.exports = stretchfs.api
