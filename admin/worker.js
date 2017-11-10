'use strict';
var P = require('bluebird')
var bodyParser = require('body-parser')
var compress = require('compression')
var cookieParser = require('cookie-parser')
var flash = require('connect-flash')
var electricity = require('electricity')
var express = require('express')
var expressSession = require('express-session')
var http = require('http')
var worker = require('infant').worker
var morgan = require('morgan')
var RedisStore = require('connect-redis')(expressSession)

var app = express()
var config = require('../config')
var server = http.createServer(app)
var routes = require('./routes')

var couch = require('../helpers/couchbase')

//make some promises
P.promisifyAll(server)


/**
 * Global template vars
 * @type {*}
 */
app.locals = {
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
//extend moment().format() so that this one place changes everywhere
// truthiness is checked and a placeholder can be provided in emptyString
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
  store: new RedisStore(),
  secret: config.admin.cookie.secret
}))
app.use(flash())
app.use(function(req,res,next){
  res.locals.flash = req.flash.bind(req)
  next()
})
app.use(electricity.static(__dirname + '/public'))

app.use(function(req,res,next){
  //allow public routes
  if(req.url.match(/\/api\//)) return next()
  //private
  if(!req.session.staff && req.url.indexOf('/login') < 0){
    res.redirect('/login')
  } else {
    app.locals.staff = req.session.staff
    next()
  }
})


// development only
if('development' === app.get('env'))
  app.use(morgan('dev'))

//----------------
//public routes
//----------------

//app.post('/api/shredderUpdate',routes.shredder.update)

//----------------
//private routes
//----------------


//auth
app.post('/login',routes.staff.loginAction)
app.get('/login',routes.staff.login)
app.get('/logout',routes.staff.logout)

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

//stores
app.post('/store/list',routes.store.listAction)
app.post('/store/save',routes.store.save)
app.post('/store/remove',routes.store.remove)
app.get('/store/list',routes.store.list)
app.get('/store/create',routes.store.create)
app.get('/store/edit',routes.store.edit)
app.get('/store',function(req,res){ res.redirect('/store/list') })

//inventory
app.post('/inventory/list',routes.inventory.listAction)
app.post('/inventory/save',routes.inventory.save)
app.get('/inventory/list',routes.inventory.list)
app.get('/inventory/create',routes.inventory.create)
app.get('/inventory/edit',routes.inventory.edit)
app.get('/inventory/editIndividual',routes.inventory.editIndividual)
app.get('/inventory',function(req,res){ res.redirect('/inventory/list') })

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


//home page
app.get('/',routes.index)


/**
 * Start admin
 * @param {function} done
 */
exports.start = function(done){
  server.listenAsync(+config.admin.port,config.admin.host)
    .then(done)
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
