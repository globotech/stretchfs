'use strict';
var P = require('bluebird')
var cp = require('child_process')
var program = require('commander')
var oose = require('oose-sdk')
var ProgressBar = require('progress')

var UserError = oose.UserError

var config = require('../../config')
var logger = require('../../helpers/logger')

var disks = []
var progress = {}

var parseDisk = function(val){
  disks = val.split(',')
}

program
  .version(config.version)
  .option('-c, --cpu','Enable CPU testing')
  .option('-C, --cpu-cores <n>','Number of CPU cores')
  .option('-d, --disk <items>','Disks to test',parseDisk)
  .option('-m, --memory','Enable memory testing')
  .option('-M, --memory-amount <n>','MB of memory to test')
  .option('-n, --network','Enable network testing')
  .option('-i, --iperf <s>','iperf server for network testing')
  .option('-r, --rounds <n>','Repeat test n times')
  .parse(process.argv)

//make some promises
P.promisifyAll(cp)

P.try(function(){
  logger.log('info','Welcome to OOSE Burn In')
  logger.log('info','-----------------------')
  if(disks.length > 0)
    logger.log('info','Disk testing enabled...')
  if(program.cpu)
    logger.log('info','CPU testing enabled...')
  if(program.memory)
    logger.log('info','Memory testing enabled...')
  if(program.network)
    logger.log('info','Network testing enabled...')
  if(program.network && !program.iperf)
    throw new UserError('Network testing enabled without iperf server')
  var rounds = +(program.rounds || 1)
  logger.log('info','About to start ' + rounds +
    ' rounds of concurrent testing')
  logger.log('info',
    'WARNING! System will become very unresponsive during tests.')
  progress = new ProgressBar(
    '  burn-in [:bar] :current/:total :percent :etas',
    {
      total: rounds,
      width: 50,
      complete: '=',
      incomplete: '-'
    }
  )
  var iterations = []
  for(var i = 0; i < rounds; i++){
    iterations.push(i)
  }
  return iterations
})
  .each(function(iteration){
    var start = +(new Date())
    logger.log('info','Starting round #' + iteration + ' @ ' + (new Date()))
    var cpuCores = +(program.cpuCores || 1)
    var promises = []
    var i = 0
    //test disks
    if(disks.length > 0){
      var disk = ''
      for(i = 0; i < disks.length; i++){
        disk = disks[i]
        promises.push(cp.execAsync(
          'cd ' + disk + '; iozone -a >/dev/null 2>&1'))
      }
    }
    //test cpu
    if(program.cpu){
      for(i = 0; i < cpuCores; i++){
        promises.push(cp.execAsync('nbench >/dev/null 2>&1'))
      }
    }
    //test memory
    if(program.memory){
      var memoryAmount = program.memoryAmount || 1024
      promises.push(cp.execAsync(
        'memtester ' + memoryAmount + 'M 1 >/dev/null 2>&1'))
    }
    //test network
    if(program.network && program.iperf){
      promises.push(
        cp.execAsync('iperf3 -t 300 -c ' + program.iperf + ' >/dev/null 2>&1')
          .then(function(){
            return cp.execAsync(
              'iperf3 -R -t 300 -c ' + program.iperf + ' >/dev/null 2>&1')
          })
      )
    }
    return P.all(promises)
      .finally(function(){
        var end = +(new Date())
        var duration = ((end - start) / 1000).toFixed(2)
        logger.log('info',
          'Round #' + iteration + ' has finished in' + duration + ' seconds')
        progress.tick()
      })
  })
  .then(function(){
    logger.log('info','Burn in tests complete. Looks good :)  Bye!')
    process.exit()
  })
