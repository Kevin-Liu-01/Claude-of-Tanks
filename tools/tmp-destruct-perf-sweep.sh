#!/bin/zsh
# tmp-destruct-perf-sweep.sh <tag> — counted-metrics perf sweep over all 8 maps
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh"
cd ~/claude-of-tanks
TAG=$1
ROSTER="kv2,jagdtiger,tiger2,object279,is7,t30,t95,sturmtiger,jpz_e100,is6b,is3,is2,tiger1"
for MAP in verdant desert winter urban coastal autumn steppe railyard; do
  node tools/perfprobe.mjs --seconds 20 --dsf 1 --no-trend --map $MAP --roster $ROSTER \
    --note "destruct-r1-$TAG-$MAP" --out shots/destruct-r1/perf/$TAG-$MAP.json > /dev/null 2> shots/destruct-r1/perf/$TAG-$MAP.err || echo "FAIL $MAP"
  echo "done $MAP"
done
echo "SWEEP COMPLETE $TAG"
