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

banner "Installing StretchFS"
echo

[ -d "/opt/stretchfs" ] && echo "StretchFS already installed" && exit 0

# start running commands
runCommand "cd /opt"
runCommand "git clone -q git@github.com:nullivex/stretchfs.git"
runCommand "cd /opt/stretchfs"
runCommand "git checkout master"
npm config set color false
runCommand "npm -q --no-spin install"
runCommand "mkdir -p /var/log/node/stretchfs"
runCommand "chown -R node:node /var/log/node"
runCommand "chown -R node:node /opt/stretchfs/dt"
runCommand "rm -f /etc/service/stretchfs"
runCommand "ln -sf /opt/stretchfs/dt /etc/service/stretchfs"
[ ! -d /opt/stretchfs/log ] && runCommand "mkdir /opt/stretchfs/log"
runCommand "chown -R node:node /opt/stretchfs/log"
[ ! -d /data ] && runCommand "mkdir /data"
runCommand "chown -R node:node /data"

banner "Installation Complete"
exit 0
