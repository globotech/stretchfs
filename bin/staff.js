'use strict';
var P = require('bluebird')
var Table = require('cli-table')
var program = require('commander')

var sequelize = require('../helpers/sequelize')()
var logger = require('../helpers/logger')

var Staff = sequelize.models.Staff

var config = require('../config')

sequelize.doConnect()
  .then(function(){
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
          var doc = Staff.build({
            email: opts.email,
            password: opts.password,
            name: opts.name,
            active: true
          })
          return doc.save()
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
        Staff.find({where: {email: opts.email}})
          .then(function(doc){
            if(opts.newEmail) doc.email = opts.newEmail
            if(opts.password) doc.password = opts.password
            if(opts.name) doc.name = opts.name
            return doc.save()
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
        Staff.find({where: {email: opts.email}})
          .then(function(doc){
            if(!doc) throw new Error('Could not find staff member')
            return doc.destroy()
          })
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
        Staff.findAll()
          .then(function(results){
            var table = new Table({
              head: ['Email','Name','Active']
            })
            results.forEach(function(row){
              table.push([row.email,row.name,row.active ? 'Yes' : 'No'])
            })
            logger.log('info',table.toString())
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
  })
