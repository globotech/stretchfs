#!/bin/bash

domain="$1"
if [ -z "$domain" ]; then
  domain="stretchfs.com"
fi
script_name="StretchFS"
http_proto="https://"
host_name="`hostname`"
host_host="`hostname -f`"
host_ip="`dig @8.8.8.8 +short $host_host`"
host_ptr="`dig @8.8.8.8 +short PTR $host_ip`"


echo "Welcome to the $script_name Environment Status"
echo "We are on $host_host using $host_ip as $host_name"
echo "We thank DNS for all of that information, use it lstretchfsly"
echo "-----------------------------------"
echo -n "Currently:"
date


function ping_url {
  echo -n "Pinging $2... "
  res="`curl -s -S $http_proto$1.$domain/ping`"
  if [[ $res == *"pong"* ]]; then
    echo "OK"
  else
    echo "FAIL"
  fi
}

function check_url {
  echo -n "Checking $2... "
  res="`curl -s -S -k $1`"
  rv=$?
  if [ $rv -gt 0 ]; then
    echo -n $res
  else
    echo "OK"
  fi
}

echo
echo "Check Public Access Points"

check_url $http_proto$domain/ "$script_name Entry Point (Load Balancer)"

echo
echo "Check $script_name systems individually"

ping_url prism1 "Prism 1"
ping_url prism2 "Prism 2"
ping_url store1 "Store 1"
ping_url store2 "Store 2"
ping_url store3 "Store 3"
ping_url store4 "Store 4"

echo "Systems check complete"

echo "Starting self tests"

node /opt/stretchfs/test/env/test.js

echo "Self tests complete, please review any errors."
