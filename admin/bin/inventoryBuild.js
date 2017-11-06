'use strict';
var couch = require('../../helpers/couchbase')

var listInventory = require('../helpers/inventory')

var config = require('../../config')

//open some buckets
var ooseInventory = couch.inventory()


/**
 * Setup subRecord counter fields
 * @param {object} subRecord
 * @return {object}
 */
var setupCounter = function(subRecord){
  if(!subRecord.value.hitCount){
    subRecord.value.hitCount = 0
  }
  if(!subRecord.value.byteCount){
    subRecord.value.byteCount = 0
  }
  if(!subRecord.value.lastCounterClear){
    subRecord.value.lastCounterClear = new Date().toJSON()
  }
  return subRecord
}

console.log('Beginning to build inventory based off existing keys')
listInventory.listBuild(couch,ooseInventory,couch.type.INVENTORY)
  .then(function(result){
    return result
  })
  .each(function(row){
    //now either find or create a new inventory meta record
    //the idea of the records is that there is a parent meta record that
    //heads up the child records that point to the individual store entries
    //this will allow contentExists to simply query by hash it will also allow
    //for the efficient building of inventoryBalance

    //get the original inventory record complete
    var hashKey
    var subKey = row.id
    var subRecord
    return ooseInventory.getAsync(subKey)
      .then(function(result){
        subRecord = result
        //identify converted records and skip
        if(!subRecord.hash && !subRecord.mimeType){
          throw new Error('up-to-date')
        }
        //from here we extract the hash a look for the meta record
        hashKey = couch.schema.inventory(subRecord.value.hash)
        return ooseInventory.getAndLockAsync(hashKey)
      })
      .then(
        function(result){
          //update the map on the existing record
          var mapExists = false
          result.value.map.forEach(function(row){
            if(
              row.prism === subRecord.value.prism &&
              row.store === subRecord.value.store
            ){
              mapExists = true
            }
          })
          if(!mapExists){
            result.value.map.push({
              prism: subRecord.value.prism,
              store: subRecord.value.store
            })
          }
          if(!result.value.size && subRecord.value.size){
            result.value.size = subRecord.value.size
          }
          if(result.value.size && subRecord.value.size > result.value.size){
            result.value.size = subRecord.value.size
          }
          if(!result.value.mimeType){
            result.value.mimeType = subRecord.value.mimeType
          }
          if(!result.value.mimeExtension){
            result.value.mimeExtension = subRecord.value.mimeExtension
          }
          if(!result.value.minCount){
            result.value.minCount = config.inventory.defaultMinCount || 2
          }
          if(!result.value.desiredCount){
            result.value.desiredCount =
              config.inventory.defaultDesiredCount || 2
          }
          if(!result.value.relativePath){
            result.value.relativePath = subRecord.value.relativePath
          }
          //update replica count
          result.value.count = result.map.length
          result.value.updatedAt = new Date().toJSON()
          return result
        },
        function(err){
          if(13 !== err.code) throw err
          //this is a new record
          return {
            value: {
              hash: subRecord.value.hash,
              mimeExtension: subRecord.value.mimeExtension,
              mimeType: subRecord.value.mimType,
              relativePath: subRecord.value.relativePath,
              map: [
                {prism: subRecord.value.prism, store: subRecord.value.store}
              ],
              count: 1,
              minCount: config.inventory.defaultMinCount || 2,
              desiredCount: config.inventory.defaultDesiredCount || 2,
              createdAt: new Date().toJSON(),
              updatedAt: new Date().toJSON()
            },
            cas: null
          }
        }
      )
      .then(function(result){
        return ooseInventory.upsertAsync(
          hashKey,result.value,{cas: result.cas})
      })
      .then(function(){
        //update the hash record and remove values that should no longer
        //be there
        delete subRecord.value.hash
        delete subRecord.value.mimeExtension
        delete subRecord.value.mimeType
        delete subRecord.value.size
        //add the hit counters
        setupCounter(subRecord)
        return ooseInventory.upsertAsync(
          subKey,subRecord.value,{cas: subRecord.cas})
      })
      .catch(function(err){
        if('up-to-date' !== err.message) throw err
      })
  })
  .then(function(){
    console.log('Inventory build complete')
    process.exit()
  })
  .catch(function(err){
    console.log(err)
    process.exit(1)
  })
