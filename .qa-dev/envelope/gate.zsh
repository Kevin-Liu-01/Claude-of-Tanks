#!/bin/zsh
# Lane tool (envelope-honesty-264): the targeted gated release check for one batch, with the long capture wait exported.
#   .qa-dev/envelope/gate.zsh <batch> <id,id,...>
setopt NO_BG_NICE
cd ${ROOT:-$HOME/cot-lanes/envelope-honesty-264}
B=$1; IDS=$2
O=$HOME/cot-lanes/envelope-honesty-264-evidence/gate-$B
mkdir -p $O
export COT_SHOTS_LOCK_TIMEOUT_MS=21600000
echo "== gate $B start $(date) head $(git rev-parse --short HEAD) ids=$IDS" >> $O/gate.log
perl -e 'alarm 43200; exec @ARGV' node --max-old-space-size=4096 tools/tank-release-check.mjs --ids=$IDS --gate --lane >> $O/gate.log 2>&1
rc=$?
echo "== GATE-DONE $B rc=$rc $(date)" >> $O/gate.log
