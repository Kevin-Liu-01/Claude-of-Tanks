# T-90SM (`t90sm`)

**Exact variant modeled:** T-90MS/SM export (UVZ, 2011+) — welded flat-sided
turret with Relikt ERA, large squared REMOVABLE BUSTLE with slat rear,
PNM Sosna-U gunner sight, panoramic commander sight on tall mount, UDP
T05BV-1 RWS. Distinct from T-90A (cast dome) and T-90M (similar but this
oracle is the export MS demonstrator fit).

## Corroborated dimensions

| Measure | Value | Sources (2+ independent) |
|---|---|---|
| Hull length | 6.86 m | en.wikipedia.org/wiki/T-90; globalsecurity.org t-90m-proryv-3 |
| Overall length (gun forward) | 9.53–9.63 m | en.wikipedia.org/wiki/T-90; armyrecognition T-90MS |
| Width | 3.78 m over skirts | en.wikipedia.org/wiki/T-90 |
| Height | 2.23 m roof (sights higher) | en.wikipedia.org/wiki/T-90 |
| Gun | 2A46M-5 125 mm, tube 6.0 m, mid evacuator, sleeve | en.wikipedia.org/wiki/2A46_125_mm_gun |
| Road wheels | 6, rear sprocket, full hard side skirts | en.wikipedia.org/wiki/T-90 |

## Identity cues

- Turret: WELDED flat-sided turret, wide (side stowage panels reach nearly
  full hull width), flat roof carrying the panoramic sight tower + RWS; big
  squared bustle box across the rear with slat; Relikt wedges on cheeks.
- Gun: 2A46M-5 with heavy fat thermal sleeve and mantlet plug.
- Hull: Relikt glacis rows, hard skirts, drums often absent (export demo),
  rear engine deck low.

## Reference links (links only)

1. https://www.globalsecurity.org/military/world/russia/t-90m-proryv-3.htm — MS/M turret identity
2. https://en.wikipedia.org/wiki/T-90 — dims (CC BY-SA)
3. https://www.armyrecognition.com/military-products/army/main-battle-tanks/main-battle-tanks/t-90m-model-2017-mbt-main-battle-tank-technical-data-sheet — turret furniture

## Local GLB oracle notes

Path: `public/models/tanks/community/recovered/t90sm.glb` (misc_a turret /
misc_b gun).
Width-normalized (3.78 m) probe:
- whole 3.78 × 3.15 × 10.55; hull ±3.82 (7.63), deck 1.5–1.6, glacis nose
  1.25–1.38, halfW 1.79–1.89.
- turret: z −2.70…+2.15; bustle z −2.0…−2.7 (halfW ~1.0, roof 2.24); main
  body z −1.3…+1.4, halfW grows frontward 1.18→1.87 (side panels flare),
  roof 2.46–2.60; pano mast spikes 3.05–3.15 at z −0.4…−1.6; mantlet zone
  z 1.7…2.15 halfW 1.06–1.27.
- gun: muzzle 6.73 → overhang beyond hull nose 2.92, axis y ≈ 1.9, fat
  sleeve (box 0.68 wide incl. mantlet).
- rig: fully segmented.

## Mismatch log

| Date | total | minView | hull | turret | gun | tracks | change |
|---|---|---|---|---|---|---|---|
| 2026-07-30 | 72.9 | 77.4 | 81 | 47 | 64 | 87 | baseline (t90m donor + bustle kit) |
| 2026-07-30 | 80.2 | 81.0 | 81 | 75 | 77 | 80 | donor->standalone: hull 7.63, welded-look dome 3.35x3.20 + crown cap + side panels, big squared bustle+slat, pano tower + RWS, 6.38 m fat-sleeved gun |
| 2026-07-30 r2 | 81.8 | — | 84 | 74 | 83 | 81 | shaded r2: WELDED faceted turret (polyTurret + cheek slabs) replaces cast dome, UDP RWS w/ barrel+yoke+sight, bustle slat + top boxes, Relikt cassettes, pano tower, evac |
