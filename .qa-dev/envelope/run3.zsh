#!/bin/zsh
setopt NO_BG_NICE
cd /Users/kevinliu/claude-of-tanks/.claude/worktrees/youthful-hypatia-16d3b5
O=~/cot-lanes/christian2-262-evidence/envelope-census; : > $O/inflate.out
chunk() { perl -e 'alarm 5400; exec @ARGV' node --max-old-space-size=4096 .qa-dev/census/inflate-census.mjs $1 $2 > $O/inflate-$1.jsonl 2> $O/inflate-$1.err; echo "chunk $1 rc=$?" >> $O/inflate.out; }
chunk 0 74 & chunk 74 148 & chunk 148 221 &
wait
echo INFLATE-DONE >> $O/inflate.out
