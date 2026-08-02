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

r4 FROM-SCRATCH rebuild (2026-07-31, profiles/t90sm.json): 81.8 -> 83.9 (H84->86 T74->78
G83->90 R81->79, minView 80.7). Lofted hull (deck 1.55, measured glacis break); WELDED
faceted turret kept from r3 but re-proportioned to the measured 3.3 plan + squared bustle
to the measured -2.9 (top 2.20); pano/RWS towers to the measured 3.15 pair; Relikt cassettes
on the prism facets; 2A46M-5 to the measured contour with the MRS bulge at world 5.17..5.29
and muzzle 6.732 (axis 1.912). Shaded pair: both read as the welded-turret T-90SM; my roof
furniture is sparser than the print's cage but the silhouette and bustle now track it.

## Geometry-gate v6 certification (2026-07-31, gate 8d552c2, dims-first rebuild r5)
Final v6 row: hull 40.7 whole 0 turret 37.7 stations 0 dims 86.2 floaters 100
Dims vs published: heightM 2.25 hullL 6.89 overall 9.61 all within grace; width 3.68/3.78 (-2.72%, -13.8 pts) is the certified measurement bias below.
Oracle audit (v6 true cameras, width-normalized frame): height +38.4% (3.086) - the print's dome+towers ride 0.85 over the published envelope; hullLength +7.3%, overall +9.7%.
Certified oracle-defect caps (component | ceiling | cause):
- dims | ceiling ~86 | widthM measurement bias (certified): the gate's plan colSpan reads first/last column CENTERS on the shared 96-column grid, under-reading a full-width envelope by up to one column (~0.10 m). Evidence: this print's own width-normalized reference (bbox == published width by safeScale) self-measures widthM 3.679 vs published 3.78 (-2.7%). A geometrically correct build cannot exceed the same grid's reading (verified by anchor/skirt sweep: measured width invariant at 3.68).
- wholeCurves | ceiling ~0-20 | +38% stature defect vs published-pinned welded roof at 2.25
- stations | ceiling ~0-20 | same stature on all turret slices
- turretCurves | ceiling ~38-50 | print dome vs published welded turret height
A cap never excuses dims: every dim other than the certified widthM bias is inside the 1% grace (see row above). Build is dims-first: published spec.dims anchor the envelope; the caps quantify what the print cannot corroborate.

## Geometry-gate v10 round-2 certification (2026-07-31, gate 86d1071+a524818+bfa751f)
Final v10 row: hull 43 whole 1.1 turret 28.2 stations 0 dims 100 floaters 100
Dims vs published (all inside the 1% grace -> dims 100): heightM 2.25/2.23 (0.78%) hullLengthM 6.89/6.86 (0.39%) overallLengthM 9.58/9.63 (0.53%) widthM 3.78/3.78 (0.07%)
Oracle re-derivation (TRUE_AXES profile trace, width-normalized, 12% body filter): bodyH 3.110 vs pub 2.23 (+39.5%), bodyLen 7.429 vs 6.86 (+8.3%)
Cap verdict: HOLDS — round-1 claim +38.4% re-derives to +39.5%
A cap never excuses dims: this build measures published spec.dims at 100 with zero floaters across all five articulation poses.
FALLEN v6 record: round-1 dims 86.2 was the v6-era width quantization, not a defect - v10 pixel-resolved width reads 3.78/3.78 and dims is 100. The +39.5% stature cap on curves HELD.

## r3 heightM restoration (2026-07-31, post kit-track-round 146d25c)
Kit track round lifted heightM to 2.26 vs published 2.23 (1.28% -> dims 97.8). Turret group
seated 25mm lower (1.55 -> 1.525): dims back to 100. Turret row 25.7->20.1 — far under the
+39.5% stature-cap ceiling either way; the published-dims anchor is the hard requirement.


## r6 ORACLE-TRUST AUDIT (2026-08-01, russia-family dual-gate round)

Width-normalized reference vs published dims: hull len +8.3% (ref body -3.84..+4.0), height +39.5% (sight towers 3.06-3.15 at z -0.5..-1.6 vs pub ceiling 2.28), overall +9.5% (muzzle +6.72).

**Structural findings:** chasis mesh includes plate-like footprint (plan rectangle); towers/stylization dominate. Ref gun axis 1.91, r~0.12.

**Certified caps (gate doctrine):** Tower cap 0.85 m: stations capped ~10-36 (3-5 slices at 25-29% topPct), front_whole ~49, side_turret ~57, side_whole ~69. overallLengthM: ref span 10.54 vs pub 9.63 — muzzle authored 6.04 (cover cap ~5 cols) + rear span lip -3.66. hullLength window -3.32..+3.62 of the ref's 7.7 m.

**Gate state after r6:** hullCurves 31.5 / wholeCurves 0 / turretCurves 31.5 / stations 0 / dims 91.9 / floaters 100. (r6: hull window recentered, towers/bustle/gun reseated to measured absolutes, span lip added.)

Probes: tools/tmp-ru-worldtrace.mjs (absolute-world curve dumps),
tools/tmp-ru-overlay.mjs (registered ref/proc mask diffs),
tools/tmp-ru-ceilings.py (dims-clamped achievability ceilings),
tools/tmp-ru-glbnodes.py (scene-graph/bounds audit — no vertex reads).
Repair queue ask: re-parent baked barrels to gun nodes and strip the
shadow plates from the t-series TurretMesh/hull meshes (mesh-level surgery
beyond the rigid-transform queue); t72bu is unusable as an oracle until then.

## batch-9 ORACLE REPAIR (2026-08-01, tools/repair_oracles.py REPAIRS['t90sm'])

PLATE STRIP by index surgery on 'chasis' prim0 (authored vertex bytes
untouched): 1 discrete component / 111 verts / 117 tris — the audited
plan-rectangle shadow plate (x −1.64..1.61, z −2.30..4.37, 0.15 thin,
riding ABOVE the real deck contour at y 0.89..1.04 world). A 2.5 x 5.0
size floor on the selection keeps the genuine deck greebles in the same
band. Re-runnable from the pristine .bak (2026-08-01); byte-idempotent.

MEASURED EFFECT: mask-neutral — the chasis top profile is unchanged at
every z column (other deck skin tops the same heights), and the batch-9
gate re-run reads identical rows (hull 31.5 / whole 0 / turret 31.5 /
stations 0 / dims 91.9 / floaters 100). The strip is structural hygiene
per the batch-9 queue; the +39.5% tower/stature cap (authored proportions,
out of batch-9 scope) remains the binding ceiling: side_whole 68.7 /
side_turret 57.1 / front 49.2 / stations ~36 (re-derived, unchanged).

## r7 post-batch-9 certification (2026-08-01, deck shadow plate stripped)

Batch-9 stripped the 111-vert deck shadow plate from the chasis mesh; rows
below are vs the repaired oracle. Final r7 row: hull 31.5 / whole 0 /
turret 31.5 / stations 0 / dims 91.9 / floaters 100. Dims: heightM 2.25
(+0.8), hullLen 7.00 (+2.0 — the print's fat tail vs the span-matching
lips, the r5 documented trade), overall 9.65 (+0.2), width 3.78 (+0.1).

CERTIFIED STATURE CAPS (per-column, r7 worldtrace, side_whole):
- welded-roof towers: 21 ref columns top > 2.38 over z -2.18..+0.67, tops
  2.44..3.15 vs published 2.23; legal build ceiling ~2.26 with 3 p95 spike
  columns (the pano head). Owns station topPct 16-45 at slices 1..6 and
  caps side whole/turret ~35-55.
- muzzle: ref tube runs to +6.72 vs the published-overall build's +6.01
  (print +8% long): 6 ref-only muzzle columns cap wholeCurves coverage
  (long-print class; overallLengthM 9.63 sovereign, measured 9.65).
A cap never excuses dims: dims 91.9 >= 90 with floaters 100.

**r7 update (edge-on prism law, docs/GEOMETRY-GATE.md):** loftHull now subdivides at <=0.36 m and full-length fender/shelf/skirt-lip prisms are authored segmented, so station slices see real cross-section faces. State: hullCurves 31.5 / wholeCurves 0 / turretCurves 31.5 / stations 0 / dims 91.9 / floaters 100.


## BATCH-12 VERTEX NORMALIZATION + VERTEX ROUND (2026-08-01, owner ruling b522c34)

Direct vertex analysis is now sanctioned (docs/GEOMETRY-GATE.md "Reference-model
usage"). Toolchain: tools/vertex-extract.mjs (gate-frame vertex measurement:
loader registration + safeScale + flip replicated; triangle-raster silhouettes,
14 gate stations, landmarks, dims replica, orientation + interpenetration
asserts), tools/vertex-normalize.mjs (warp planning, gate-meter plans -> glb
control points), tools/vertex-workorder.mjs (both-model 96-col curves in world
coords), tools/tmp-rv-board.mjs (mandatory turntable evidence ->
shots/russia-vertex/).

**Batch-12 recipe (tools/repair_oracles.py):** continuous piecewise-linear
axis warp in glb world through each node's matrix — positions + normals,
census-guarded, width axis untouched, POSITION min/max rebuilt from referenced
verts, rebuilt from the pristine .bak, byte-idempotent (double-run shasum
5b669d294f2723c527b165a0932b8dd0d85034d9).

Stylization before -> after: height +39.5% (welded towers), hull mask +11.0%, overall +9.4% -> height 1%,
hull mask 0%, overall -0.1%, width 0%
(gate-meter plans in tools/vertex-normalize.mjs PLANS['t90sm']).
The stylization-cap certifications of r5-r7 are RETIRED for this print.

**Standing asserts (docs/references/vertex/t90sm.json):** orientation
glacis +z / gun +z / agree True
(descent runs {"runFront": 1.3, "runRear": 0.08}); interpenetration
0 verts (worst dip 0 m outside the r>1.05 ring annulus).

**Gate row after this round:** hull 0 / whole 0 / turret 15.8 / stations 0 / dims 90.4 / floaters 100.
BUILD NOT YET RE-ANCHORED. Tower band landed 2.22-2.26 (p95-legal); the build must author its pano/Sosna inside 2.26.

## VERTEX ROUND r2 — build re-anchor in progress (2026-08-01)

Three passes vs the normalized oracle: span-matching lips DELETED (the mask
now spans published 6.857 itself), hull/turret/gun re-anchored (deck plateau
1.40-1.46, welded roof 2.19-2.26 with the tower zone extended to z -1.96,
bustle 1.92-1.96, gun axis 1.70 / muzzle +6.20), tub narrowed to 1.60 +
segmented fender lips, track pulled behind the skirts (xc 1.42 trackW 0.50),
Relikt wide course moved MID-REAR per the station widths (3.70-3.77 over
z -2.7..-0.7). Gate: 0 -> hull 25.1 / whole 0 / turret 39.2 / stations 48.9 /
dims 98.4 / floaters 100. GATING ROW: front_whole (mean was 8.0% -> improving;
track/skirt/tub bands still proc-deep vs ref 0.87-1.36 at |x| 1.68-1.76 and
ref belly band to |x|~1.0 at bot 0.43). NEXT: front-view band decode (one
workorder --rows=front_whole pass), then side rear-gear ramp (same print-fade
class as t90a), tower plan columns. Board refreshed (orientation asserts
agree; no interpen).

## VERTEX ROUND r2b — passes 4-6 (2026-08-01)

front_whole escaped zero via the corrected digest (the vertical conversion is
now SELF-CALIBRATED against the ground plane — two prior camera-center
conventions each fit only one view; vertex-workorder.mjs closes it for good).
Fixes: tall Relikt course reverted to 0.72 h (side rows vetoed the front
read), track pads behind the skirts (xc 1.38, the pad line extends ~0.04 past
trackW/2), turret flare panels 1.89, prism roof inset 0.78, tower cluster
trimmed. Gate: hull 25.1 -> 51.3 / whole 0 -> 36.5 / turret 39.6 / stations
49.5 / dims 94.8 (heightM 2.27 p95 driver still unresolved — NEXT: find the
+1.65% column owner; likely the pano/RWS ensemble width at 96-col pitch).
Board reviewed: orientation correct; glacis face and Relikt flank read slab-
flat (fitting language next once curves converge).

## VERTEX ROUND r2c (2026-08-01): heightM p95 RESOLVED — the pano stack
(box top 2.22 + dark cyl 2.29) plus the RWS/rear towers together held the
p95 at 2.27; all four shaved 0.02-0.04 -> dims 94.8 -> 98.4 (heightM
+0.8%). Flank flare panels to the ref 1.79 line; trackW 0.50 (pad line
1.67). Gate: min 36.5 -> 37.9 (hull 49.9 / whole 37.9 / turret 39.6 /
stations 50.5 / dims 98.4 / floaters 100). Board reviewed: clean. NEXT
(decoded but NOT yet authored): ref front at |x| 1.72 spans 0.94..1.79 —
the 1.75-1.79 top there is TURRET cheek-cassette content (reaches x 1.85)
NOT hull skirt (side view vetoes tall hull courses, r2b lesson): widen the
turret Relikt cassette reach toward 1.85 and raise skirt yBot toward 0.90;
front |x| 1.85 wants the hull Relikt course y-span 0.575..1.725 — VERIFY
against side first (it vetoed once already); stations 50.5 top rows at the
tower slices; plan_hull 53.5 p95 12.55 (worst plan row — undecoded).

## VERTEX ROUND r6-r7 (2026-08-02): rear-plate decode, roof re-band, cheek seat

37.9 -> 41.7 (hull 49.9->51.2, whole 37.9->41.7, turret 39.6->48.0!!,
stations 50.5->63.5, dims 98.4->100). What moved it:
- HULL REAR (the plan gold mine, 10+ cols x 0.4): the ref rear PLATE is at
  -2.91 (plan center); the -3.38..-3.45 tail is a NARROW rack at |x|
  0.95..1.3 (side band 1.00..1.38 thinning to a 1.11..1.19 sliver at
  -3.45). Loft rear pulled to -2.92 + rack box pair (0.98..1.25, body-
  thick so hullLengthM keeps its -3.40 column: measured 6.83 pre / 100
  after). The old full-width -3.43 loft owned ten 0.43-0.48 errors.
- K-COURSE: heavy panels live ONLY over z -0.88..-2.78 and hang 0.59..1.31
  (front pair DELETED — ref has no 1.88-wide hull content forward of
  -0.88); panels x 1.822 (1.842 read the x-1.9 sliver cols); skirt yBot
  0.94 (ref's shallow front skirts).
- ROOF RE-BAND: prism h 0.78 -> 0.59 (ref front cols +-0.1..0.61 read
  1.99 — the flat 2.18 prism roof was proud over 20 front columns); the
  2.24-2.26 band lives on flank roof boxes at |x| 0.65..1.05 (ref front
  gap cols); tower bodies low (1.94-1.95) with THIN z-spikes at world
  -1.39/-1.94 tops 2.24-2.25 (ref side 1-col spikes); heightM p95 2.24
  vs pub 2.23 -> dims 100.
- BUSTLE: full depth only to |x| 0.91 (ref plan staircase -2.43 center /
  -1.99 @1.0 / -1.31 @1.15 / -1.0 @1.23) — 3 step boxes per side; back
  panel 1.80 wide at -2.42 (its old -2.575 seat was an ONLY-PROC column).
- CHEEK FLARE: side panels x to 1.855 (3 ONLY-REF plan cols at 1.78-1.89)
  seated FORWARD (ref cheek chord at x 1.46: world -0.37..+1.43; mine sat
  0.7 aft) — turret_plan 36.6 -> 48 in one move with the MRS fix;
- MRS bulge moved to world 4.55..4.81 (ref plan front 4.79; it sat at
  5.35..5.61) and r 0.128 so the +-0.16 plan cols read it like the ref's.
Board reviewed (r7): orientation/articulation clean, prism+steps closed
volumes, top-down fill solid, wheels/cupola circular.
NEXT: whole rows now the min (41.7) — side_whole worst at z -2.5..-3.0
(bustle-to-rack transition band) and +2.7..+3.3 (glacis kit vs ref clean
line, t90a treatment); turret_side 60.9 residuals are the drooped-tube
class cols at +2.8..+3.7 (same certified-candidate as t64bv1 — ask the
owner); plan_hull x +-1.2..1.36 rear -2.86 vs my -3.35 (skirt tail; pull
skirt z0 or taper); front x +-1.7 skirt-vs-cassette split still open.
