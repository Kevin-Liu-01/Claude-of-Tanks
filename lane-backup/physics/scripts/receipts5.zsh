#!/bin/zsh
# physics lane: receipt worker <n> — claims receipts from the shared list (a claim dir each), skips any already PASSed
setopt NO_BG_NICE
SP=/private/tmp/claude-501/-Users-kevinliu--codex-worktrees-cot-restore-1049-visuals-20260911/6412983f-6279-4f04-92ea-e3d886747505/scratchpad
OUT=$SP/physics/rcpt3
W=$1
mkdir -p $OUT/claims
cd $SP/physics/wt
for F in $(cat $SP/physics/receipt-list3.txt); do
  name=${F//\//__}
  grep -q "^PASS $F " $OUT/summary.txt && continue
  mkdir $OUT/claims/$name 2>/dev/null || continue
  start=$(date +%s)
  COT_SELFTEST_CACHE=0 nice -n 15 node $F > $OUT/$name.log 2>&1 < /dev/null; rc=$?
  echo "$([ $rc -eq 0 ] && echo PASS || echo FAIL) $F rc=$rc $(( $(date +%s) - start ))s w$W" >> $OUT/summary.txt
done
echo "worker $W done $(date +%T)" >> $OUT/summary.txt
