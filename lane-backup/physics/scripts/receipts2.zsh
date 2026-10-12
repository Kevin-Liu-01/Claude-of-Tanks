#!/bin/zsh
# physics lane: the receipts reaching the changed modules, one at a time at nice 15, each with its own log and a summary
setopt NO_BG_NICE
SP=/private/tmp/claude-501/-Users-kevinliu--codex-worktrees-cot-restore-1049-visuals-20260911/6412983f-6279-4f04-92ea-e3d886747505/scratchpad
OUT=$SP/physics/rcpt
mkdir -p $OUT
cd $SP/physics/wt
echo "start $(date +%T) $(git rev-parse --short HEAD) dirty $(git status --porcelain | grep -v '^??' | wc -l | tr -d ' ')" > $OUT/summary.txt
for F in $(cat $SP/physics/receipt-list.txt); do
  name=${F//\//__}
  start=$(date +%s)
  COT_SELFTEST_CACHE=0 nice -n 15 node $F > $OUT/$name.log 2>&1 < /dev/null; rc=$?
  echo "$([ $rc -eq 0 ] && echo PASS || echo FAIL) $F rc=$rc $(( $(date +%s) - start ))s" >> $OUT/summary.txt
done
echo "done $(date +%T)" >> $OUT/summary.txt
