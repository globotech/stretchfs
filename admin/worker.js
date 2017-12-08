'use strict';
var P = require('bluebird')
var bodyParser = require('body-parser')
var compress = require('compression')
var cookieParser = require('cookie-parser')
var flash = require('connect-flash')
var compileFile = require('pug').compileFile
var express = require('express')
var expressSession = require('express-session')
var http = require('http')
var worker = require('infant').worker
var morgan = require('morgan')
var path = require('path')
var serveStatic = require('serve-static')
var CouchbaseStore = require('connect-couchbase')(expressSession)

var app = express()
var config = require('../config')
var server = http.createServer(app)
var routes = require('./routes')

var couch = require('../helpers/couchbase')
var prismConnect = require('./helpers/prismConnect')

//make some promises
P.promisifyAll(server)

//open some buckets
var cb = couch.stretchfs()


/**
 * Global template vars
 * @type {*}
 */
app.locals = {
  appTitle: config.admin.title,
  pretty: true,
  S: require('string'),
  moment: require('moment'),
  //moment no longer supports any method of getting the short timezone
  timezone: ['(',')'].join(
    (new Date()).toLocaleTimeString(
      'en-US',{timeZoneName:'short'}
    ).split(' ').pop()
  ),
  prettyBytes: require('pretty-bytes'),
  version: config.version
}


/**
 * Moment standard format
 *  extend moment().format() so that this one place changes everywhere
 *  truthiness is checked and a placeholder can be provided in emptyString
 * @param {Date} d
 * @param {string} emptyString
 * @return {string}
 */
app.locals.momentStandardFormat = function(d,emptyString){
  return (
    d ? app.locals.moment(d).format('YYYY-MM-DD hh:mm:ssA')
      : ('string' === typeof emptyString) ? emptyString : 'Never'
  )
}


//setup view engine
app.set('trust proxy',true)
app.set('views',__dirname + '/' + 'views')
app.set('view engine','pug')

//load middleware
app.use(compress())
app.use(bodyParser.urlencoded({extended: true}))
app.use(bodyParser.json())
app.use(cookieParser(config.admin.cookie.secret))
app.use(expressSession({
  cookie: {
    maxAge: config.admin.cookie.maxAge
  },
  resave: true,
  saveUninitialized: true,
  store: new CouchbaseStore({db: cb}),
  secret: config.admin.cookie.secret
}))
app.use(flash())
var viewFn = {}
app.use(function(req,res,next){
  res.locals.flash = req.flash.bind(req)
  req.flashPug = function(type,view,vars){
    if(type && view){
      if(-1 === Object.keys(viewFn).indexOf(view)){
        viewFn[view] =
          compileFile(app.get('views') + '/_alerts/' + view + '.pug',{})
      }
      return req.flash(type,viewFn[view](('object'===typeof vars)?vars:{}))
    } else if(type){
      return req.flash(type)
    } else {
      return req.flash()
    }
  }
  next()
})
//public static files
app.use(serveStatic(__dirname + '/public'))
//npm installed scripts
var setupScriptServer = function(name,scriptPath){
  if(!scriptPath) scriptPath = name
  scriptPath = path.resolve(path.join(__dirname,'..','node_modules',scriptPath))
  app.use('/node_modules/' + name,serveStatic(scriptPath))
}
//DEFINE external public script packages here, then access them by using
// /script/<name> such as /script/bootstrap/dist/bootstrap.min.js
//setupScriptServer('bootbox')
setupScriptServer('bootstrap')
setupScriptServer('bootstrap-select')
//setupScriptServer('chart.js')
setupScriptServer('dropzone')
//setupScriptServer('es5-shim')
setupScriptServer('html5-boilerplate')
//setupScriptServer('jquery')
//setupScriptServer('jquery-ui-dist')
setupScriptServer('ladda')
setupScriptServer('video.js')
//setupScriptServer('videojs-chromecast')
//setupScriptServer('videojs-contextmenu')
setupScriptServer('videojs-contextmenu-ui')
//setupScriptServer('videojs-flash')
//setupScriptServer('videojs-ie8')
//setupScriptServer('videojs-persistvolume')
//setupScriptServer('videojs-swf')
//setupScriptServer('videojs-vtt.js')


// development only
if('development' === app.get('env'))
  app.use(morgan('dev'))

//----------------
//public routes
//----------------

app.post('/file/jobUpdate',routes.file.jobUpdate)

//----------------
//private routes
//----------------

//auth
app.post('/login',routes.staff.loginAction)
app.get('/login',routes.staff.login)
app.get('/logout',routes.staff.logout)

//require auth
app.use(function(req,res,next){
  //private
  if(!req.session.staff && req.url.indexOf('/login') < 0){
    res.redirect('/login')
  } else {
    app.locals.staff = req.session.staff
    next()
  }
})

//staff
app.post('/staff/list',routes.staff.listAction)
app.post('/staff/save',routes.staff.save)
app.get('/staff/list',routes.staff.list)
app.get('/staff/create',routes.staff.create)
app.get('/staff/edit',routes.staff.edit)
app.get('/staff',function(req,res){ res.redirect('/staff/list') })

//user
app.post('/user/list',routes.user.listAction)
app.post('/user/save',routes.user.save)
app.post('/user/remove',routes.user.remove)
app.get('/user/list',routes.user.list)
app.get('/user/create',routes.user.create)
app.get('/user/edit', routes.user.edit)
app.get('/user',function(req,res){ res.redirect('/user/list') })

//prisms
app.post('/prism/list',routes.prism.listAction)
app.post('/prism/save',routes.prism.save)
app.get('/prism/list',routes.prism.list)
app.get('/prism/create',routes.prism.create)
app.get('/prism/edit',routes.prism.edit)
app.get('/prism',function(req,res){ res.redirect('/prism/list') })
//prism AJAX
app.get('/prism/listRoles',routes.prism.listRoles)

//stores
app.post('/store/list',routes.store.listAction)
app.post('/store/save',routes.store.save)
app.post('/store/remove',routes.store.remove)
app.get('/store/list',routes.store.list)
app.get('/store/create',routes.store.create)
app.get('/store/edit',routes.store.edit)
app.get('/store',function(req,res){ res.redirect('/store/list') })
//prism AJAX
app.get('/store/listRoles',routes.store.listRoles)

//inventory
app.post('/inventory/list',routes.inventory.listAction)
app.post('/inventory/save',routes.inventory.save)
app.get('/inventory/list',routes.inventory.list)
app.get('/inventory/create',routes.inventory.create)
app.get('/inventory/edit',routes.inventory.edit)
app.get('/inventory/editIndividual',routes.inventory.editIndividual)
app.get('/inventory',function(req,res){ res.redirect('/inventory/list') })
//inventory AJAX
app.get('/inventory/listRuleTypes',routes.inventory.listRuleTypes)
app.get('/inventory/listHashes',routes.inventory.listHashes)

//sessions
app.post('/session/list',routes.session.listAction)
app.get('/session/list',routes.session.list)
app.get('/session',function(req,res){ res.redirect('/session/list') })

//purchases
app.post('/purchase/list',routes.purchase.listAction)
app.post('/purchase/save',routes.purchase.save)
app.get('/purchase/list',routes.purchase.list)
app.get('/purchase/create',routes.purchase.create)
app.get('/purchase/edit',routes.purchase.edit)
app.get('/purchase',function(req,res){ res.redirect('/purchase/list') })

//jobs
app.post('/job/list',routes.job.listAction)
app.post('/job/save',routes.job.save)
app.get('/job/list',routes.job.list)
app.get('/job/create',routes.job.create)
app.get('/job/edit',routes.job.edit)
app.get('/job',function(req,res){ res.redirect('/job/list') })

//peer
app.post('/peer',routes.peer.list)
app.post('/peer/save',routes.peer.save)
app.post('/peer/runCommand',routes.peer.runCommand)
app.get('/peer',routes.peer.list)
app.get('/peer/create',routes.peer.create)
app.get('/peer/edit',routes.peer.edit)
app.get('/peer/test',routes.peer.test)
app.get('/peer/refresh',routes.peer.refresh)
app.get('/peer/prepare',routes.peer.prepare)
app.get('/peer/install',routes.peer.install)
app.get('/peer/upgrade',routes.peer.upgrade)
app.get('/peer/updateConfig',routes.peer.updateConfig)
app.get('/peer/start',routes.peer.start)
app.get('/peer/stop',routes.peer.stop)
app.get('/peer/restart',routes.peer.restart)

//file manage
app.post('/file/moveList',routes.file.moveList)
app.post('/file/moveTo',routes.file.moveTo)
app.post('/file/save', routes.file.save)
app.post('/file/export', routes.file.export)
app.post('/file/importList',routes.file.importList)
app.post('/file/import',routes.file.import)
app.post('/file/upload',routes.file.upload)
app.post('/file/folderCreate',routes.file.folderCreate)
app.post('/file/remove',routes.file.remove)
app.post('/file/list',routes.file.listAction)
app.get('/file/detail', routes.file.detail)
app.get('/file/watch/:handle', routes.file.detail)
app.get('/file/view/:handle', routes.file.detail)
app.get('/file/embed/:handle',routes.file.embed)
app.get('/file/download',routes.file.download)
app.get('/file/list',routes.file.list)
app.get('/file',function(req,res){
  res.redirect(301,'/file/list')
})

//home page
app.get('/',function(req,res){
  res.redirect(301,'/dashboard')
})
app.get('/dashboard',routes.dashboard.index)
app.get('/dashboard/getUpdate',routes.dashboard.getUpdate)


/**
 * Start admin
 * @param {function} done
 */
exports.start = function(done){
  server.listenAsync(+config.admin.port,config.admin.host)
    .then(function(){
      return prismConnect.doConnect(
        config.admin.prism.host,
        config.admin.prism.port
      )
    })
    .then(function(){
      done()
    })
    .catch(function(err){
      done(err)
    })
}


/**
 * Stop admin
 * @param {function} done
 */
exports.stop = function(done){
  //close couch buckets
  couch.disconnect()
  //dont wait for this since it will take to long and we are stopping now
  server.close()
  //just return now
  done()
}

if(require.main === module){
  worker(
    server,
    'stretchfs:admin:worker',
    function(done){
      exports.start(done)
    },
    function(done){
      exports.stop(done)
    }
  )
}
