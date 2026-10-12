#!/bin/zsh
# physics lane: when physics-pop1-f218b lands with every case filmed, pack pop-218 (the send stays with the lane agent).
SP=/private/tmp/claude-501/-Users-kevinliu--codex-worktrees-cot-restore-1049-visuals-20260911/6412983f-6279-4f04-92ea-e3d886747505/scratchpad
W=$SP/physics/wave
LOG=$W/autopack-218.log
echo "waiting for pop1-f218b $(date +%T)" >> $LOG
until grep -q "cases missing" $W/strips/pop1-f218b.done 2>/dev/null || [ -f $SP/fifo2/jobs/done/physics-pop1-f218b.json ]; do sleep 60; done
sleep 5
cat $W/strips/pop1-f218b.done >> $LOG 2>/dev/null
if grep -q "cases missing 0" $W/strips/pop1-f218b.done 2>/dev/null; then
  nice -n 15 python3 $W/pack-218.py >> $LOG 2>&1 && echo "PACKED $(date +%T)" >> $LOG || echo "PACK FAILED $(date +%T)" >> $LOG
else
  echo "B ARM FAILED (see fifo2/logs/physics-pop1-f218b.log) $(date +%T)" >> $LOG
fi
