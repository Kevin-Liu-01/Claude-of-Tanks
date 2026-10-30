#!/bin/zsh
# Lane tool (envelope-honesty-264): inside one render hold, the technical diagrams (armorSide, modulesSide, crewSide)
# for each listed batch, one genIcons process per batch (each rewrites its ids' whole manifest rows).
#   .qa-dev/envelope/icons.zsh <log> <id,id,...> [<id,id,...> ...]
setopt NO_BG_NICE
cd ${ROOT:-$HOME/cot-lanes/envelope-honesty-264}
LOG=$1; shift
echo "== icons hold taken $(date +%T)" >> $LOG
rc=0
for IDS in "$@"; do
  echo "-- genIcons $IDS $(date +%T)" >> $LOG
  COT_NAV_TIMEOUT_MS=480000 COT_NAV_RETRIES=0 perl -e 'alarm 1500; exec @ARGV' node --max-old-space-size=4096 tools/genIcons.mjs --views armorSide,modulesSide,crewSide --ids=$IDS >> $LOG 2>&1
  r=$?; echo "-- genIcons rc=$r $(date +%T)" >> $LOG; [ $r -ne 0 ] && rc=$r
done
echo "== ICONS-DONE rc=$rc $(date +%T)" >> $LOG
exit $rc
