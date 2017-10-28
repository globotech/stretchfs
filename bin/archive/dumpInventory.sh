#!/usr/bin/env bash
store="$1"
prefix="$2"
if [[ "" == "$prefix" ]]; then
  prefix="/media"
fi
folder="$prefix/$store/store/content"
echo "Locating store at $folder"
cd $folder
echo "Beginning inventory dump"
time find . -type f | xargs -I {} node /opt/oose/bin/pathToSha1.js {} > inventory-`date +%Y%m%d`-$store.txt
echo "Inventory dump complete"
