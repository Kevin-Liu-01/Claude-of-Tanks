#!/bin/bash
# TEMP (b1b3 re-cert critic): resilient sequential critic-render loop.
# One id at a time through the cot-shots FIFO (tmp-tank-critic.mjs tickets
# itself); retries lock-timeout failures until the id's shots are FRESH
# (close-roof.png newer than the stamp file). Max 6 attempts per id.
set -u
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"
cd /Users/kevinliu/claude-of-tanks
STAMP=/tmp/b1b3recert-start.stamp
[ -f $STAMP ] || touch $STAMP
for id in merkava1b merkava3b merkava3c merkava3d; do
  ok=0
  for att in 1 2 3 4 5 6; do
    if [ shots/critic-$id/close-roof.png -nt $STAMP ] 2>/dev/null; then ok=1; echo "[$id] already fresh"; break; fi
    echo "[$id] attempt $att $(date +%H:%M:%S)"
    node tools/tmp-tank-critic.mjs --id=$id 2>&1 | tail -3
    if [ shots/critic-$id/close-roof.png -nt $STAMP ] 2>/dev/null; then ok=1; echo "[$id] FRESH ok"; break; fi
  done
  [ $ok = 1 ] || echo "[$id] GAVE UP after 6 attempts"
done
echo "RENDER LOOP DONE $(date +%H:%M:%S)"
