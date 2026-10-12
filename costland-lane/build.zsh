#!/bin/zsh
# build.zsh <name>: npm run build at nice 15 in $SP/costland/<name>; prune dist/media; write dist/BUILD_HEAD
setopt NO_BG_NICE
SP=/private/tmp/claude-501/-Users-kevinliu--codex-worktrees-cot-restore-1049-visuals-20260911/6412983f-6279-4f04-92ea-e3d886747505/scratchpad
NAME=$1; ROOT=$SP/costland/$NAME
cd $ROOT || exit 1
[[ -e dist ]] && python3 $SP/prune.py $ROOT/dist > /dev/null
VITE_CACHE_DIR=$SP/costland/vite-cache-$NAME nice -n 15 npm run build > $SP/costland/$NAME.build.log 2>&1
rc=$?
[[ -d dist/media ]] && python3 $SP/prune.py $ROOT/dist/media > /dev/null
git rev-parse HEAD > dist/BUILD_HEAD 2>/dev/null
echo "build $NAME at $(git rev-parse --short HEAD) rc=$rc $(date +%T)" | tee -a $SP/costland/builds.log
exit $rc
