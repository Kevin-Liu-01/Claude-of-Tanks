#!/bin/zsh
# rcpt-run.zsh <root> <tag> <listfile> [parallel=2]: run every receipt of the list except the lease-owning browser files
setopt NO_BG_NICE
SP=/private/tmp/claude-501/-Users-kevinliu--codex-worktrees-cot-restore-1049-visuals-20260911/6412983f-6279-4f04-92ea-e3d886747505/scratchpad
ROOT=$1; TAG=$2; LIST=$3; P=${4:-2}
OUT=$SP/costland/rcpt/$TAG; mkdir -p $OUT
grep -v -E '\.browser\.selftest\.mjs$|garage-switch-probe\.selftest\.mjs$' $LIST > $OUT/list.txt
grep -E '\.browser\.selftest\.mjs$|garage-switch-probe\.selftest\.mjs$' $LIST > $OUT/browser.txt
echo "START $(date +%T) $(wc -l < $OUT/list.txt) receipts" >> $OUT/summary.txt
cat $OUT/list.txt | xargs -P $P -I{} zsh $SP/costland/rcpt-one.zsh $ROOT $OUT {}
echo "DONE $(date +%T)" >> $OUT/summary.txt
