'use strict';
var bcrypt = require('bcrypt')
var P = require('bluebird')
var Table = require('cli-table')
var program = require('commander')

var logger = require('../helpers/logger')

var couch = require('../helpers/couchbase')

//make some promises
P.promisifyAll(bcrypt)

//open some buckets
var cb = couch.stretchfs()

var config = require('../config')

//create
program
  .command('create')
  .option('-e, --email <s>','Email')
  .option('-p, --password <s>','Password')
  .option('-n, --name <s>','Name')
  .description('Create new staff member')
  .action(function(opts){
    P.try(function(){
      logger.log('info','Creating staff member')
      if(!opts.email || !opts.password)
        throw new Error('Email and password are required')
      var staffKey = couch.schema.staff(opts.email)
      var doc = {
        email: opts.email,
        password: bcrypt.hashSync(
          opts.password,bcrypt.genSaltSync(12)),
        name: opts.name,
        active: true,
        createdAt: new Date().toJSON()
      }
      return cb.upsertAsync(staffKey,doc)
    })
      .then(function(){
        logger.log('info','Staff member created!')
        process.exit()
      })
      .catch(function(err){
        logger.log('error', 'Error: Failed to create staff member: ' + err)
        process.exit()
      })
  })
//update
program
  .command('update')
  .option('-e, --email <s>','Email used to look up staff member')
  .option('-E, --newEmail <s>','New email address if its being changed')
  .option('-p, --password <s>','Password')
  .option('-n, --name <s>','Name')
  .description('Update existing staff member')
  .action(function(opts){
    if(!opts.email) throw new Error('Email is required')
    var staffKey = couch.schema.staff(opts.email)
    cb.getAsync(staffKey)
      .then(function(result){
        var doc = result.value
        if(opts.newEmail) doc.email = opts.newEmail
        if(opts.password){
          doc.passwordLastChanged = new Date().toJSON()
          doc.password = bcrypt.hashSync(
            opts.password,bcrypt.genSaltSync(12))
        }
        if(opts.name) doc.name = opts.name
        doc.updatedAt = new Date().toJSON()
        return cb.upsertAsync(staffKey,doc,{cas: result.cas})
      })
      .then(function(){
        logger.log('info','Staff member updated successfully!')
        process.exit()
      })
      .catch(function(err){
        if(err) throw new Error('Could not save staff member: ' + err)
      })
  })
//remove
program
  .command('remove')
  .option('-e, --email <s>','Email of staff member to remove')
  .description('Remove staff member')
  .action(function(opts){
    if(!opts.email) throw new Error('Email is required... exiting')
    var staffKey = couch.schema.staff(opts.email)
    cb.removeAsync(staffKey)
      .then(function(){
        logger.log('info','Staff member removed successfully!')
        process.exit()
      })
      .catch(function(err){
        logger.log('error', 'Error: Could not remove staff member: ' + err)
      })
  })
//list
program
  .command('list')
  .description('List staff members')
  .action(function(){
    var clause = {}
    clause.from = ' FROM ' + couch.getName(couch.type.stretchfs)
    clause.where = ' WHERE META().id LIKE $1'
    var query = couch.N1Query.fromString(
      'SELECT *' + clause.from + clause.where
    )
    var table = new Table({
      head: ['Email','Name','Active']
    })
    var staffCount = 0
    var staffKey = couch.schema.staff() + '%'
    return cb.queryAsync(query,[staffKey])
      .each(function(row){
        staffCount++
        table.push([row.email,row.name,row.active ? 'Yes' : 'No'])
      })
      .then(function(){
        if(!staffCount) table.push(['No staff members'])
        console.log(table.toString())
        process.exit()
      })
      .catch(function(err){
        logger.log('error', 'Error: Could not list staff members ' +
          err.stack)
        process.exit()
      })
  })
program.version(config.version)
var cli = program.parse(process.argv)
if(!cli.args.length) program.help()
