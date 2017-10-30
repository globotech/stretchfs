# System Requirements

Currently this doc refers to the installation procedure we use on our production systems which run Gentoo x64.

## Supported Systems
OOSE is tested working with the following systems.

* Debian Linux Stretch
* Windows 10

Also OOSE should theoretically work on Darwin and Mac OS X (however we have yet to get a chance to test it yet)

## Recommended Systems
We develop OOSE on Windows however since we dont believe Windows creates a very manageable server environment we choose to run all our production server software on Linux. In this particular instance we use Gentoo Linux for its customization and optimization through host level compilation.

## Installation of a Storage Peer
The below software requirements are only for a storage peer that does not host any of the hardware redundant services.

### Software Prerequisites
Most of the installation is just getting the system to a state where all the software prerequisites are satisfied. Instead of creating yet another guide on installing software we will just go over a list of required and recommended software.

#### Required Software
* NodeJS 8.x+
* NPM 5.4+
* Redis 2.6+
* Couchbase 4.5+
