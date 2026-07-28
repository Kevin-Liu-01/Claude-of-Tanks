# Candidate: Abrams M1A2 SEPv3 (WINNER for roster M1A2 Abrams SEPv3)

- Author: dannzjs (https://sketchfab.com/dannzjs) — vetted: prolific general
  modeler (cars, aircraft, houses), no game-rip indicators, original material
  naming, no engine texture formats.
- Source page (license verified live 2026-07-27): 
  https://sketchfab.com/3d-models/abrams-m1a2-sepv3-eb6f5560198740269507e9948376414c
- License: CC-BY-4.0 (see license.txt — Sketchfab's bundled license file — and
  LICENSE-RECORD-sketchfab-api.json, the live API response).
- Obtained from public GitHub mirror (no auth): 
  https://github.com/DhruvBhargava007/Morv_AI branch `Dhruv`,
  `frontend/public/models/abrams_m1a2_sepv3/` (Sketchfab download bundle with
  license.txt intact; byte-identical bundle layout).
- Required attribution line (from license.txt):
  This work is based on "Abrams M1A2 SEPv3"
  (https://sketchfab.com/3d-models/abrams-m1a2-sepv3-eb6f5560198740269507e9948376414c)
  by dannzjs (https://sketchfab.com/dannzjs) licensed under CC-BY-4.0.

## Geometry / integration notes (verified by standalone renders)

- glTF Y-up, gun points +Z, 256.8k tris, ~8 m long once scaled (raw bbox
  z -4.0..+4.0, y 0..~2.6 plus antennas to 4.37).
- Flat OBJ-derived hierarchy: 29 meshes named Object_2..Object_30 under
  `Tank_01_OBJ...` group, split by material. Verified partition:
  - GUN (elevates): Object_3, Object_13  (mantlet + barrel, z 0.48..4.0)
  - TURRET (yaws, incl. antennas/CROWS/bustle): Object_18 (turret roof,
    MainMetal_ROT — use its bbox center as yaw pivot, approx z=-0.98),
    Object_4, Object_6, Object_16, Object_17, Object_23, Object_26, Object_28
  - HULL: everything else (Object_2, 5, 7..12, 14, 15, 19..22, 24, 25, 27,
    29, 30)
  - Proof renders: RENDER-turret-rotated-40deg.png (clean 40° yaw, no seams),
    plus turret-only / hull-only isolation renders in the hunt log.
- Textures: 38 PNGs, ~160 MB raw (several 16 MP baseColor maps) — MUST be
  downscaled/recompressed (1–2k, jpg/webp/ktx2) before shipping; also consider
  mesh decimation (256k tris vs procedural ~5k).
- The `D*`-prefixed materials (DMachWheels, DMainMetal_*) are small detail/dup
  meshes, all assigned above; material "material" = CROWS RWS.
