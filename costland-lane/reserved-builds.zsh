#!/bin/zsh
# the coordinator reserved $SP/locks/build1 for costland: build rM then rC, then release (python, no rm), even on failure
setopt NO_BG_NICE
SP=/private/tmp/claude-501/-Users-kevinliu--codex-worktrees-cot-restore-1049-visuals-20260911/6412983f-6279-4f04-92ea-e3d886747505/scratchpad
release() { python3 -c "
import os,sys
sp=sys.argv[1]
for p in (sp+'/locks/build1/owner', sp+'/locks/build1-reserved-costland'):
    if os.path.exists(p): os.remove(p)
if os.path.isdir(sp+'/locks/build1'): os.rmdir(sp+'/locks/build1')
" $SP; echo "released $(date +%T)" >> $SP/costland/builds.log; }
trap release EXIT INT TERM
[ -f $SP/locks/build1-reserved-costland ] || { echo "no reservation"; exit 1; }
echo "reserved slot used $(date +%T)" >> $SP/costland/builds.log
zsh $SP/costland/build.zsh rM
zsh $SP/costland/build.zsh rC
