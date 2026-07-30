# T-90A Vladimir (`t90a_vladimir`)

**Exact variant modeled:** T-90A (post-2006 ESSA fit) — cast turret,
Kontakt-5, Shtora dazzlers, commander's roof cluster and tall antenna/met
mast; visually distinguished from `t90a` by this GLB's heavier roof
furniture and rear-deck stowage. Same 2A46M-2 gun family.

## Corroborated dimensions

| Measure | Value | Sources (2+ independent) |
|---|---|---|
| Hull length | 6.86 m | en.wikipedia.org/wiki/T-90; army-guide.com/eng/product114.html |
| Overall length (gun forward) | 9.53–9.63 m | en.wikipedia.org/wiki/T-90; armyrecognition T-90A datasheet |
| Width | 3.78 m over skirts | en.wikipedia.org/wiki/T-90 |
| Height | 2.22 m roof (masts higher) | en.wikipedia.org/wiki/T-90 |
| Gun | 2A46M-2 125 mm, tube 6.0 m, mid evacuator, sleeve | en.wikipedia.org/wiki/2A46_125_mm_gun |
| Road wheels | 6, rear sprocket, skirted | en.wikipedia.org/wiki/T-90 |

## Identity cues

Same family cues as `t90a` (see that packet): K-5 cheek wedges, Shtora eyes,
low wide cast dome, 6 wheels, drums + log at rear. This oracle adds a tall
mast group at the turret rear-left and heavy bustle/rear-deck stowage.

## Reference links (links only)

1. https://en.wikipedia.org/wiki/T-90 — dims (CC BY-SA text)
2. https://www.army-guide.com/eng/product114.html — data sheet
3. https://en.wikipedia.org/wiki/Kontakt-5 — wedge ERA layout

## Local GLB oracle notes

Path: `public/models/tanks/community/recovered/t90a_vladimir.glb`
Width-normalized (3.78 m) probe measurements:
- whole 3.78 × 3.81 × 10.41; hull z −5.21…+2.63 (7.83), glacis nose ≈ 1.25,
  deck ≈ 1.5–1.6, rear stowage 1.93–1.97 (z −4.7…−5.0).
- IMPORTANT oracle defect: hull node carries LOD copies of the turret —
  hull-mask humps at z −0.8 (y→2.45) and z −2.1…−2.8 (y→2.2). The ref's
  "hull" silhouette therefore includes a dome-shaped blob under the real
  turret; its upper mask has a matching hole.
- turret (desirefx_me_001): dome z −1.22…+0.68, halfW→1.74, roof 2.8–3.0,
  bustle z −1.7…−2.4 (halfW ≈ 1.0), mast to 3.81 at z −2.17; contains gun.
- gun: muzzle 5.21 → overhang beyond hull nose 2.58; dome center ≈ −0.27
  (≈ +1.02 forward of hull center).

## Mismatch log

| Date | total | minView | hull | turret | gun | tracks | change |
|---|---|---|---|---|---|---|---|
| 2026-07-30 | 64.6 | 72.2 | 80 | 36 | 26 | 77 | baseline (shared SOVIET template) |
| 2026-07-30 | 75.2 | 77.5 | 82 | 50 | 84 | 79 | standalone rebuild: zC -1.29, hull 7.83, dome 3.44x2.90 h1.18 + roof cap, basket+met mast, hull-bucket filler matching oracle LOD ghosts, drums/bins, floaty-track botY |
| 2026-07-30 r2 | 76.3 | — | 83 | 51 | 84 | 79 | shaded r2: K-5 clamshell, Shtora eyes, crowded roof cluster + pano drum, crate-rack rails seated, decal moved off mantlet, drums/bins low, skirt armor course, dark skirt lip |
