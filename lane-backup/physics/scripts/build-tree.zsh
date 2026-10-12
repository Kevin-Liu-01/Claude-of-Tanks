#!/bin/zsh
# physics lane: build physics/rigid-body's HEAD into roots/<name> through the build1 lock (one build per take, nice 15,
# released on any exit), the dist moved out with its COMMIT.
setopt NO_BG_NICE
SP=/private/tmp/claude-501/-Users-kevinliu--codex-worktrees-cot-restore-1049-visuals-20260911/6412983f-6279-4f04-92ea-e3d886747505/scratchpad
NAME=${1:-b1}
LOG=$SP/physics/build-$NAME.chain.log
cd ${TREE:-$SP/physics/wt} || exit 2
git diff --quiet HEAD || { echo "dirty tree: stop $(date +%T)" >> $LOG; exit 3; }
echo "$NAME waiting for the lock $(date +%T)" >> $LOG
until mkdir $SP/locks/build1 2>/dev/null; do sleep 15; done
trap 'rm -f $SP/locks/build1/owner; rmdir $SP/locks/build1 2>/dev/null' EXIT
echo "physics-$NAME $(date +%H:%M)" > $SP/locks/build1/owner
echo "$NAME build from $(git rev-parse --short HEAD) $(date +%T)" >> $LOG
nice -n 15 npm run build > $SP/physics/build-$NAME.log 2>&1; rc=$?
rm -f $SP/locks/build1/owner; rmdir $SP/locks/build1 2>/dev/null
echo "$NAME build exit $rc, lock released $(date +%T)" >> $LOG
[ $rc -eq 0 ] || exit 4
mkdir -p $SP/physics/roots/$NAME.tmp && mv dist $SP/physics/roots/$NAME.tmp/dist
git rev-parse HEAD > $SP/physics/roots/$NAME.tmp/COMMIT
mv $SP/physics/roots/$NAME.tmp $SP/physics/roots/$NAME
echo "$NAME done $(cat $SP/physics/roots/$NAME/COMMIT) $(date +%T)" >> $LOG
