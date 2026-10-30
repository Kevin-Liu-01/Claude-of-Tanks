#!/bin/zsh
setopt NO_BG_NICE
cd /Users/kevinliu/claude-of-tanks/.claude/worktrees/youthful-hypatia-16d3b5
O=~/cot-lanes/christian2-262-evidence/envelope-census; mkdir -p $O; : > $O/census.jsonl
N=$(perl -e 'alarm 120; exec @ARGV' node --max-old-space-size=4096 -e "import('./src/vehicles/tankFactory.ts').then(()=>import('./src/vehicles/specs.ts')).then(m=>console.log(m.ALL_TANK_IDS.length))")
echo "ids $N" > $O/census.out
for (( i=0; i<N; i+=25 )); do
  perl -e 'alarm 1800; exec @ARGV' node --max-old-space-size=4096 .qa-dev/census/envelope-census.mjs $i $((i+25)) >> $O/census.jsonl 2>> $O/census.err
  echo "chunk $i rc=$?" >> $O/census.out
done
echo CENSUS-DONE >> $O/census.out
