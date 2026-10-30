#!/bin/zsh
# wait until base and after world-look files exist for the ids, then compare
W=~/cot-lanes/envelope-honesty-264-evidence/world-look; IDS=$1
ready() { for i in ${(s:,:)IDS}; do [ -f $W/base/$i.json ] && [ -f $W/after/$i.json ] || return 1; done; return 0; }
until ready; do sleep 30; done
node ~/cot-lanes/envelope-honesty-264/.qa-dev/envelope/world-look.mjs --compare $W/base $W/after "$IDS"
