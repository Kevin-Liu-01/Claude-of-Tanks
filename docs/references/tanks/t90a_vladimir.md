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

r3 (shaded-parity r2 items): 76.3 → 76.5. K-5 clamshell wedges re-seated on the computed
dome skin with welded end caps (the r2 buried end-plate sliver was the critique's "red
thread from the right cheek"); turret number decal re-seated on the skin (was 9 cm off,
edge-on sliver); Shtora eyes now read as paired dark housings w/ glass; evacuator owns a
0.58 m sleeve gap w/ dark rings; skirts fender-lip→axle (wheels visible), rollers lowered
— the fender-line rust band in turntable frames 1–3 is gone (root cause: return-run
supports rode above the skirt top).

r4 FROM-SCRATCH rebuild (2026-07-31, profiles/t90a_vladimir.json): 76.5 -> 79.7 (H84->86
T51->63 G86->83 R79->84, minView 79.7). Lofted hull with the print's full-width hull-parented
stowage STACK (top 2.26 authored, z -2.84..-0.94) and overhanging tail drum rack (-4.5..-5.35)
authored as strapped deck cargo; dome re-lathed to the measured low crown (2.32) under the
2.9-3.1 roof cluster + tall left/right bin stacks; met mast 3.81 at (-0.24, -2.25); tube to the
measured axis 1.90 / muzzle 5.20. WHAT THE CURVES REVEALED: the print floats its running gear
~0.2 above ground (front flaps set the y-floor) — gear re-seated at botY 0.15; the oracle also
carries a fender-line LOD copy inside its Turret node (upper-mask strip along the whole hull)
— NOT chased (a swinging fender strip is print garbage; documented cap on T). Turntable: zero
floaters; rack/stack read as the print's own boxy silhouette.

## Geometry-gate v6 certification (2026-07-31, gate 8d552c2, dims-first rebuild r5)
Final v6 row: hull 33.3 whole 11.1 turret 18.8 stations 0 dims 100 floaters 100
Dims vs published: ALL <=0.9% - heightM 2.22 hullL 6.91 overall 9.49 width 3.75.
Oracle audit (v6 true cameras, width-normalized frame): worst print in the family: safeScale 1.313; height +28.7% (2.871), hullLength +12.7% (7.733), overall +9.4% (10.428).
Certified oracle-defect caps (component | ceiling | cause):
- wholeCurves | ceiling ~12-25 | the +29%/+13% stature/length defect is unremovable while dims pins the build at published scale; every whole-frame column carries 0.2-0.6 m of print excess
- hullCurves | ceiling ~35-45 | same, hull rows; the print's orphaned domes/LOD copies inside the turret node (pre-existing cap) additionally pollute its turret/hull mask split
- turretCurves | ceiling ~20-30 | orphaned dome/LOD copies in the print's turret node + stature
- stations | ceiling ~0-20 | roof-height topPct 15-25% across most slices from the stature defect
A cap never excuses dims: every dim other than the certified widthM bias is inside the 1% grace (see row above). Build is dims-first: published spec.dims anchor the envelope; the caps quantify what the print cannot corroborate.

## Geometry-gate v10 round-2 certification (2026-07-31, gate 86d1071+a524818+bfa751f)
Final v10 row: hull 33.3 whole 11.1 turret 8.6 stations 0 dims 100 floaters 100
Dims vs published (all inside the 1% grace -> dims 100): heightM 2.22/2.23 (0.5%) hullLengthM 6.91/6.86 (0.8%) overallLengthM 9.52/9.53 (0.07%) widthM 3.76/3.78 (0.62%)
Oracle re-derivation (TRUE_AXES profile trace, width-normalized, 12% body filter): bodyH 2.860 vs pub 2.23 (+28.3%), bodyLen 7.689 vs 6.86 (+12.1%)
Cap verdict: HOLDS, revised — round-1 claimed +34%; TRUE_AXES re-derivation is +28.3% (v6 tilted cameras inflated it)
A cap never excuses dims: this build measures published spec.dims at 100 with zero floaters across all five articulation poses.
