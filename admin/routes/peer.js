'use strict';
var entities = new (require('html-entities').XmlEntities)()
var through2 = require('through2')

var couch = require('../../helpers/couchbase')

var peerHelper = require('../helpers/peer')
var list = require('../helpers/list')

//open some buckets
var cb = couch.stretchfs()

var operationCompleteMessage =
  'Operation complete, close this window and refresh the previous page'


/**
 * Helper to setup an html entity encoded writable stream
 * @param {object} res
 * @return {Stream.Transform}
 */
var encodeEntities = function(res){
  return through2(
    function(chunk,enc,next){
      res.write(entities.encode(chunk.toString()))
      next(null,chunk)
    }
  )
}


/**
 * List actions
 * @param {object} req
 * @param {object} res
 */
exports.listAction = function(req,res){
  P.try(function(){
    return req.body.listSelected || []
  })
    .each(function(peerName){
      var peerKey = couch.schema.peer(peerName)
      var action = req.body.action || 'refresh'
      //update config, refresh, test the peer
      if(action in ['updateConfig','refresh','test']){
        return peerHelper[action](peerKey)
          .then(function(){
            req.flash('success','Peer ' + req.body.action + ' complete')
            res.redirect('/peer/list')
          })
      //start stop restart, lifecycle peer actions
      } else if(action in ['start','stop','restart']){
        return peerHelper.action(peerKey,action)
          .then(function(){
            req.flash('success','Peer ' + req.body.action + ' complete')
            res.redirect('/peer/list')
          })
      //custom peer commands
      } else if(req.body.runCommand){
        peerHelper.outputStart(res,'Command: ' + req.body.command)
        return peerHelper.custom(peerKey,req.body.command,encodeEntities(res))
          .then(function(){
            peerHelper.banner(res,operationCompleteMessage)
            peerHelper.outputEnd(res)
          })
      //prepare, install, upgrade, canned peer scripts
      } else if(action in ['prepare','install','upgrade']){
        peerHelper.outputStart(res,action)
        return peerHelper[action](peerKey,encodeEntities(res))
          .then(function(){
            peerHelper.banner(res,operationCompleteMessage)
            peerHelper.outputEnd(res)
          })
      //remove peers if needed
      } else if('remove' === action){
        return cb.removeAsync(peerKey)
          .then(function(){
            req.flash('success','Deleted peer(s)')
          })
      //nothing matched
      } else {
        req.flash('warning','No action submitted')
        res.redirect('/peer/list')
      }
    })
}


/**
 * List peers
 * @param {object} req
 * @param {object} res
 */
exports.list = function(req,res){
  var limit = parseInt(req.query.limit,10) || 10
  var start = parseInt(req.query.start,10) || 0
  var search = req.query.search || ''
  list.listQuery(
    couch,
    cb,
    couch.type.stretchfs,
    couch.schema.peer(search),
    'name',
    true,
    start,
    limit
  )
    .then(function(result){
      res.render('peer/list',{
        page: list.pagination(start,result.count,limit),
        count: result.count,
        search: search,
        limit: limit,
        list: result.rows
      })
    })
}


/**
 * Create peer
 * @param {object} req
 * @param {object} res
 */
exports.create = function(req,res){
  res.render('peer/create')
}


/**
 * Peer update form
 * @param {object} req
 * @param {object} res
 */
exports.edit = function(req,res){
  var peerKey = couch.schema.peer(req.query.id)
  cb.getAsync(peerKey)
    .then(function(result){
      res.render('peer/edit',{
        peer: result.value,
        statuses: peerHelper.validStatuses
      })
    })
}


/**
 * Save peer
 * @param {object} req
 * @param {object} res
 */
exports.save = function(req,res){
  var peerKey = couch.schema.peer(req.body.id)
  cb.getAsync(peerKey)
    .then(
      function(result){
        result.value.name = req.body.name
        result.value.host = req.body.host
        result.value.sshPort = req.body.sshPort || 22
        result.value.config = req.body.config || null
        result.value.status = req.body.status || 'unknown'
        return cb.upsertAsync(peerKey,result.value,{cas: result.cas})
      },
      function(err){
        if(13 !== err.code) throw err
        var peerParams = {
          name: req.body.name,
          host: req.body.host,
          sshPort: req.body.sshPort || 22,
          config: req.body.config || null,
          status: req.body.status || 'unknown',
          log: [
            {message: 'Peer created', level: 'success'}
          ]
        }
        return cb.upsertAsync(peerKey,peerParams)
      }
    )
    .then(function(){
      req.flash('success','Peer saved')
      res.redirect('/peer/list')
    })
}


/**
 * Test peer for readyness with executioner
 * @param {object} req
 * @param {object} res
 */
exports.test = function(req,res){
  var peerKey = couch.schema.peer(req.query.id)
  peerHelper.test(peerKey)
    .then(function(){
      req.flash('success','Peer tested ok')
      res.redirect('/peer/edit?id=' + req.query.id)
    })
}


/**
 * Refersh peer stats
 * @param {object} req
 * @param {object} res
 */
exports.refresh = function(req,res){
  var peerKey = couch.schema.peer(req.query.id)
  peerHelper.refresh(peerKey)
    .then(function(){
      req.flash('success','Peer refreshed ok')
      res.redirect('/peer/edit?id=' + req.query.id)
    })
}


/**
 * Prepare peer
 * @param {object} req
 * @param {object} res
 */
exports.prepare = function(req,res){
  var peerKey = couch.schema.peer(req.query.id)
  peerHelper.outputStart(res,'Prepare')
  peerHelper.prepare(peerKey,encodeEntities(res))
    .then(function(){
      req.flash('success','Peer prepared ok')
      peerHelper.banner(res,operationCompleteMessage)
      peerHelper.outputEnd(res)
    })
}


/**
 * Install peer
 * @param {object} req
 * @param {object} res
 */
exports.install = function(req,res){
  var peerKey = couch.schema.peer(req.query.id)
  peerHelper.outputStart(res,'Install')
  peerHelper.install(peerKey,encodeEntities(res))
    .then(function(){
      req.flash('success','Peer installed ok')
      peerHelper.banner(res,operationCompleteMessage)
      peerHelper.outputEnd(res)
    })
}


/**
 * Upgrade peer
 * @param {object} req
 * @param {object} res
 */
exports.upgrade = function(req,res){
  var peerKey = couch.schema.peer(req.query.id)
  peerHelper.outputStart(res,'Upgrade')
  peerHelper.upgrade(peerKey,encodeEntities(res))
    .then(function(){
      req.flash('success','Peer upgraded ok')
      peerHelper.banner(res,operationCompleteMessage)
      peerHelper.outputEnd(res)
    })
}


/**
 * Run command
 * @param {object} req
 * @param {object} res
 */
exports.runCommand = function(req,res){
  var peerKey = couch.schema.peer(req.query.id)
  peerHelper.outputStart(res,'Command: ' + req.body.command)
  peerHelper.custom(peerKey,req.body.command,encodeEntities(res))
    .then(function(){
      req.flash('success','Peer command executed ok')
      peerHelper.banner(res,operationCompleteMessage)
      peerHelper.outputEnd(res)
    })
}


/**
 * Update config
 * @param {object} req
 * @param {object} res
 */
exports.updateConfig = function(req,res){
  var peerKey = couch.schema.peer(req.query.id)
  peerHelper.updateConfig(peerKey)
    .then(function(){
      req.flash('success','Peer config updated ok')
      res.redirect('/peer/edit?id=' + req.query.id)
    })
}


/**
 * Start peer
 * @param {object} req
 * @param {object} res
 */
exports.start = function(req,res){
  var peerKey = couch.schema.peer(req.query.id)
  peerHelper.action(peerKey,'start')
    .then(function(){
      req.flash('success','Peer started')
      res.redirect('/peer/edit?id=' + req.query.id)
    })
}


/**
 * Stop peer
 * @param {object} req
 * @param {object} res
 */
exports.stop = function(req,res){
  var peerKey = couch.schema.peer(req.query.id)
  peerHelper.action(peerKey,'stop')
    .then(function(){
      req.flash('success','Peer stopped')
      res.redirect('/peer/edit?id=' + req.query.id)
    })
}


/**
 * Restart peer
 * @param {object} req
 * @param {object} res
 */
exports.restart = function(req,res){
  var peerKey = couch.schema.peer(req.query.id)
  peerHelper.action(peerKey,'restart')
    .then(function(){
      req.flash('success','Peer restarted')
      res.redirect('/peer/edit?id=' + req.query.id)
    })
}
