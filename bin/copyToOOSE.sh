#!/bin/bash

src="$1"
dst="$2"

if [[ $dst == "" ]]; then
  dst="$src"
fi

while read svr; do
  echo -n "Copying $src to $svr:$dst ..."
  scp -q $src $svr:$dst
  echo " $svr done"
done < oose_server_list
