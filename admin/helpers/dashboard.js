'use strict';
var moment = require('moment')
var numeral = require('numeral')

var couch = require('../../helpers/couchbase')

//open some buckets
var cb = couch.stretchfs()


/**
 * Format hits
 * @param {int} hits
 * @param {boolean} format
 * @return {number}
 */
exports.formatHits = function(hits,format){
  if(true === format){
    return numeral(hits).format('0,0')
  } else {
    return +hits
  }
}


/**
 * Make hour from Date object
 * @param {Date} date
 * @return {number}
 */
exports.makeHour = function(date){
  return Math.floor(+(date || new Date()) / 3600000)
}


/**
 * Get a counter value
 * @param {string} key
 * @return {P}
 */
exports.counter = function(key){
  return cb.getAsync(key)
    .then(function(result){
      return +result.value
    })
    .catch(function(err){
      if(13 !== err.code) throw err
      return 0
    })
}


/**
 * Count records by key
 * @param {string} key
 * @return {P}
 */
exports.count = function(key){
  var qstring = 'SELECT COUNT(META().id) AS _count FROM ' +
    couch.getName(couch.type.stretchfs) + ' WHERE META().id LIKE $1'
  var qvalue = [key + '%']
  var query = couch.N1Query.fromString(qstring)
  return cb.queryAsync(query,qvalue)
    .then(function(result){
      return +result[0]['_count']
    })
    .catch(function(err){
      if(13 !== err.code) throw err
      return 0
    })
}


/**
 * Sum value by key
 * @param {string} key
 * @param {string} name
 * @return {P}
 */
exports.sum = function(key,name){
  var qstring = 'SELECT SUM(`' + name + '`) AS _count FROM ' +
    couch.getName(couch.type.stretchfs) + ' WHERE META().id LIKE $1'
  var qvalue = [key + '%']
  var query = couch.N1Query.fromString(qstring)
  return cb.queryAsync(query,qvalue)
    .then(function(result){
      return +result[0]['_count']
    })
    .catch(function(err){
      if(13 !== err.code) throw err
      return 0
    })
}


/**
 * Sum value by key and multiply by value
 * @param {string} key
 * @param {string} name
 * @param {string} multiplier
 * @return {P}
 */
exports.sumMultiply = function(key,name,multiplier){
  var qstring = 'SELECT ' +
    'SUM(`' + name + '` * `' + multiplier + '`) AS _count FROM ' +
    couch.getName(couch.type.stretchfs) + ' WHERE META().id LIKE $1'
  var qvalue = [key + '%']
  var query = couch.N1Query.fromString(qstring)
  return cb.queryAsync(query,qvalue)
    .then(function(result){
      return +result[0]['_count']
    })
    .catch(function(err){
      if(13 !== err.code) throw err
      return 0
    })
}


/**
 * Count by value
 * @param {string} key
 * @param {string} name
 * @param {string} value
 * @return {P}
 */
exports.countByValue = function(key,name,value){
  var qstring = 'SELECT COUNT(META().id) AS _count FROM ' +
    couch.getName(couch.type.stretchfs) +
    ' WHERE META().id LIKE $1 AND `' + name + '` = $2'
  var qvalue = [key + '%',value]
  var query = couch.N1Query.fromString(qstring)
  return cb.queryAsync(query,qvalue)
    .then(function(result){
      return +result[0]['_count']
    })
    .catch(function(err){
      if(13 !== err.code) throw err
      return 0
    })
}


/**
 * Count by member
 * @param {string} key
 * @param {string} name
 * @param {string} value
 * @return {P}
 */
exports.countByMember = function(key,name,value){
  var qstring = 'SELECT COUNT(META().id) AS _count FROM ' +
    couch.getName(couch.type.stretchfs) +
    ' WHERE META().id LIKE $1 AND $2 IN `' + name + '`'
  var qvalue = [key + '%',value]
  var query = couch.N1Query.fromString(qstring)
  return cb.queryAsync(query,qvalue)
    .then(function(result){
      return +result[0]['_count']
    })
    .catch(function(err){
      if(13 !== err.code) throw err
      return 0
    })
}


/**
 * Top records by value
 * @param {string} key
 * @param {string} name
 * @param {integer} limit
 * @return {P}
 */
exports.topRecordsByValue = function(key,name,limit){
  if(!limit) limit = 1
  else limit = parseInt(limit,10)
  var tname = couch.getName(couch.type.stretchfs)
  var qstring = 'SELECT META().id AS _id, ' + tname + '.* FROM ' + tname +
    ' WHERE META().id LIKE $1 ORDER BY `' + name + '` DESC LIMIT ' + limit
  var qvalue = [key + '%']
  var query = couch.N1Query.fromString(qstring)
  return cb.queryAsync(query,qvalue)
    .then(function(result){
      return result
    })
}


/**
 * Query graph buckets
 * @param {int} minHour
 * @param {int} maxHour
 * @param {int} bucketCount
 * @return {P}
 */
exports.queryGraphBuckets = function(minHour,maxHour,bucketCount){
  var data = {data: [], labels: []}
  var reqKey = couch.schema.counter('requests')
  var minKey = reqKey + ':' + minHour
  var maxKey = reqKey + ':' + maxHour
  var tname = couch.getName(couch.type.stretchfs)
  var qstring = 'SELECT META().id AS _id, ' + tname + ' AS `requests`' +
    ' FROM ' + tname +
    ' WHERE META().id >= $1 AND META().id <= $2 ' +
    ' ORDER BY META().id DESC'
  var qvalue = [minKey,maxKey]
  var query = couch.N1Query.fromString(qstring)
  return cb.queryAsync(query,qvalue)
    .map(function(row){
      var _id = row._id
      delete row._id
      row.hour = +_id.replace(reqKey + ':','')
      return row
    })
    .then(function(result){
      var tryBucket = function(i){
        var thisHour = exports.makeHour(
          moment(minHour * 3600000).add(i,'hours'))
        var thisBucket = {
          label: moment((thisHour * 3600000)).format('MM/DD hh:mmA'),
          data: 0
        }
        result.forEach(function(bucket){
          if(thisHour !== bucket.hour) return
          thisBucket.data = bucket.requests
        })
        data.labels.push(thisBucket.label)
        data.data.push(thisBucket.data)
      }
      for(var i = 0; i <= bucketCount; i++){
        tryBucket(i)
      }
      return data
    })
}
