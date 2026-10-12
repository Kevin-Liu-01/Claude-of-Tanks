#!/bin/zsh
setopt NO_BG_NICE
SP=/private/tmp/claude-501/-Users-kevinliu--codex-worktrees-cot-restore-1049-visuals-20260911/6412983f-6279-4f04-92ea-e3d886747505/scratchpad
until grep -q "build rM at 62b2d2455" $SP/costland/builds.log; do sleep 15; done
sleep 20
zsh $SP/costland/build-slot.zsh rC
