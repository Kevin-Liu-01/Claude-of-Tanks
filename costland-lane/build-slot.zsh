#!/bin/zsh
# build-slot.zsh <name>: take $SP/locks/build1, run build.zsh <name>, release the slot (python, no rm) even on failure
setopt NO_BG_NICE
SP=/private/tmp/claude-501/-Users-kevinliu--codex-worktrees-cot-restore-1049-visuals-20260911/6412983f-6279-4f04-92ea-e3d886747505/scratchpad
NAME=$1
until mkdir $SP/locks/build1 2>/dev/null; do sleep 15; done
echo "costland $(date +%H:%M) $NAME" > $SP/locks/build1/owner
release() { python3 -c "import os,sys; d=sys.argv[1]; os.path.exists(d+'/owner') and os.remove(d+'/owner'); os.path.isdir(d) and os.rmdir(d)" $SP/locks/build1; }
trap release EXIT INT TERM
echo "slot taken $(date +%T)" >> $SP/costland/builds.log
zsh $SP/costland/build.zsh $NAME
