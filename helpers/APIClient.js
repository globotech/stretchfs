'use strict';
var P = require('bluebird')
var debug = require('debug')('APIClient')
var fs = require('graceful-fs')
var request = require('request')

var SHA1Stream = require('./SHA1Stream')
var UserError = require('./UserError')

//make some promises
P.promisifyAll(request)



/**
 * Constructor
 * @param {number} port
 * @param {string} host
 * @param {string} protocol
 * @constructor
 */
var APIClient = function(port,host,protocol){
  //defaults
  this.host = '127.0.0.1'
  this.port = 80
  this.protocol = 'http'
  //overrides
  if(host) this.host = host
  if(port) this.port = port
  if(protocol) this.protocol = protocol
  //set the token to an empty object for now
  this.session = {}
  //set basicAuth to disabled
  this.basicAuth = {username: false, password: false}
  //set the base url now
  this.baseURL = this.protocol + '://' + this.host + ':' + this.port
  debug('init complete',this.baseURL)
}


/**
 * Set session token
 * @param {object} session
 */
APIClient.prototype.setSession = function(session){
  debug('setting session',session)
  this.session = session
}


/**
 * Set basic auth
 * @param {string} username
 * @param {string} password
 */
APIClient.prototype.setBasicAuth = function(username,password){
  debug('setting basic auth',username,password)
  this.basicAuth.username = username
  this.basicAuth.password = password
}


/**
 * Validate API Response
 * @param {string} verb
 * @param {string} path
 * @param {object} res
 * @param {object} body
 */
APIClient.prototype.validateResponse = function(verb,path,res,body){
  var that = this
  if(200 !== res.statusCode){
    throw new UserError(
      'Invalid response code (' + res.statusCode + ')' +
      ' to ' + verb + ' ' + that.baseURL + path)
  }
  if(body.error){
    if(body.error.message) throw new UserError(body.error.message)
    if(body.error) throw new UserError(body.error)
  }
}


/**
 * Make a get request
 * @param {string} path
 * @param {object} data
 * @return {P}
 */
APIClient.prototype.get = function(path,data){
  var that = this
  var url = that.baseURL + path
  var options = {qs: data, json: true}
  //add session if we have one
  if(that.session.token) options.qs.token = that.session.token
  //add basic auth if enabled
  if(that.basicAuth.username || that.basicAuth.password){
    options.auth = {
      username: that.basicAuth.username,
      password: that.basicAuth.password
    }
  }
  options.url = url
  debug('----> GET REQ',options)
  return request.getAsync(options)
    .spread(function(res,body){
      debug('<----GET RES',options,body)
      that.validateResponse('GET',path,res,body)
      return [res,body]
    })
}


/**
 * Make a post request
 * @param {string} path
 * @param {object} data
 * @return {P}
 */
APIClient.prototype.post = function(path,data){
  var that = this
  var url = that.baseURL + path
  var options = {json: data || {}}
  //add session if enabled
  if(that.session.token) options.json.token = that.session.token
  //add basic auth if enabled
  if(that.basicAuth.username || that.basicAuth.password){
    options.auth = {
      username: that.basicAuth.username,
      password: that.basicAuth.password
    }
  }
  options.url = url
  debug('----> POST REQ',options)
  return request.postAsync(options)
    .spread(function(res,body){
      debug('<---- POST RES ',options,body)
      that.validateResponse('POST',path,res,body)
      return [res,body]
    })
}


/**
 * Upload a file
 * @param {string} path
 * @param {string} filepath
 * @param {object} data
 * @return {P}
 */
APIClient.prototype.upload = function(path,filepath,data){
  var that = this
  var url = that.baseURL + path
  var options = {formData: data || {}}
  //add session if enabled
  if(that.session.token) options.formData.token = that.session.token
  //add basic auth if enabled
  if(that.basicAuth.username || that.basicAuth.password){
    options.auth = {
      username: that.basicAuth.username,
      password: that.basicAuth.password
    }
  }
  //add file
  options.formData.file = fs.createReadStream(filepath)
  options.url = url
  //make the request
  debug('----> UPLOAD REQ',options)
  return request.postAsync(options)
    .spread(function(res,body){
      body = JSON.parse(body)
      debug('<---- UPLOAD RES',options,body)
      that.validateResponse('UPLOAD',path,res,body)
      return [res,body]
    })
}


/**
 * Download content and respond with a stream
 * @param {string} path
 * @param {object} data
 * @return {P}
 */
APIClient.prototype.download = function(path,data){
  var that = this
  var options = {url: that.baseURL + path, json: data}
  //add session if enabled
  if(that.session.token) options.json.token = that.session.token
  //add basic auth if enabled
  if(that.basicAuth.username || that.basicAuth.password){
    options.auth = {
      username: that.basicAuth.username,
      password: that.basicAuth.password
    }
  }
  var sniff = new SHA1Stream()
  return new P(function(resolve,reject){
    request.post(options)
      .on('error',function(e){
        reject(e)
      })
      .on('response',function(res){
        if(200 !== res.statusCode)
          reject('Invalid response code (' + res.statusCode + ')')
        else
          resolve(sniff)
      })
      .pipe(sniff)
  })

}


/**
 * Export Class
 * @type {APIClient}
 */
module.exports = APIClient
