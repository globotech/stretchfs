'use strict';

var logger = require('../../helpers/logger')

var filePath = process.argv[2]
logger.log('info', filePath)
var match = filePath.match(/([0-9a-f\/]{60})/i)
logger.log('info', match[0].replace(/\//g,''))
process.exit()
