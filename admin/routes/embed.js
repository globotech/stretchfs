'use strict';
var fs = require('graceful-fs')
var path = require('path')
var async = require('async')

var couch = require('../../helpers/couchbase')

var prism = require('../helpers/prismConnect')

//open some buckets
var cb = couch.stretchfs()


/**
 * API Embed Details
 * @param {object} req
 * @param {object} res
 */
exports.apiDetails = function(req,res){
  var embed
  async.series(
    [
      function(next){
        Embed.findOne({handle: req.params.handle},function(err,result){
          if(err){
            console.log('Error looking up embed object: ' + err.message)
            return next({code: 500, message: err.message})
          }
          if(!result)
            return next({code: 404, message: 'Embed object not found'})
          embed = result
          next()
        })
      }
    ],
    function(err){
      if(err){
        res.status(err.code || 500)
        res.json({
          status: 'error',
          code: err.code,
          message: err.message
        })
      } else {
        res.json({
          status: 'ok',
          code: 0,
          embed: embed.toJSON()
        })
      }
    }
  )
}


/**
 * Render embed object display
 * @param {object} req
 * @param {object} res
 */
exports.render = function(req,res){
  Embed.findOne({handle: req.params.handle},function(err,embed){
    if(err){
      res.status(500)
      res.send('There was an error accessing the back end.')
      console.log('Error looking up embed object: ' + err.message)
      return
    }
    if(!embed){
      res.status(404)
      res.send('Embed object not found')
      return
    }
    if(
      !fs.existsSync(
        path.resolve(__dirname + '/../views/embed/' + embed.template + '.jade')
      )
    ){
      res.status(500)
      res.send('Embed template doesnt exist')
      return
    }
    //purchase the content
    embed.video('480p')
      .then(function(purchase){
        res.render('embed/' + embed.template,{
          embed: embed,
          purchase: purchase,
          videoUrl: prism.urlPurchase(purchase),
          previewUrl: embed.preview()
        })
      })

  })
}
