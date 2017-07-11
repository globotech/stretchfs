'use strict';
var config = require('../config')
var winston = require('winston')
var moment = require('moment')
require('winston-syslog').Syslog

winston.remove(winston.transports.Console)

var logger = new winston.Logger({
  exitOnError: false,
  transports: [
    new winston.transports.Console({
      json: false,
      prettyPrint: true,
      timestamp: function(){
        return moment().format('MM-DD-YYYY HH:mm:ss.ssss')
      },
      formatter: function(err){
        // Return string will be passed to logger.
        return '[' + err.timestamp() + ']' + ' ' + 'OOSE' +
          ' ' + err.level.toUpperCase() + ': ' + err.message + ' '
      }
    })
    /*new winston.transports.Syslog({
      protocol: 'unix',
      path: '/dev/log',
      json: false,
      prettyPrint: true,
      formatter: function(err){
        return 'OOSE' + ' ' + err.level.toUpperCase() +
          ': ' + err.message
      }
    })*/
  ]
})


/**
 * Export module
 * @type {exports}
 */
module.exports = logger
