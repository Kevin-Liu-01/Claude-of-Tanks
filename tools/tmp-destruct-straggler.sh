#!/bin/zsh
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh"
ROSTER="kv2,jagdtiger,tiger2,object279,is7,t30,t95,sturmtiger,jpz_e100,is6b,is3,is2,tiger1"
run() { local root=$1 map=$2 out=$3
  for attempt in 1 2 3; do
    (cd "$root" && node tools/perfprobe.mjs --seconds 20 --dsf 1 --no-trend --map $map --roster $ROSTER \
      --note "destruct-r1-straggler-$out" --out ~/claude-of-tanks/shots/destruct-r1/perf/$out.json \
      > /dev/null 2> ~/claude-of-tanks/shots/destruct-r1/perf/$out.err) && { echo "OK $out"; return 0; }
    echo "attempt$attempt failed: $out"; sleep 45
  done
  echo "GAVE-UP $out"
}
run ~/claude-of-tanks verdant after-verdant
run ~/claude-of-tanks urban after-urban
run ~/claude-of-tanks railyard after-railyard
run /tmp/cot-destruct-before railyard before-railyard
echo "STRAGGLERS-COMPLETE"
