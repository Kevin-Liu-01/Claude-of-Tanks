#!/bin/zsh
# One arm of a physics turret-pop part on the pinned harness (fx clock pinned, lens flare off), on the runner's slot
# port (pop1-f218's B arm lost port 5461 to another process; pop2-f218's A arm lost its frame to a detach).
#   zsh pop-arm.zsh <root> <label> <cases> <out dir> <done file> <port>
SP=/private/tmp/claude-501/-Users-kevinliu--codex-worktrees-cot-restore-1049-visuals-20260911/6412983f-6279-4f04-92ea-e3d886747505/scratchpad
cd $SP/physics/wt || exit 2
echo "$4 $3 $2 $(head -c 9 $1/COMMIT) port $6 $(date +%T)" >> $5
FX_STRIPS_NO_LENSFLARE=1 node .qa-dev/fx-strips-pin.mjs --roots=$1 --labels=$2 --map=verdant \
  --scenes=$SP/physics/wave/pop-scenes.mjs --cases=$3 --hold-cap-ms=900000 --out=$4 --port=$6
rc=$?
# the harness records a failed arm and still exits 0: every case must have its frames
missing=0
for c in ${(s:,:)3}; do [ -f $4/$2/$c/frames.json ] || missing=$((missing + 1)); done
echo "$3 exit $rc, cases missing $missing $(date +%T)" >> $5
[ $missing -eq 0 ] || exit 3
exit $rc
