#!/bin/bash

script_name="OOSE"
domain=".lab.oose.io"
http_proto="https://"
dc="ESITED-LAX1"
hv_name="h220"
hv_host="h220.esited.net"
hv_ip="`dig @199.87.232.11 +short $hv_host`"
hv_ptr="`dig @199.87.232.11 +short PTR $hv_ip`"
host_name="`hostname`"
host_host="`hostname -f`"
host_ip="`dig @199.87.232.11 +short $host_host`"
host_ptr="`dig @199.87.232.11 +short PTR $host_ip`"


echo "Welcome to the $script_name Lab Environment Status"
echo "As of this writing you are currently on $hv_name ($hv_ip $hv_ptr) in $dc"
echo "We are on $host_host using $host_ip as $host_name"
echo "We thank DNS for all of that information, use it loosely"
echo "-----------------------------------"
date


function ping_url {
  echo -n "Checking $2... "
  res="`curl -s -S -k $http_proto$1$domain/ping`"
  if [[ $res == *"pong"* ]]; then
    echo "OK"
  else
    echo "FAIL"
  fi
}

function check_url {
  echo -n "Checking $2... "
  res="`curl -s -S -k $1`"
  echo -n $res
}

echo "This section will check systems in general"

check_url $http_proto$domain/ "OOSE Entry Point (Load Balancer)"
check_url ${http_proto}shredder$domain/ "Shredder Entry Point (Load Blancer)"

echo "Checking OOSE systems individually"

ping_url prism1 "Prism 1"
ping_url prism2 "Prism 2"
ping_url store1 "Store 1"
ping_url store2 "Store 2"
ping_url store3 "Store 3"
ping_url store4 "Store 4"

echo "Checking Shredder systems individually"

ping_url shredder1 "Shredder 1"
ping_url shredder2 "Shredder 2"
ping_url shredder3 "Shredder 3"

echo "Systems check complete"
