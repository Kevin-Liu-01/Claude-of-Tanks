#!/bin/zsh
# tools/tmp-ai-r7-perfwait.sh — wait for a quiet-ish window (load1 < 14 and
# < 6 busy headless chromiums), then run the ai-r7 AFTER perf pair + the
# sim-cost A/B. Logs to scratchpad. Gives up after MAX_MIN minutes.
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh"
cd /Users/kevinliu/claude-of-tanks || exit 1
SCRATCH="/private/tmp/claude-501/-Users-kevinliu/1f4a2c2a-8139-4172-b5ea-dd578fb917a3/scratchpad"
MAX_MIN=${1:-90}
START=$(date +%s)
while true; do
  LOAD1=$(sysctl -n vm.loadavg | awk '{print $2}' | cut -d. -f1)
  CHROMES=$(ps aux | grep -cE "[C]hromium Helper \(Renderer\)|[c]hrome-headless")
  NOW=$(date +%s)
  ELAPSED=$(( (NOW - START) / 60 ))
  echo "$(date '+%H:%M:%S') load1=$LOAD1 chromes=$CHROMES elapsed=${ELAPSED}m"
  if [ "$LOAD1" -lt 14 ]; then
    echo "quiet-ish window — running after-perf pair"
    node tools/perfprobe.mjs --seconds 60 --dsf 1 --note ai-r7-after-7v7 --no-trend \
      --roster kv2,jagdtiger,tiger2,object279,is7,t30,t95,sturmtiger,jpz_e100,is6b,is3,is2,tiger1 \
      --out docs/perf-ai-r7-after-dsf1.json > "$SCRATCH/perf-after-dsf1.log" 2>&1
    node tools/perfprobe.mjs --seconds 60 --dsf 2 --note ai-r7-after-7v7 --no-trend \
      --roster kv2,jagdtiger,tiger2,object279,is7,t30,t95,sturmtiger,jpz_e100,is6b,is3,is2,tiger1 \
      --out docs/perf-ai-r7-after-dsf2.json > "$SCRATCH/perf-after-dsf2.log" 2>&1
    node tools/tmp-ai-r7-simcost.mjs > "$SCRATCH/simcost.log" 2>&1
    echo "done"
    exit 0
  fi
  if [ "$ELAPSED" -ge "$MAX_MIN" ]; then
    echo "no quiet window inside ${MAX_MIN}m — running contended anyway (stamps will say so)"
    node tools/perfprobe.mjs --seconds 60 --dsf 1 --note ai-r7-after-7v7-contended --no-trend \
      --roster kv2,jagdtiger,tiger2,object279,is7,t30,t95,sturmtiger,jpz_e100,is6b,is3,is2,tiger1 \
      --out docs/perf-ai-r7-after-dsf1.json > "$SCRATCH/perf-after-dsf1.log" 2>&1
    node tools/perfprobe.mjs --seconds 60 --dsf 2 --note ai-r7-after-7v7-contended --no-trend \
      --roster kv2,jagdtiger,tiger2,object279,is7,t30,t95,sturmtiger,jpz_e100,is6b,is3,is2,tiger1 \
      --out docs/perf-ai-r7-after-dsf2.json > "$SCRATCH/perf-after-dsf2.log" 2>&1
    node tools/tmp-ai-r7-simcost.mjs > "$SCRATCH/simcost.log" 2>&1
    exit 0
  fi
  sleep 120
done
