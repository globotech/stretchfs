'use strict';
var P = require('bluebird')
var expect = require('chai').expect
var fs = require('graceful-fs')
var mkdirp = require('mkdirp-then')
var oose = require('oose-sdk')
var path = require('path')

var content = oose.mock.content
var hashFile = require('../helpers/hashFile')

var config = require('../config')
var relativeDestination = content.relativePath
var destination = path.resolve(config.root + '/content/' + content.relativePath)

//make some promises
P.promisifyAll(fs)


/**
 * Rewrite hash name
 * @type {string}
 */
content.hash = content.sha1

describe('hashFile',function(){
  it('should produce a relative path from hash',function(){
    expect(
      hashFile.toRelativePath(content.hash,content.ext)
    ).to.equal(relativeDestination)
  })
  it('should produce a path from hash',function(){
    expect(hashFile.toPath(content.hash,content.ext)).to.equal(destination)
  })
  it('should produce a hash from path',function(){
    expect(hashFile.fromPath(destination)).to.equal(content.hash)
  })
  it('should produce a short path without an extension',function(){
    expect(hashFile.toPath(content.hash)).to.equal(
      destination.replace(/\.\w+$/,'')
    )
  })
  it('should validate a hash',function(){
    expect(hashFile.validate(content.hash)).to.equal(true)
  })
  it('should invalidate a hash',function(){
    expect(hashFile.validate('brown')).to.equal(false)
  })
  describe('hashFile:operations',function(){
    beforeEach(function(){
      return mkdirp(path.dirname(destination))
        .then(function(){
          return fs.writeFileAsync(destination,content.data)
        })
    })
    afterEach(function(){
      return hashFile.remove(content.hash)
    })
    it('should find a file by hash',function(){
      return hashFile.find(content.hash,content.ext)
        .then(function(file){
          expect(file.hash).to.equal(content.hash)
          expect(file.ext.replace('.','')).to.equal(content.ext)
          expect(file.path).to.equal(destination)
        })
    })
    it('should have details for a file',function(){
      return hashFile.details(content.hash,content.ext)
        .then(function(details){
          expect(details.hash).to.equal(content.hash)
          expect(details.ext).to.equal(content.ext)
          expect(details.path).to.be.a('string')
          expect(details.stat).to.be.an('object')
          expect(details.exists).to.equal(true)
        })
    })
    it('should have details for a bogus file',function(){
      return hashFile.details(content.sha1Bogus)
        .then(function(details){
          expect(details.hash).to.equal(content.sha1Bogus)
          expect(details.ext).to.equal('')
          expect(details.path).to.equal('')
          expect(details.stat).to.be.an('object')
          expect(Object.keys(details.stat).length).to.equal(0)
          expect(details.exists).to.equal(false)
        })
    })
  })
})
