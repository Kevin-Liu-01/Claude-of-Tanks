#!/usr/bin/env bash
# Bake the scout-gen2 candidate STLs into playable GLBs (see
# tools/build_gen2_tanks.py for the per-tank manifest).
#
# LICENSE-CLASS OUTPUT SPLIT (docs/ATTRIBUTION.md, gen2 section):
#   * CC BY / CC BY-SA candidates ship publicly ->
#       public/models/tanks/community/<file>.glb  (author-suffixed names)
#   * CC BY-NC-SA (bergman) + the t84 effective-NC-SA remix stay LOCAL-ONLY ->
#       public/models/tanks/community/recovered/<id>.glb  (stripped from
#       public builds by tools/strip-nc-assets.mjs)
#
# Usage: tools/build_gen2_tanks.sh [id ...]   (default: all)
#        FORCE=1 tools/build_gen2_tanks.sh    (rebuild existing outputs)
#        RENDER=1 ...                         (write check renders to
#                                              shots/gen2-bake/)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/public/models/tanks/candidates-gen2"
COMMUNITY="$ROOT/public/models/tanks/community"
RECOVERED="$COMMUNITY/recovered"
BLENDER="/Applications/Blender.app/Contents/MacOS/Blender"
RENDER_DIR="$ROOT/shots/gen2-bake"

out_for() {
  case "$1" in
    t54|t80|t80b|t80bv|t84) echo "$RECOVERED/$1.glb" ;;   # NC quarantine
    t44)         echo "$COMMUNITY/t44_foxygamer.glb" ;;
    m48)         echo "$COMMUNITY/m48a5_atmodeler.glb" ;;
    m60a2)       echo "$COMMUNITY/m60a2_ahab.glb" ;;
    amx30)       echo "$COMMUNITY/amx30b_ahab.glb" ;;
    amx30b2)     echo "$COMMUNITY/amx30b2_ahab.glb" ;;
    type59)      echo "$COMMUNITY/type69_lasttriarius.glb" ;;
    vickers_mk1) echo "$COMMUNITY/vickers_mk1_jack.glb" ;;
    *) echo ""; return 1 ;;
  esac
}

ALL=(t54 t44 t80 t80b t80bv amx30 amx30b2 m48 m60a2 type59 t84 vickers_mk1)
IDS=("$@")
if [[ ${#IDS[@]} -eq 0 ]]; then IDS=("${ALL[@]}"); fi

for id in "${IDS[@]}"; do
  out="$(out_for "$id")" || { echo "unknown id $id" >&2; exit 1; }
  if [[ "${FORCE:-0}" != "1" && -s "$out" ]]; then
    echo "skip existing $id -> ${out#$ROOT/}"
    continue
  fi
  extra=()
  if [[ "${RENDER:-0}" == "1" ]]; then extra+=(--render "$RENDER_DIR"); fi
  "$BLENDER" -b --python "$ROOT/tools/build_gen2_tanks.py" -- \
    "$id" "$SRC" "$out" "${extra[@]}"
done

echo "gen2 bake complete"
