#!/usr/bin/env bash
sed -e's%vjs.plugin(%(vjs.registerPlugin||vjs.plugin)(%'\
    -i node_modules/videojs-persistvolume/videojs.persistvolume.js
