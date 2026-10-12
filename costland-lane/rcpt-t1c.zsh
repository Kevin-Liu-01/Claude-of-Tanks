#!/bin/zsh
setopt NO_BG_NICE
SP=/private/tmp/claude-501/-Users-kevinliu--codex-worktrees-cot-restore-1049-visuals-20260911/6412983f-6279-4f04-92ea-e3d886747505/scratchpad
OUT=$SP/costland/rcpt/rB-t1c; ROOT=$SP/costland/rB
echo "START $(date +%T) head $(git -C $ROOT rev-parse --short HEAD)" > $OUT/summary.txt
for F in tools/visual-census-lock.selftest.mjs src/world/borderFarmsteads.selftest.mjs src/world/horizonRelief.selftest.mjs; do
  $SP/costland/rcpt-one.zsh $ROOT $OUT $F
done
# the GC-isolated worker directly (the wrapper's 120 s spawn timeout fails under load ~30)
start=$(date +%s)
( cd $ROOT && COT_SELFTEST_CACHE=0 nice -n 15 node --expose-gc server/dedicatedWorldCollisionMemory.selftest.mjs > $OUT/dwcm-direct.log 2>&1 < /dev/null ); rc=$?
echo "server/dedicatedWorldCollisionMemory.selftest.mjs (direct --expose-gc worker) rc=$rc $(( $(date +%s) - start ))s" >> $OUT/summary.txt
echo "DONE $(date +%T)" >> $OUT/summary.txt
