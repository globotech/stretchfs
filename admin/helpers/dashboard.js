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
  var qstring = 'SELECT COUNT() AS _count FROM ' +
    couch.getName(couch.type.STRETCHFS) + ' WHERE META().id LIKE $1'
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
    couch.getName(couch.type.STRETCHFS) + ' WHERE META().id LIKE $1'
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
    'SUM(MULTIPLY(`' + name + '`,`' + multiplier + '`)) AS _count FROM ' +
    couch.getName(couch.type.STRETCHFS) + ' WHERE META().id LIKE $1'
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
  var qstring = 'SELECT COUNT() AS _count FROM ' +
    couch.getName(couch.type.STRETCHFS) +
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
  var qstring = 'SELECT COUNT() AS _count FROM ' +
    couch.getName(couch.type.STRETCHFS) +
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
  var qstring = 'SELECT ' +
    couch.getName(couch.type.STRETCHFS) + '.* FROM ' +
    couch.getName(couch.type.STRETCHFS) +
    ' WHERE META().id LIKE $1 ORDER BY `' + name + '` DESC LIMIT ' + limit
  var qvalue = [key + '%',value]
  var query = couch.N1Query.fromString(qstring)
  return cb.queryAsync(query,qvalue)
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
  return sequelize.query(
    'SELECT SUM(`hits`) AS `hits`, `hour` FROM `NetworkTagStats` ' +
    'WHERE `hour` >= :minHour AND `hour` <= :maxHour ' +
    'GROUP BY (`hour`) ORDER BY `hour` DESC',
    {
      replacements: {minHour: minHour,maxHour: maxHour},
      type: sequelize.QueryTypes.SELECT
    }
  )
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
          thisBucket.data = bucket.hits
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
