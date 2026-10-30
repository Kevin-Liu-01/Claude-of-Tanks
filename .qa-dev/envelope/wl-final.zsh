#!/bin/zsh
# wait until base and final world-look files (newer than the given stamp file) exist for the ids, then compare
W=~/cot-lanes/envelope-honesty-264-evidence/world-look; IDS=$1; STAMP=$2
ready() { for i in ${(s:,:)IDS}; do [ -f $W/final/$i.json ] && [ $W/final/$i.json -nt $STAMP ] || return 1; done; return 0; }
until ready; do sleep 30; done
node ~/cot-lanes/envelope-honesty-264/.qa-dev/envelope/world-look.mjs --compare $W/base $W/final "$IDS"
