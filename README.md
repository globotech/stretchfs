OOSE [![Build Status](https://travis-ci.org/nullivex/oose.svg?branch=master)](https://travis-ci.org/nullivex/oose)
========

Object Oriented Storage Engine

## Installation

```
$ git clone git@github.com:nullivex/oose.git
$ cd oose
$ npm install
```

## Starting

First, setup a local config file like so.

```js
'use strict';
module.exports = {
  store: {
    enabled: true
  },
  prism: {
    enabled: true
  }
}
```

Of course any additional overrides can be added to the config here.

Second, start the system.

```
$ node app
```

## Testing

The default test suite can be ran using npm

```
$ npm test
```

For development a more interactive test method might be best

```
$ mocha -R spec --watch
```

## Debugging

All debug logging now uses the [https://github.com/visionmedia/debug](debug)
package.

The following can be used to see all messages (typically used in dev)
```
$ DEBUG=oose:* node app
```

From there follow the debug filtering rules defined
[https://github.com/visionmedia/debug#wildcards](here)

## Changelog

### 2.5.0

* Introduce new send component to aid in dropping NGINX OpenResty from the OOSE
standard build.
* Prism now listens on multiple ports to support CDN functionality without the
need for a proxy.
* Send also supports listening on multiple ports. Again this is to complete the
endpoint from Prism to Store to Send without the need for any third party web
server software.
* Merge patches of various 2.4 scripts.
* Add logger helper to enable syslog formatting for logs.
* Clonetool enriched with more upgrades/features/fixes
* bin/createPurchasedb.js now maintains expiry of old databases
  with option `-K <days>` (keep `n` days, default `10`) 
* Added configuration option `clonetool.storeProtected` which is an Array of
  store names that will not be subject to automatic deletions (such as reducing
  counts with clonetool).  Default is an empty Array.
* Added boolean `protected` to Peer record which when existing and `true` will
  concatenate that store onto the list (if any) provided in the above
  `clonetool.storeProtected` Array at runtime.

### 2.4.0

* Removal of the idea of keeping symlinks for reverse lookups, uses globby
* Store removal function upgraded
* Adds content verification to verify integrity of content on disk
* Upgrades hashFile.find and hashFile.details to be more thorough
* Fixing travis builds
* Clonetool now offers manual clone and removal of hash lists to stores
* Clonetool has been fixed and upgraded to support its original specs plus more
* Store send now verifies content before sending to ensure cloning valid content
* Clonetool now reports transfer stats on clone sends

### 2.3.0

* Final revision to purchase system
* Purchases are now stored in couch but in shard friendly databases
* This drops the entire symlink functionality from the stores
* Stores now rely on a lua shim to validate purchases
* Store hook has been added to validate purchases and return valid URIs to NGINX

### 2.2.0

* Purchases are once again stored in redis, but this time pointing at a single
HA redis instance.
* Drop bloat from the purchase record.
* Prototype for clone scaling on demand for load reactivity.
* Bump dependencies.

### 2.1.0

* Add CouchDB migration script from 2.0.x
* Change CouchDB key structure to save disk space.

### 2.0.4

* Organize data into separate couchdb databases for better performance
reliability and debugging.
* Add Heartbeat startup delay.

### 2.0.3

* Improve inventory system
* Extract purchase and inventory to script level
* Rebuilt heartbeat system
* Updated dependencies
* Add bubble cache to purchases
* Add bubble cache to content existence

### 2.0.1

* Add inventory driver system
* Abstract native inventory driver from current implementation
* Implement unix high performance driver
* Auto load proper inventory driver

### 2.0.0

* Implement heartbeat system with downvoting to avoid outages
* Move install scripts to the `install` folder
* Move NGINX configuration templates to `install` folder
* Implement Node.JS backed installation script with a bash bootstrap script
* Upgraded all dependencies and Node.js 4.2.x / 5.x compatible.
* Drop master, as being replaced by CouchDB
* Drop redis, as being replaced by CouchDB
* Drop MySQL, as being replaced by CouchDB
* Implement CouchDB for cluster consistency
* Scan content existence directly into CouchDB
* Drop OOSE backed content existence system
* Variable hash typing added the following ciphers are supported
  * sha512
  * sha384
  * sha256
  * sha224
  * sha1
  * md5
* The new variable hashing system defaults to sha1 (to be backwards compatible) this can be changed in the configuration.

### 1.3.0

This version changes the stateless existence system to a more stateful system
powered by the master. Also purchase records are going to be moved to the master
so that prisms cannot lose sync by being rebooted or by outages. This will also
greatly improve the performance of the existence and purchase systems. Which
should increase cluster performance in general.

These changes will not affect any of the client side functionality and will not
break any APIs no require any changes to the SDK.

* Add inventory system to the master to maintain copy of all data on the
cluster.
* Add tests for inventory system.
* Add script to scan store inventory and submit it to master
* Add proactive cache filling of existence on prism from master
* Store purchases on master
* Add tests for purchase system
* Add proactive cache filling of purchase on prism from master
* Drop unused memory system from master

### 1.2.0
* Purchases now require file extension to ensure consistency of purchases.
* File detail can be used to ascertain an unknown mime type from a sha1
* `oose-sdk` 1.2.0 has been released in conjunction with this release.
* All clients that purchase content need to request purchases with file
extension, this is a breaking change.
* Exists now takes timeout and retryCount at call time to ensure that scripts
and other tools that need a higher level of guarantee that content doesnt
exist will get a more reliable result.

### 1.1.0
* Many bug fixes from initial production deployment
* Exists now takes bulk requests with an array of sha1's and is still
backward compatible with singular requests.
* Upgrade to oose-sdk 1.1.0 which implements the Prism helper
* Sessions are now sticky and can be generated through the oose-sdk
* Finished clonetool for managing content cluster wide
* Added storeInventory tool for displaying and repairing store content
* Added prunePurchases tool for keeping purchases from leaking
* Updated nginx configuration for better cluster management
* Added content disposition headers to nginx config
* Improve prism query string handling on requests

### 1.0.0
* Ground up rewrite
* Major restructure of cluster mentality
* Cluster hierarchy upgraded for global CDNs
* No longer exports data, should use existing tools (such as nginx)
* Multicast is no longer used
* SNMP is no longer used
* Announcement and ping have been removed
* Unicast network style
* RESTful HTTP API's for public/private interaction
* Code is implemented using promises
* `infant` is used for process control
* 100% test coverage

### 0.6.0
* Implemenation of infant for worker control
* Promisifcation of some of the base code
* Bug fixes

### 0.5.6
 [Closed Issues](https://github.com/eSited/oose/issues?q=milestone%3A0.5.6+is%3Aclosed)
* Fix inventory handling of stream for builds
* Shredder workers now implement the helpers/child system
* Fixes #134 related to hash update fails
* Completely removed all occurrences of streams1 and upgraded everything to
streams2
* Fixes #135 where callbacks would be called multiple times during sending
of files to peers using peer.sendFromReadble
* Fixes #132 by increasing the default timeout for locates and making the
setting configurable
* Closes #136 child helper will now kill all children on exit
* Closes #131 prism only uses a single locate connection now and all of the
one off connections now close properly once the transaction is finished
* Fixes #129 which prevented shredder from properly load balancing jobs
* Fixes #128 now reports file size of clones
* Closes #122 executioner now makes a backup of the config file before replacing
it
* Fixes #130 removes prism redirect loops, reduces failed locates, better
logic handling to prevent failures under load and unstable network conditions

### 0.5.2
* Fixes #130 related to prism hangs

### 0.5.1
* Fixed issue with failing to complete locate
* Fixed bug with prism not throwing 404's on empty locate
* Fixed bug with export not throwing 404's on non existent files
* Inventory now runs in parallel with configurable concurrence

### 0.5.0
[Closed Issues](https://github.com/eSited/oose/issues?q=milestone%3A0.5.0+is%3Aclosed)
* Removed mesh in favor of more exposed communications
* Implemented multicast helper
* Implemented axon for TCP p2p communication
* Exposed announce as its own subsystem
* Exposed ping as its own subsystem
* Exposed locate as its own subsystem
* Exposed clone as its own subsystem
* Major overhaul of SNMP collection system
* Addition of Child helper for controlling sub processes
* All sub systems now run in their own sub process
* Fixed several crashes related to inter-peer communication
* Better error handling and watchdog ability through sub processes
* Introduction of unit testing, more test coverage to follow

### 0.4.0
[Closed Issues](https://github.com/eSited/oose/issues?q=milestone%3A0.4.0+is%3Aclosed)
* Upgraded to Express 4 system wide
* Upgraded to object-manage 0.8 system wide
* Dropped restler in favor of request
* Work in progress...

### 0.3.0
[Closed Issues](https://github.com/eSited/oose/issues?q=milestone%3A0.3.0+is%3Aclosed)
* Fix next peer selection to be a list
* Added start param support to export (MP4 pseudo streaming)
* Added looking glass (lg) for cluster status
* Added gump, for user file management interface
* Added shredder transcoding system
* Usage of SNMP for peer stat collection

### 0.2.0
* Never released

### 0.1.0
* Initial release
