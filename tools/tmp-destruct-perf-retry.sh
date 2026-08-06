#!/bin/zsh
# load-gated retries for the destruct-r1 perf matrix stragglers
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh"
ROSTER="kv2,jagdtiger,tiger2,object279,is7,t30,t95,sturmtiger,jpz_e100,is6b,is3,is2,tiger1"
waitquiet() {
  for i in $(seq 1 90); do
    L=$(sysctl -n vm.loadavg | awk '{print $2}' | cut -d. -f1)
    [ "$L" -lt 30 ] && return 0
    sleep 20
  done
  return 0 # proceed anyway after ~30 min; counted metrics tolerate contention
}
run() { # run <root> <map> <outname>
  local root=$1 map=$2 out=$3
  for attempt in 1 2 3; do
    waitquiet
    (cd "$root" && node tools/perfprobe.mjs --seconds 20 --dsf 1 --no-trend --map $map --roster $ROSTER \
      --note "destruct-r1-retry-$out" --out ~/claude-of-tanks/shots/destruct-r1/perf/$out.json \
      > /dev/null 2> ~/claude-of-tanks/shots/destruct-r1/perf/$out.err) && { echo "OK $out"; return 0; }
    echo "retry$attempt failed: $out"
  done
  echo "GAVE-UP $out"
}
[ -f ~/claude-of-tanks/shots/destruct-r1/perf/after-winter.json ] || run ~/claude-of-tanks winter after-winter
[ -f ~/claude-of-tanks/shots/destruct-r1/perf/after-urban.json ] || run ~/claude-of-tanks urban after-urban
[ -f ~/claude-of-tanks/shots/destruct-r1/perf/after-railyard.json ] || run ~/claude-of-tanks railyard after-railyard
# pristine BEFORE for railyard from the worktree
node -e "const j=require(process.env.HOME+'/claude-of-tanks/shots/destruct-r1/perf/before-railyard.json'); process.exit(j.note && j.note.includes('retry') ? 0 : 1)" 2>/dev/null \
  || run /tmp/cot-destruct-before railyard before-railyard
echo "RETRIES-COMPLETE"
