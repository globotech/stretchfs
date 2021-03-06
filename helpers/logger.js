'use strict';
var winston = require('winston')
var moment = require('moment')

winston.remove(winston.transports.Console)

var logger = new winston.Logger({
  exitOnError: false,
  transports: [
    new winston.transports.Console({
      json: false,
      prettyPrint: true,
      timestamp: function(){
        return moment().format('YYYY-MM-DD@HH:mm:ss.SSS')
      },
      formatter: function(err){
        // Return string will be passed to logger.
        return '[' + err.timestamp() + ']' + ' ' + 'StretchFS' +
          ' ' + err.level.toUpperCase() + ': ' + err.message + ' '
      }
    })
  ]
})


/**
 * Export module
 * @type {exports}
 */
module.exports = logger
