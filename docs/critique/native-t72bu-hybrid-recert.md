# Native T-72BU hybrid restoration re-certification

Candidate source blob: `21467a5849afdb2d705318dccd9463e9b5105dc0`.

## Provenance and restoration decision

- The playable is entirely repository-authored procedural geometry.
- `/models/tanks/community/recovered/t72bu.glb` is an isolated render and
  measurement oracle. No source vertex, converted array, generated mesh
  payload or runtime GLB node enters the playable.
- The previous stronger authored hull, calibrated 2A46M-4 and native six-wheel
  linked course are preserved. Only the complete rotating package is cleared
  and rebuilt from the repository's lower BU casting, buried protection,
  cupola/NSVT/sight suite and supported rear service packs.
- The hybrid wrapper preserves the original cannon in world space while the
  replacement turret uses its own ring datum. This prevents a turret-pivot
  correction from silently moving or rescaling the graduated gun.

## Quantitative receipt

- Procedural fidelity: **90.08**.
- Required-view floor: **90.00**; every standard view is at least 90.
- Whole silhouette: **92.14**; hull: **93.49**; direct turret: **79.98**;
  gun: **91.41**; native running-gear profile: **93.70**.
- Exact track containment: front/rear smooth band **0/0**; front/rear
  individual shoes **0/0**; blind spots **0**.
- The two glacis K-5 carrier rows were narrowed wholly inside the live track
  lanes. Their visible coverage remains, while the former four-centimetre
  smooth-band contact is removed.

## Ownership, winding and evidence

- Turret-parent audit: **0 stranded, 0 abutting, 0 dangling**.
- Winding: **0 reversed, 0 mixed**. Worst FrontSide/DoubleSide difference is
  **4 px / 0.01%** at rear-left, below any visual or structural threshold.
- Yaw-stranded audit: **0 candidate pixels**.
- Evidence packet: `/tmp/critic-t72bu-native-hybrid-r1`, containing **42 PNGs
  / 42 distinct SHA-256 hashes**.
- Yaw0 to yaw90 is a genuine quarter-turn. Gun/mantlet, complete low casting,
  every protection course, smoke banks, cupolas, sights/periscopes, NSVT,
  antennas and rear turret packs rotate as one seated package.
- Glacis, driver and engine decks, service mast, transom, drums/log, skirts,
  six road wheels and continuous linked course remain fixed. No fused duplicate
  turret mass, stranded fitting, open sheet or unsupported decoration appears.

## Preserve / next family pass

Preserve the stronger hull/gun/course foundation, calibrated hybrid gun datum,
low casting and exact track corridor. The direct-turret score remains a visible
surface-detail refinement debt; improve its cast transitions and station
cadence in place. Do not replace the primary vehicle, flatten it into another
T-72 variant or introduce source geometry.
