#!/usr/bin/env bash
# Convert the distinct tank models in user-drops-recovered into web-budget GLBs.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DROPS="$ROOT/public/models/community-candidates/user-drops-recovered"
OUT="$ROOT/public/models/tanks/community/recovered"
BLENDER="/Applications/Blender.app/Contents/MacOS/Blender"
TMP_ROOT="$(mktemp -d /tmp/cot-recovered.XXXXXX)"
trap 'rm -rf "$TMP_ROOT"' EXIT
mkdir -p "$OUT"

convert_zip() {
  local folder="$1" archive="$2" model="$3" output="$4" faces="${5:-120000}"
  if [[ "${FORCE:-0}" != "1" && -s "$OUT/$output.glb" ]]; then
    echo "skip existing $output.glb"
    return 0
  fi
  local tmp="$TMP_ROOT/$output"
  mkdir -p "$tmp"
  # ditto handles the legacy/non-UTF8 filename metadata present in the Mk.3D
  # archive; command-line unzip aborts that otherwise-valid model mid-batch.
  ditto -x -k "$DROPS/$folder/source/$archive" "$tmp"
  local input
  input="$(find "$tmp" -type f -iname "$model" -print -quit)"
  if [[ -z "$input" ]]; then
    echo "missing $model in $archive" >&2
    return 1
  fi
  "$BLENDER" -b --python "$ROOT/tools/process_tank_asset.py" -- \
    "$input" "$OUT/$output.glb" --target-faces "$faces" --max-texture 0 --strip-textures
}

convert_file() {
  local input="$1" output="$2" faces="${3:-120000}"
  if [[ "${FORCE:-0}" != "1" && -s "$OUT/$output.glb" ]]; then
    echo "skip existing $output.glb"
    return 0
  fi
  "$BLENDER" -b --python "$ROOT/tools/process_tank_asset.py" -- \
    "$DROPS/$input" "$OUT/$output.glb" --target-faces "$faces" --max-texture 0 --strip-textures
}

convert_zip "challenger-1-mk3" "Challenger Mk_3.zip" "Challenger Mk.3.obj" "challenger1" 120000
convert_zip "chieftain-mk-5-main-battle-tank" "Chieftain MK-5 Main Battle Tank.zip" "Chieftain MK-5 Main Battle Tank.obj" "chieftain5" 120000
convert_zip "fv510-warrior" "6LOSPOWFFCJEYMMAV6070BPH3.zip" "6LOSPOWFFCJEYMMAV6070BPH3.fbx" "fv510" 90000
convert_zip "leopard-2-mbt-revolution" "Leopard 2 MBT Revolution.zip" "Leopard 2 MBT Revolution.obj" "leo2_revolution" 120000
convert_zip "leopard-2a5" "Leopard 2A5.zip" "Leopard 2A5.obj" "leo2a5" 120000
convert_zip "leopard-2a7v-main-battle-tank" "LEOPARD 2A7V MAIN BATTLE TANK.zip" "LEOPARD 2A7V MAIN BATTLE TANK.obj" "leo2a7v" 140000
convert_zip "m1a1ha-abrams-usa" "m1a1ha_abrams.zip" "m1a1ha_abrams.obj" "m1a1ha" 100000
convert_zip "m1a2-sepv2-abrams-main-battle-tank-dc" "M1A2 SEPV2 Abrams Main Battle Tank DC.zip" "M1A2 SEPV2 Abrams Main Battle Tank DC.obj" "m1a2_sepv2" 130000
convert_zip "m60a1" "m60a1.zip" "m60a1.fbx" "m60a1" 110000
convert_zip "malaysian-pt-91m-pendekar" "pt91m-pendekar.zip" "pt91m-pendekar.fbx" "pt91m" 110000
convert_zip "merkava-mk1b" "Merkava Mk_1B.zip" "Merkava Mk.1B.obj" "merkava1b" 110000
convert_zip "merkava-mk2b" "Merkava Mk_2B.zip" "Merkava Mk.2B.obj" "merkava2b" 110000
convert_zip "merkava-mk2d" "Merkava Mk_2D.zip" "Merkava Mk.2D.obj" "merkava2d" 110000
convert_zip "merkava-mk3b" "Merkava Mk_3B.zip" "Merkava Mk.3B.obj" "merkava3b" 110000
convert_zip "merkava-mk3c" "Merkava Mk_3C.zip" "Merkava Mk.3C.obj" "merkava3c" 110000
convert_zip "merkava-mk3d" "Merkava_Mk_3D.zip" "Merkava_Mk.3D.obj" "merkava3d" 110000
convert_zip "merkava-mk4b" "Merkava Mk_4B.zip" "Merkava Mk.4B.obj" "merkava4b" 120000
convert_zip "t-62mv-1-ussr" "t-62mv-1.zip" "t-62mv-1.fbx" "t62mv1" 100000
convert_zip "t-64bv1-ussr" "t-64bv1_ussr.zip" "t-64bv1_ussr.fbx" "t64bv1" 100000
convert_zip "t-72b-obr-1987-ussr" "t-72b_obr-1987.zip" "t-72b_obr-1987.fbx" "t72b_1987" 100000
convert_zip "t-72b3m-obr-2022" "t-72b3m.zip" "t-72b3m.obj" "t72b3m" 120000
convert_zip "t-72bu-ussr" "t-72bu.zip" "t-72bu.fbx" "t72bu" 100000
convert_zip "t-90sm-main-battle-tank" "T-90SM Main Battle Tank.zip" "T-90SM Main Battle Tank.obj" "t90sm" 120000
convert_zip "type-90-kyu-maru-japan" "type_90_kyu-maru.zip" "type_90_kyu-maru.fbx" "type90" 100000
convert_file "uralvagonzavod-t-90a-vladimir-main-battle-tank/source/Uralvagonzavod T-90A Vladimir Main Battle Tank.fbx" \
  "t90a_vladimir" 120000

echo "Recovered fleet GLBs written to $OUT"
