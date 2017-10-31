'use strict';
var path = require('path')

var config = require('../config')


/**
 * Path to job folder
 * @param {string} handle
 * @return {string}
 */
exports.folder = function(handle){
  return path.resolve(config.root + '/job/' + handle)
}
