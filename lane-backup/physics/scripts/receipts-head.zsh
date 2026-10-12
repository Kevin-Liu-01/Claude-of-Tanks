#!/bin/zsh
# physics lane: the turret-reading receipts on wt-edge's head (7420887e2), after the full pass that began on 79c77a94a
setopt NO_BG_NICE
SP=/private/tmp/claude-501/-Users-kevinliu--codex-worktrees-cot-restore-1049-visuals-20260911/6412983f-6279-4f04-92ea-e3d886747505/scratchpad
OUT=$SP/physics/rcpt-edge
cd $SP/physics/wt-edge
echo "head $(git rev-parse --short HEAD) start $(date +%T)" >> $OUT/head-summary.txt
for F in $(cat $SP/physics/edge/head-list.txt); do
  name=${F//\//__}
  start=$(date +%s)
  COT_SELFTEST_CACHE=0 nice -n 19 node --expose-gc $F > $OUT/head-$name.log 2>&1 < /dev/null; rc=$?
  echo "$([ $rc -eq 0 ] && echo PASS || echo FAIL) $F rc=$rc $(( $(date +%s) - start ))s" >> $OUT/head-summary.txt
done
echo "head done $(date +%T)" >> $OUT/head-summary.txt
