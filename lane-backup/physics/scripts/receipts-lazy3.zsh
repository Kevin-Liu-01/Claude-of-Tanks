#!/bin/zsh
# physics lane: re-run the two load-timeout receipts (child spawnSync 180 s cap hit at load 325-409) once load allows.
SP=/private/tmp/claude-501/-Users-kevinliu--codex-worktrees-cot-restore-1049-visuals-20260911/6412983f-6279-4f04-92ea-e3d886747505/scratchpad
OUT=$SP/physics/rcpt-lazy3
cd $SP/physics/wt-edge || exit 2
echo "tree $(git rev-parse --short HEAD) waiting for load < 120 $(date +%T)" > $OUT/summary.txt
until [ "$(sysctl -n vm.loadavg | awk '{print int($2)}')" -lt 120 ]; do sleep 60; done
echo "load $(sysctl -n vm.loadavg) start $(date +%T)" >> $OUT/summary.txt
for f in src/vehicles/eraWholeFitReuse.selftest.mjs src/vehicles/ownedFittingGeometry.selftest.mjs; do
  s=$(date +%s)
  nice -n 15 node "$f" > $OUT/$(basename $f).log 2>&1; rc=$?
  if [ $rc -eq 0 ]; then st=PASS; else st="FAIL($rc)"; fi
  echo "$st $f $(( $(date +%s) - s ))s load $(sysctl -n vm.loadavg)" >> $OUT/summary.txt
done
echo "done $(date +%T)" >> $OUT/summary.txt
