'use strict';
var P = require('bluebird')
var moment = require('moment')
var prettyBytes = require('pretty-bytes')

var couch = require('../../helpers/couchbase')
var dashboard = require('../helpers/dashboard')


/**
 * Dashboard data payload
 * @param {object} req
 * @param {object} res
 */
exports.getUpdate = function(req,res){
  var inventoryKey = couch.schema.inventory()
  var jobKey = couch.schema.job()
  var prismKey = couch.schema.prism()
  var storeKey = couch.schema.store()
  var purchaseKey = couch.schema.purchase()
  var stats = {
    reqCount: 0,
    inventoryCount: 0,
    copyCount: 0,
    size: 0,
    sizeTotal: 0,
    jobCount: 0,
    prismCount: 0,
    storeCount: 0
  }
  //now we need to fill these buckets
  P.all([
    //requests
    dashboard.counter(
      couch.schema.counter('requests')
    ),
    //inventory item count
    dashboard.count(inventoryKey),
    //inventory copy count
    dashboard.sum(inventoryKey,'copies'),
    //space used
    dashboard.sum(inventoryKey,'size'),
    //space total
    dashboard.sumMultiply(inventoryKey,'size','copies'),
    //active job count
    dashboard.countByValue(jobKey,'status','processing'),
    //active prisms
    dashboard.countByMember(prismKey,'roles','online'),
    //active stores
    dashboard.countByMember(storeKey,'roles','online'),
    //get total transfer for the day
    dashboard.queryGraphBuckets(
      dashboard.makeHour(moment().subtract(24,'hours')),
      dashboard.makeHour(moment().add(1,'hour')),
      24
    ),
    //top inventory for the day
    dashboard.topRecordsByValue(inventoryKey,'hitCount',10),
    //top purchases for the day
    dashboard.topRecordsByValue(purchaseKey,'hitCount',10)
  ])
    .then(function(result){
      stats.reqCount = dashboard.formatHits(result[0])
      stats.inventoryCount = dashboard.formatHits(result[1])
      stats.copyCount = dashboard.formatHits(result[2])
      stats.size = dashboard.formatHits(result[3])
      stats.sizeHuman = prettyBytes(+result[3])
      stats.sizeTotal = dashboard.formatHits(result[4])
      stats.sizeTotalHuman = prettyBytes(+result[4])
      stats.jobCount = dashboard.formatHits(result[5])
      stats.prismCount = dashboard.formatHits(result[6])
      stats.storeCount = dashboard.formatHits(result[7])
      var response = {
        stats: stats,
        history: result[8],
        inventoryList: result[9],
        purchaseList: result[10]
      }
      res.json(response)
    })
}


/**
 * Display dashboard
 * @param {object} req
 * @param {object} res
 */
exports.index = function(req,res){
  res.render('dashboard')
}
