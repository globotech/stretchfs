'use strict';


/**
 * Set var to window
 * @param {string} name
 * @param {*} val
 */
var toWindow = function(name,val){
  window[name] = val
}

//prereqs
require('es5-shim')
require('videojs-ie8/dist/videojs-ie8')

//jquery
var jQuery = require('jquery')
toWindow('$',jQuery)
toWindow('jQuery',jQuery)

//dropzone
var Dropzone = require('dropzone')
Dropzone['autoDiscover'] = false

//videojs
var videojs = require('video.js')

//headless dependencies
require('bootstrap')
require('bootstrap-select')
require('chart.js')
require('jquery-ui')

//global dependencies
toWindow('bootbox',require('bootbox'))
toWindow('Dropzone',Dropzone)
toWindow('Ladda',require('ladda'))
toWindow('querystring',require('qs'))
toWindow('videojs',videojs)

//jquery plugins
require('./jqueryAnimateNumber.min')

//user space
require('./dashboard')
require('./dropzone')
require('./fileManager')
require('./inventoryEdit')
require('./table')

//videojs plugins
require('videojs-persistvolume')
videojs.registerPlugin('contextmenu',require('videojs-contextmenu'))
videojs.registerPlugin('contextmenuUI',require('videojs-contextmenu-ui'))
require('./videojsDownloadButton')
