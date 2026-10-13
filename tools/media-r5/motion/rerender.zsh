#!/bin/zsh
# Re-render films without re-cutting them (2026-10-12: the stat cards synced to src/productStats.ts after the round-14
# re-cut; recut.zsh ends here too): each film's current render is kept as renders/<film>-<MMDD-HHMM of its render>.mp4
# (a clone, so no extra disk), the stat cards are synced (film-stats-sync.mjs), and the film renders again under the
# shared capture lock (../with-capture-lock.mjs) on the hardware encoder.
#   zsh tools/media-r5/motion/rerender.zsh <film...>
cd ${0:A:h}/../../.. || exit 1
(( $# )) || { echo "usage: zsh tools/media-r5/motion/rerender.zsh <film...>"; exit 1; }
for film in "$@"; do
  F=shots/media-r5/motion/$film
  if [[ -f $F/renders/$film.mp4 ]]; then
    d=$(stat -f '%Sm' -t '%m%d-%H%M' $F/renders/$film.mp4)
    [[ -f $F/renders/$film-$d.mp4 ]] || cp -c $F/renders/$film.mp4 $F/renders/$film-$d.mp4
    echo "$film: kept the previous render as $film-$d.mp4"
  fi
  node tools/media-r5/motion/film-stats-sync.mjs $film || exit 1
  FFMPEG_ENCODE_TIMEOUT_MS=2400000 node tools/media-r5/with-capture-lock.mjs node tools/media-r5/motion/render.mjs $film --gpu || exit 1
  ls -la $F/renders/$film.mp4 | awk '{print $5, $6, $7, $8}'
done
