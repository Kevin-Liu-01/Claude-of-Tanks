#!/bin/zsh
# physics lane: receipts for the lazy wreck driver on the merged tree (217 + 0474dcd55), one worker at nice 19.
SP=/private/tmp/claude-501/-Users-kevinliu--codex-worktrees-cot-restore-1049-visuals-20260911/6412983f-6279-4f04-92ea-e3d886747505/scratchpad
OUT=$SP/physics/rcpt-lazy
cd $SP/physics/wt-edge || exit 2
echo "tree $(git rev-parse --short HEAD) start $(date +%T)" > $OUT/summary.txt
for f in $(cat $OUT/list.txt); do
  [ -f "$f" ] || { echo "MISSING $f" >> $OUT/summary.txt; continue; }
  s=$(date +%s)
  nice -n 19 node "$f" > $OUT/$(basename $f).log 2>&1; rc=$?
  if [ $rc -eq 0 ]; then st=PASS; else st="FAIL($rc)"; fi
  echo "$st $f $(( $(date +%s) - s ))s" >> $OUT/summary.txt
done
echo "done $(date +%T)" >> $OUT/summary.txt
