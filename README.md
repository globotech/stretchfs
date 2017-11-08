StretchFS [![Build Status](https://travis-ci.org/nullivex/stretchfs.svg?branch=master)](https://travis-ci.org/nullivex/stretchfs)
========

Global File System

## Description

I want to take some time to explain what StretchFS is and how we use it. StretchFS in a
short description, is a multi purpose, multi backed, multi OS, redundant,
shared, sharded, cloud file system built on top of Node.JS with a
kernel mentality.


Now I will try to explain this in short amounts at a time.
StretchFS hashes (with SHA1 by default) files (not blocks, thus it is not a
viable block level storage system) and stores them across zones which are
headed up by Prisms. It is purpose built to drive file based CDNs and archival
storage networks.


Prisms are the main directors of the StretchFS system below each prism is one or
more Store nodes. Prisms represent a group of Store nodes and manages that
group itself. StretchFS is designed to handle fault tolerance across zones. This
intends on Prisms and their entire group of stores going offline. Individual
Store outages do not affect operations. Prism outages will reduce the available
clone counts for content hosted in that zone.


StretchFS is based on the Google File System model however instead of blocking by
64MB chunks, StretchFS hashes entire files.


What can StretchFS be used for?


StretchFS is great for delivering videos. In fact, that is its primary purpose for
existence. However, it is built as a multi purpose system that can host, save,
and stream any type of file.


### Some other uses for StretchFS
* Archival storage or backup networks.
* Network shared multimedia hosting.
* Business video hosting for advertising.
* Advertising video streaming.
* Proprietary video streaming.
* Large scale campus storage networks.
* Large scale cloud storage networks.
* High concurrency, high user, high performance file based CDNs.

More to come for StretchFS.

## Installation

```
$ git clone git@github.com:nullivex/stretchfs.git
$ cd stretchfs
$ npm install
```

## Starting

First, setup a local config file like so.

```js
'use strict';
module.exports = {
  admin: {
    enabled: true
  },
  prism: {
    enabled: true
  },
  store: {
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

## Debugging

All debug logging now uses the [https://github.com/visionmedia/debug](debug)
package.

The following can be used to see all messages (typically used in dev)
```
$ DEBUG=stretchfs:* node app
```

From there follow the debug filtering rules defined
[https://github.com/visionmedia/debug#wildcards](here)

## Changelog

### 3.0.0 [View Issues](https://bugs.nullivex.com/roadmap_page.php?version_id=5)

* Renamed to StretchFS, RIP OOSE :(
* Introduce new send component to aid in dropping NGINX OpenResty from the StretchFS
standard build.
* Prism now listens on multiple ports to support CDN functionality without the
need for a proxy.
* Send also supports listening on multiple ports. Again this is to complete the
endpoint from Prism to Store to Send without the need for any third party web
server software.
* Merge patches of various 2.4 scripts.
* Add logger helper to enable syslog formatting for logs.
* Clonetool dropped
* bin/createPurchasedb.js dropped
* Replace Couchdb with Couchbase to provide a more consistent database model.
 StretchFS does is not compatible with eventual consistency which adds various
 failures that StretchFS does not know how to handle properly and results in false
 404s. These result from poor timing. The solution is to use couchbase which
 will provide StretchFS with consistent results, better timing / scaling.
* Drop nano / couchdb / cradle
* Implement Couchbase helper
* Update config to work with Couchbase
* Update tests to work with Couchbase
* Update Travis-CI to work with Couchbase
* Merge Shredder 2.0 into StretchFS renaming it to the StretchFS Job system. StretchFS will
no longer depend on an outside source for compute jobs.
* Started with Couchbase support for 4.5+ now supports Couchbase 5.0+
* Reduce bucket usage from 6 to 3, implements: stretchfs, stretchfs-inventory, stretchfs-purchase
  heartbeat, job, and peer have been merged into the primary stretchfs bucket.

### 2.4.0

* Final release as OOSE
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
* Drop StretchFS backed content existence system
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
* `stretchfs-sdk` 1.2.0 has been released in conjunction with this release.
* All clients that purchase content need to request purchases with file
extension, this is a breaking change.
* Exists now takes timeout and retryCount at call time to ensure that scripts
and other tools that need a higher level of guarantee that content doesnt
exist will get a more reliable result.

### 1.1.0
* Many bug fixes from initial production deployment
* Exists now takes bulk requests with an array of sha1's and is still
backward compatible with singular requests.
* Upgrade to stretchfs-sdk 1.1.0 which implements the Prism helper
* Sessions are now sticky and can be generated through the stretchfs-sdk
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
 [View Issues](https://github.com/nullivex/stretchfs/issues?q=milestone%3A0.5.6+is%3Aclosed)
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
[View Issues](https://github.com/nullivex/stretchfs/issues?q=milestone%3A0.5.0+is%3Aclosed)
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
[View Issues](https://github.com/nullivex/stretchfs/issues?q=milestone%3A0.4.0+is%3Aclosed)
* Upgraded to Express 4 system wide
* Upgraded to object-manage 0.8 system wide
* Dropped restler in favor of request
* Work in progress...

### 0.3.0
[View Issues](https://github.com/nullivex/stretchfs/issues?q=milestone%3A0.3.0+is%3Aclosed)
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
