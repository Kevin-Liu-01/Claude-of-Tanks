#!/bin/zsh
# One part of the physics turret-pop wave: both arms in one run on the pinned harness (fx clock pinned, lens flare off).
#   zsh pop-part.zsh <A root> <B root> <cases> <out dir> <done file>
SP=/private/tmp/claude-501/-Users-kevinliu--codex-worktrees-cot-restore-1049-visuals-20260911/6412983f-6279-4f04-92ea-e3d886747505/scratchpad
cd $SP/physics/wt || exit 2
echo "$4 $3 A $(head -c 9 $1/COMMIT) B $(head -c 9 $2/COMMIT) $(date +%T)" >> $5
FX_STRIPS_NO_LENSFLARE=1 node .qa-dev/fx-strips-pin.mjs --roots=$1,$2 --labels=A,B --map=verdant \
  --scenes=$SP/physics/wave/pop-scenes.mjs --cases=$3 --hold-cap-ms=900000 --out=$4
echo "$3 exit $? $(date +%T)" >> $5
