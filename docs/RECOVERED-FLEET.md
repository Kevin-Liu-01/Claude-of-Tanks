# Recovered fleet completion — 2026-07-29

## Outcome

The private/local roster now contains **91 playable vehicles**, including **42
new recovered-drop entries**. All 43 sourced targets exercised by the live
garage probe load, swap, render, normalize to their vehicle specs, and remain
free of console errors (174 assertions). Five icons were generated for every
new entry.

The recovered models are local-only. Their licenses are NC/ND or were not
preserved well enough to clear redistribution. They load through `npx vite`
and `npm run build:private`; `npm run build` / `npm run build:public` omit their
specs, GLBs, and derivative icons.

## New playable entries

- Explicit pending drops: `m1a2_tejas`, `abramsx`.
- Direct recovered fleet: `challenger1`, `chieftain5`, `fv510`,
  `leo2_revolution`, `leo2a5`, `leo2a7v`, `m1a1ha`, `m1a2_sepv2`, `m60a1`,
  `pt91m`, `merkava1b`, `merkava2b`, `merkava2d`, `merkava3b`, `merkava3c`,
  `merkava3d`, `merkava4b`, `t62mv1`, `t64bv1`, `t72b_1987`, `t72b3m`,
  `t72bu`, `t90sm`, `type90`, `t90a_vladimir`.
- m_bergman second pass: `is3_bergman`, `isu152`, `isu122s`, `centurion3`,
  `centurion5`, `comet`, `challenger_cruiser`, `charioteer`, `leopard2_proto`,
  `m1a1_aim`, `m46_patton`, `m47_patton`, `m26_pershing`, `m45_patton`,
  `m60a3`.

Tejas's M1A2 is retained as a separate local variant; the distribution-safe
dannzjs M1A2 remains the flagship after the visual comparison. Folder-level
duplicates of already integrated Ariete, Leclerc, KF51, Leopard 2A4, T-72B3,
T-80U, T-90A/M, Type 10, Merkava 4, M1A1, and M1A2 families remain in the
owner's recovered source area and were not turned into duplicate carousel rows.

## Asset processing

- `tools/process_tank_asset.py` normalizes FBX/OBJ/GLB inputs, orientation,
  transforms, materials, texture budget, and triangle count.
- `tools/build_recovered_fleet.sh` reproducibly builds the 25 direct assets.
- `tools/process_stl_tank.py` assembles print hull/turret STLs into articulated
  Y-up GLBs.
- `tools/build_bergman_tanks.sh` reproducibly builds 14 distinct m_bergman
  vehicle GLBs; the M60A3 gameplay row honestly reuses the recovered M60A1.

Technical rejection: `1-100 M60A3 complex-1.STL` is an M60 machine-gun
receiver, not an M60A3 tank. The false generated GLB was removed; the owner's
source archive was not changed. Part 2 of the m_bergman pack is not present in
the drop folder and therefore could not be mined.

The handoff's external URL list is an acquisition queue, not local source
material. URL-only models that were not present in the recovered folder were
not fabricated or silently claimed as integrated.

## Other completed handoff work

- Fixed the Merkava floating procedural gun by hiding every pre-swap
  procedural render node, including nested barrel/mantlet meshes.
- Activated and gated the garage showroom orbit; drag, reset, selection, and
  battle/garage transitions pass 11 focused assertions.
- Added caliber-scaled recoil and trauma, distinct penetration/ricochet/nonpen
  sounds, reload-ready cue, stronger engine/throttle response, and scaled
  incoming-damage feedback.
- Improved hit-marker contrast, damage-label bounds, sniper foliage promotion,
  texture anisotropy, and non-hard AI long-range spread.
- Added articulation-aware procedural shadow proxies and a continuous
  sub-pixel far-grass taper to keep the enlarged roster under the frozen
  performance geometry budget without changing close grass or visible tank
  detail.

## Verification

| Gate | Result |
|---|---|
| Simulation | 28 movement checks, 233 combat assertions, 99 spotting checks — pass |
| Controls | 38/38 — pass |
| Garage camera | 11/11 — pass |
| Recovered roster | 174/174 across 43 sourced targets — pass |
| Screenshots | All 16 contract views captured with zero page errors; final player/sniper/procedural-shadow views reviewed |
| Feel probe | 5/5 fire chains; muzzle/recoil/trauma/reload cue 100%; 0–30 km/h 2.26 s; brake 0.89 s |
| Gunnery | 6/6 eligible settled shots hit; 100% vs 80% floor; return-fire gates pass |
| DSF 1, 60 s | 88.5 median fps, 75.2 p5, 15.0 ms p99, 559 max calls, 6.96M median triangles, 372.2 MB textures |
| DSF 2, 60 s | 88.5 median fps, 74.6 p5, 15.1 ms p99, 556 max calls, 6.89M median triangles, 372.2 MB textures |
| Production-safe build | Pass; recovered local-only model/icon trees stripped |

Both performance runs meet every numeric budget. The harness refused the
formal certification stamp because an unrelated interactive browser GPU
process exceeded its quiet-machine threshold (31–37% vs 15%); the reports
retain that caveat in `docs/perf-final-dsf1.json` and
`docs/perf-final-dsf2.json`.

## Honest remaining gap

The roster and systems are substantially broader, but the procedural vehicles
and environment still read as polished stylized work rather than current AAA
World of Tanks art. The independent multi-agent blind judgment described by
`docs/agents/final-judgment.spec.js` was not executed: that spec requires its
own orchestration runtime, independent evaluators, and a dedicated commit.
This document records implementation acceptance, not a substitute panel score.
