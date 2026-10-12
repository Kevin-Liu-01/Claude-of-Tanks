#!/bin/zsh
# mkroot.zsh <name> <commit> [branch]: worktree at $SP/costland/<name>; files APFS-cloned from nightsky/roots/c0 then fixed by git;
# node_modules cloned from nightsky/wt (lock == main). No build here (build.zsh).
setopt NO_BG_NICE
SP=/private/tmp/claude-501/-Users-kevinliu--codex-worktrees-cot-restore-1049-visuals-20260911/6412983f-6279-4f04-92ea-e3d886747505/scratchpad
REPO=/Users/kevinliu/.codex/worktrees/cot-restore-1049-visuals-20260911
SRC=$SP/nightsky/roots/c0
NAME=$1; COMMIT=$2; BRANCH=$3; ROOT=$SP/costland/$NAME
[[ -e $ROOT ]] && { echo "exists $ROOT"; exit 1; }
if [[ -n $BRANCH ]]; then git -C $REPO worktree add --no-checkout -b $BRANCH $ROOT $COMMIT || exit 1
else git -C $REPO worktree add --no-checkout --detach $ROOT $COMMIT || exit 1; fi
for e in $SRC/*(D); do
  n=${e:t}
  case $n in (.git|node_modules|dist|BUILD_HEAD|.vite*|.qa-dev) continue;; esac
  cp -cR $e $ROOT/ || exit 1
done
cd $ROOT || exit 1
git reset -q || exit 1
git update-index -q --refresh
git checkout -q -- . || exit 1
git clean -fdq || exit 1
cp -cR $SP/nightsky/wt/node_modules $ROOT/node_modules || exit 1
git status --short | head -5
echo "root $NAME at $(git rev-parse --short HEAD) ready $(date +%T)"
