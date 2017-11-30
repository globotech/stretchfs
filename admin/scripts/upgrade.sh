#!/bin/bash

function banner {
  line=$(echo $1 | tr [:print:] [-*])
  echo
  echo ${line}
  echo "$1"
  echo ${line}
}

function runCommand {
  banner "$1"
  $1
}

banner "Upgrading StretchFS"
echo

[ ! -d "/opt/stretchfs" ] && echo "StretchFS not installed" && exit 0

# start running commands
runCommand "cd /opt/stretchfs"
#runCommand "git checkout stable"
runCommand "git pull"
npm config set color false
runCommand "npm -q --no-spin install"
runCommand "npm -q --no-spin prune"
#runCommand "npm -q --no-spin update"
runCommand "chown -R node:node /opt/stretchfs/dt"
runCommand "rm -f /etc/service/stretchfs"
runCommand "ln -sf /opt/stretchfs/dt /etc/service/stretchfs"
[ ! -d /opt/stretchfs/log ] && runCommand "mkdir /opt/stretchfs/log"
runCommand "chown -R node:node /opt/stretchfs/log"
[ ! -d /var/log/node/stretchfs ] && runCommand "mkdir -p /var/log/node/stretchfs"
runCommand "chown -R node:node /var/log/node"
[ ! -d /data ] && runCommand "mkdir /data"
runCommand "chown -R node:node /data"

banner "Upgrade Complete"
exit 0
