#!/usr/bin/env bash
# Mine the tank/assault-gun portion of m_bergman's recovered modern pack.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PACK="$ROOT/public/models/community-candidates/user-drops-recovered/1-100 Modern Tanks and Vehicles (Duplicate) - 4718232 - part 1 of 2/files"
OUT="$ROOT/public/models/tanks/community/recovered"
BLENDER="/Applications/Blender.app/Contents/MacOS/Blender"
TMP_ROOT="$(mktemp -d /tmp/cot-bergman.XXXXXX)"
trap 'rm -rf "$TMP_ROOT"' EXIT
mkdir -p "$OUT"

unpack() {
  local archive="$1"
  local dir="$TMP_ROOT/${archive%.zip}"
  if [[ ! -d "$dir" ]]; then
    mkdir -p "$dir"
    ditto -x -k "$PACK/$archive" "$dir"
  fi
  echo "$dir"
}

part() {
  local archive="$1" hull="$2" turret="$3" output="$4"
  if [[ "${FORCE:-0}" != "1" && -s "$OUT/$output.glb" ]]; then echo "skip $output"; return; fi
  local dir h t
  dir="$(unpack "$archive")"
  h="$(find "$dir" -type f -iname "$hull" -print -quit)"
  t="$(find "$dir" -type f -iname "$turret" -print -quit)"
  "$BLENDER" -b --python "$ROOT/tools/process_stl_tank.py" -- "$OUT/$output.glb" "$h" "$t"
}

fixed() {
  local archive="$1" hull="$2" output="$3"
  if [[ "${FORCE:-0}" != "1" && -s "$OUT/$output.glb" ]]; then echo "skip $output"; return; fi
  local dir h
  dir="$(unpack "$archive")"
  h="$(find "$dir" -type f -iname "$hull" -print -quit)"
  "$BLENDER" -b --python "$ROOT/tools/process_stl_tank.py" -- "$OUT/$output.glb" "$h"
}

part "100_IS-3-1.zip" "1-100 IS-3-1.STL" "1-100 IS-3-turret-1.STL" "bergman_is3"
fixed "100_ISU-152-122.zip" "1-100 ISU-152-11.STL" "isu152"
fixed "100_ISU-152-122.zip" "1-100 ISU-122s-11.STL" "isu122s"
part "100_centurion_35.zip" "1-100 centurion 3-3.STL" "1-100 centurion 3 turret-4.STL" "centurion3"
part "100_centurion_35.zip" "1-100 centurion 5-3.STL" "1-100 centurion 5 turret 105-4.STL" "centurion5"
part "100_comet_challenger_charioteer.zip" "1-100 comet-2.STL" "1-100 comet-turret-1.STL" "comet"
part "100_comet_challenger_charioteer.zip" "1-100 challenger-late-1.STL" "1-100 challenger-turret-1.STL" "challenger_cruiser"
part "100_comet_challenger_charioteer.zip" "1-100 charioteer-VII-2.STL" "1-100 charioteer-VII-turret-2.STL" "charioteer"
part "100_leopard_2-2a5-2a6.zip" "1-100 leopard 2-2.STL" "1-100 leopard 2 turret-2.STL" "leopard2_proto"
part "100_M1A1_AIM_Abrams.zip" "1-100 m1a1 AIM abrams-20.STL" "1-100 m1a1 AIM abrams turret-late-12.STL" "m1a1_aim"
part "100_M46-M47.zip" "1-100 m46-4.STL" "1-100 m46 turret-mg-1.STL" "m46_patton"
part "100_M46-M47.zip" "1-100 m47-3.STL" "1-100 m47 turret late mg 8.STL" "m47_patton"
part "100_m26_pershing-m45.zip" "1-100 pershing-5.STL" "1-100 pershing turret-mg-1.STL" "m26_pershing"
part "100_m26_pershing-m45.zip" "1-100 m45-5.STL" "1-100 m45 turret-mg-1.STL" "m45_patton"
# `1-100 M60A3 complex-1.STL` in the LAV-II archive is an M60 machine-gun
# receiver, not an M60A3 Patton. The roster variant deliberately reuses the
# recovered M60A1 vehicle model; do not convert this misleading filename.

echo "Bergman tank pass complete"
