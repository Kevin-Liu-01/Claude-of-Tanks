#!/bin/zsh
# Re-cut one film from the newest footage (2026-10-10): its take scenes from the footage's own render receipts
# (film-scenes.mjs), its effects cues re-timed to them (../score/sfx-cues.mjs), its score re-mixed over its generated
# music bed (../score/score.mjs into score-<tag>), the mix into the project (the previous mix stays in its own score
# folder), then rerender.zsh: the previous render kept beside the new one, the stat cards synced, and the render under
# the shared capture lock.
#   zsh tools/media-r5/motion/recut.zsh <film> <tag>
# RENDERS (default renders,renders-r13,renders-r14) names the site fifty's render folders oldest first, a later round's
# takes replacing an earlier one's: sync-footage.mjs links the footage from them and film-scenes.mjs reads the same list.
# A project restored from git (../films/restore.mjs) needs nothing more: the footage is linked here.
cd ${0:A:h}/../../.. || exit 1
setopt pipefail # a failed step stops the re-cut, not only the last line of its output
film=$1; tag=$2
[[ -n $film && -n $tag ]] || { echo "usage: zsh tools/media-r5/motion/recut.zsh <film> <tag>"; exit 1; }
F=shots/media-r5/motion/$film
[[ -f $F/edl.json ]] || { echo "$F has no edl.json: node tools/media-r5/films/restore.mjs $film"; exit 1; }
[[ -f $F/music/music-gen.wav ]] || { echo "$F has no music bed (music/music-gen.wav; restore.mjs decodes it for the films that have one)"; exit 1; }
R=${RENDERS:-renders,renders-r13,renders-r14}
node tools/media-r5/motion/sync-footage.mjs --renders=$R | tail -n 1
node tools/media-r5/motion/film-scenes.mjs $film --renders=$R || exit 1
nice -n 5 node tools/media-r5/score/sfx-cues.mjs $F/edl.json $F/scenes-cut $F/cues.json $F/cues-sfx-$tag.json | tail -n 1 || exit 1
nice -n 5 node tools/media-r5/score/score.mjs --cues=$F/cues-sfx-$tag.json --music=$F/music/music-gen.wav --out=$F/score-$tag | tail -n 1 || exit 1
[[ -f $F/score-$tag/mix.wav ]] || { echo "no mix"; exit 1; }
mkdir -p $F/assets/audio
cp $F/score-$tag/mix.wav $F/assets/audio/mix.wav
zsh tools/media-r5/motion/rerender.zsh $film
