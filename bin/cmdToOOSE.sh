#!/bin/bash

cmd="$1"

while read svr; do
  echo "Executing $cmd on $svr ..."
  echo "----------------------------------------"
  ssh $svr "$cmd" < /dev/null
  echo
done < stretchfs_server_list
