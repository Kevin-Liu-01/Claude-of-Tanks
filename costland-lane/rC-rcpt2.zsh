#!/bin/zsh
setopt NO_BG_NICE
SP=/private/tmp/claude-501/-Users-kevinliu--codex-worktrees-cot-restore-1049-visuals-20260911/6412983f-6279-4f04-92ea-e3d886747505/scratchpad
OUT=$SP/costland/rcpt/rC4; mkdir -p $OUT
cd $SP/costland/rC
{ s=$(date +%s); nice -n 15 npm run typecheck > $OUT/typecheck.log 2>&1; echo "typecheck rc=$? $(( $(date +%s)-s ))s"; } >> $OUT/summary.txt
for f in src/engine/vehicleGroundOcclusion.selftest.mjs src/vehicles/runningGearGroundRun.selftest.mjs src/engine/shadeFill.selftest.mjs src/engine/nearVehicleShadowDetail.selftest.mjs src/game/garagePresentationPose.selftest.mjs src/game/garageDressingLifecycle.selftest.mjs src/game/garageDressingFleet.selftest.mjs; do
  s=$(date +%s); COT_SELFTEST_CACHE=0 nice -n 15 node $f > $OUT/${f//\//__}.log 2>&1 < /dev/null; echo "$f rc=$? $(( $(date +%s)-s ))s" >> $OUT/summary.txt
done
echo DONE >> $OUT/summary.txt
