'use strict';
var jQuery = require('jquery')


/**
 * Setup jQuery Globally
 * @type {jQuery}
 */
window.$ = window.jQuery = jQuery

//headless dependencies
require('bootstrap-sass')
require('bootstrap-select')
require('chart.js')
require('jquery-ui')


/**
 * Setup bootbox globally
 * @type {bootbox}
 */
var bootbox = window.bootbox = require('bootbox')


/**
 * Setup Dropzone Globally
 * @type {Dropzone}
 */
var Dropzone = window.Dropzone = require('dropzone')


/**
 * Setup Ladda Globally
 * @type {Ladda}
 */
var Ladda = window.Ladda = require('ladda')


/**
 * Setup querystring globally
 * @type {querystring}
 */
var querystring = window.querystring = require('qs')


/**
 * Setup videojs globally
 * @type {videojs}
 */
var videojs = window.videojs = require('video.js')

//jquery plugins
require('./jqueryAnimateNumber.min')

//user space
require('./dashboard')
require('./dropzone')
require('./fileManager')
require('./inventoryEdit')
require('./table')

//player
require('es5-shim')
require('videojs-ie8/dist/videojs-ie8')
require('videojs-persistvolume')
require('videojs-contextmenu')
require('videojs-contextmenu-ui')
require('./videojsDownloadButton')

//css
require('./main.css')
