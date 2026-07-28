#!/usr/bin/env bash
# blend2glb.sh — convert a .blend file to .glb via headless Blender.
# Usage: tools/blend2glb.sh input.blend output.glb
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "Usage: $0 input.blend output.glb" >&2
  exit 2
fi

IN="$1"
OUT="$2"

if [[ ! -f "$IN" ]]; then
  echo "error: input file not found: $IN" >&2
  exit 1
fi

# Resolve to absolute paths (Blender's cwd may differ).
IN="$(cd "$(dirname "$IN")" && pwd)/$(basename "$IN")"
mkdir -p "$(dirname "$OUT")"
OUT="$(cd "$(dirname "$OUT")" && pwd)/$(basename "$OUT")"

# Locate Blender binary.
BLENDER="${BLENDER:-}"
if [[ -z "$BLENDER" ]]; then
  for cand in \
    /Applications/Blender.app/Contents/MacOS/Blender \
    /opt/homebrew/bin/blender \
    "$(command -v blender || true)"; do
    if [[ -n "$cand" && -x "$cand" ]]; then
      BLENDER="$cand"
      break
    fi
  done
fi
if [[ -z "$BLENDER" ]]; then
  echo "error: Blender not found (set BLENDER=/path/to/blender)" >&2
  exit 1
fi

"$BLENDER" -b "$IN" --python-expr "import bpy; bpy.ops.export_scene.gltf(filepath=r'''$OUT''', export_format='GLB', export_apply=True)"

if [[ ! -s "$OUT" ]]; then
  echo "error: export did not produce $OUT" >&2
  exit 1
fi
echo "wrote $OUT ($(stat -f%z "$OUT") bytes)"
