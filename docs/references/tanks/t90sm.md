# T-90SM (`t90sm`)

> **CURRENT STATUS (§5.105, 2026-08-10): GRADUATED / RE-FROZEN.** The
> owner-priority complete-redesign record appended below supersedes the
> §5.94 freeze and every older ceiling, record-pending and continuation note
> retained here as history.

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

## VERTEX ROUND r8 (2026-08-02, r9 family round): 41.7 -> 41.8 min; turret 48 -> 63.2, stations 63.5 -> 76.9

Gate: hull 51.2 -> 52.1 / whole 41.7 -> 41.8 / turret 48.0 -> 63.2 /
stations 63.5 -> 76.9 / dims 100 / floaters 100. Sub-rows: side 69-70,
plan 76-78 (was ~54!), FRONT 41.8/52.1 is now the sole binder.
What landed:
- WIDE-COURSE COLUMN FIX (plan monsters 2.1/1.2): the course moved OUT to
  x 1.885/1.855 (split y: lower 0.59..0.94, upper 0.94..1.31, 4 panels
  z c -2.55/-2.08/-1.61/-1.14) — the 1.822 seat missed the +-1.86-1.91
  plan columns entirely; the old -0.30 anchor panel and the z +0.27 width
  stud were the only content there (both read z-forward where the ref is
  rear-only). Width stud now hides INSIDE the course band (z -1.60).
- WEDGE FRONT: polyTurret outline widened — ref welded front is 1.80@|x|
  1.02 / 1.72@1.13 / 1.37@1.48 / 1.15@1.69 (old 0.62/0.14 taper cut the
  cheeks 0.6-0.9 short). Cheek stow panels shrunk to the ref's 0.33-deep
  blobs at z world 0.70..1.12 (their 1.10-deep x-1.898 reach owned the
  plan +-1.9 cols).
- BUSTLE UNDERSIDE rises rearward (ref 1.654@-2.16 -> 1.762@-2.49):
  3-step boxes 1.375/1.60/1.72 bottoms; roof band re-seated: the ref
  carries 2.17-2.25 at z world -0.43..+0.44 (NOT -0.6..-1.5): 2.25 LEFT /
  2.17 RIGHT flank boxes; rear 2.24 z-spike moved to x -0.43..-0.52 and
  the -1.39 spike col re-seated.
- REAR TAIL re-decode (r6 inverted): the -3.43 run is CENTER-carried
  (ref -3.428 at +-0.37..0.83) stepping -3.265@1.04 / -3.02@1.34-1.45 /
  -2.78@1.8; raked rack A/B (bottoms 0.76@-3.03 -> 1.00@-3.25) + the
  1.11..1.19 center sliver bar at -3.43 (rack B = hullLengthM body anchor;
  deleting the old bars had cost overall 9.63 -> 9.48).
- Tube cx +0.024 on the outer segs (muzzle-window columns), r 0.115/0.112.
- Flaps raised to the ref's 0.94..1.36 band; idler 2.90/y.72/r.24 (wrap
  bottom 0.60@3.15 = ref 0.596); stowage trimmed z -2.91..-2.53 top 1.49.
REVERTED THIS ROUND (do not re-try without a mask dump): (a) full-height
0.44..1.76 flank WALL at +-1.85 — ref side_hull tops at those z are the
1.44 deck line; the front_hull 1.73-1.83@+-1.8 reading it targeted remains
UNEXPLAINED (hull 52.1 -> 36.5, reverted to the split course); (b) trackW
0.46 (0.50 restored — front bottoms worsened).
NEXT (front rows 41.8/52.1 bind everything): dump the ref FRONT-view hull
mask as PNG and settle where its 1.73-1.83 band at |x| 1.67..1.86 lives
in z (suspect turret-parity content in the hull node, like the b3m plate
class); front +-1.03-1.13 bottoms (ref 0.33-0.478 vs my track face);
side_whole -1.3 col 2.25-vs-2.06 whole/turret row contradiction (tool
frame question — decode before authoring); muzzle-tip col reads NONE in
the digest despite verts at 6.20 (raster question, coverPct 1.12).

## VERTEX ROUND r10-r11 (2026-08-05, russia TAIL ROUND-2 + §B3 sweep)

Gate trajectory (all official runs): 41.8 -> 47.4 (r10) -> 47.2 x2
IDENTICAL (r10b, hull 51.8 / whole 47.2 / turret 72.7 / stations 80.5 /
dims 92.2 / floaters 100) -> r11 line below. Turret +9.5, stations +3.6.

What landed (fresh workorder + gate-frame mask-run probe,
tools/tmp-ru2-frontruns.mjs — §D diagnosis-only):
- BOW STAIRCASE: ref plan front steps 3.186..3.24 at |x| 0.8..0.95 and
  3.43 at 1.14..1.37 ONLY — old ±1.075 prong pair replaced; tip split
  over the idler wrap (§B4) with a flap bridge (§B2).
- TAIL RE-DECODE (r9c inverted): plan_hull ref rear −2.913 at |x|<=0.61,
  −2.886 at 0.908 — the −3.43 run lives ONLY at |x| 0.69..0.87. Center
  bar deleted, racks at x 0.68..0.865 (22mm col margins), outer step rear
  −3.26, thin 1.11..1.19 sliver to −3.48 (ref side −3.468 col
  [1.193..1.111]). hullLengthM body kept via rack B at −3.43 + corner
  flaps deepened to −3.43 after a dims 91.6 scare (bodyExtent forensics:
  the filter needs col span > 12% of the whole-mask rough height on
  side_whole — thin trays/slivers never carry the ends).
- −1.884 LEFT TAB: plan_turret ONLY-REF err-9 col (ref z 0.963..0.99,
  front cap 1.361) — dark cassette end-block y 1.25..1.42 bracketed to
  the outer stow panel; z tightened to 2px margins after the 0.05 depth
  bled the z-0.88 side col (§C partial-pixel).
- CHEEK STOW SPLIT: main x 1.57..1.735 (top 1.84) + outer 1.74..1.86
  (top 1.765) + lid seam, z world per the ref staircase
  [1.153..0.313]@1.694 / [1.099..0.611]@1.776.
- ROOF-BAND RE-DECODE (overrules r8): the ref 2.25 plateau lives at z
  world −0.97..−1.41 (5 cols) with 2.06..2.09 at −0.43..−0.54 and a
  2.105 front cap at |x| 0.91..0.99. Tall bin narrowed to x 0.70..0.86
  and moved aft; the 2.10 box extended over the −0.43..−0.54 cols.
- BUSTLE PLAN STAIRCASE: ref rear −1.585@−1.125 vs −1.314@+1.152 is one
  symmetric step edge at |x|~1.10 sampled by different grid columns —
  deep box left-full/right-thin, mid step 1.14..1.23 rear −1.33;
  underside floors raised to the ref 1.51..1.53 line; step3 rear pulled
  to world −2.40 + thin tail slat (ref side −2.49 col tops 1.706).
- FRONT FLANK BAND (r11, probe-decoded): the ref deep-skirt bands are
  ASYMMETRIC — left 0.447@−1.674 + 0.404@−1.759..−1.802 + 0.574@−1.845,
  right 0.872@1.685 / 0.946@1.728 / 0.404@1.77 / 0.585@1.813..1.855 with
  a bare 0.893..0.936 sliver at 1.898. Deep rubber sections re-seated to
  [1.758, 1.813] both sides (the r10 1.745 face partial-lit the ±1.717/
  1.728 cols the ref holds at 0.946); skirt band moved to faces
  1.725/1.805 (the ref carries its 0.95..1.29 band into the ±1.717 col);
  course lower panels pulled to [1.81, 1.868] (left to 1.888 — print
  skew) under a thin 0.89..0.94 outer lip at the 1.91 width line.
- TRACK SEAT (r11): ref grounds only to |x| 1.643..1.66 and the belly
  cols ±1.09..1.13 read 0.34..0.478 — xc 1.3835 / trackW 0.44 puts the
  pad line at 1.6435 and the inner edge at 1.1635 (both 2px-clear).
- GEAR: idler 0.78/0.23 (ref front ramp 0.488@3.04 -> 0.759@3.25),
  sprocket −2.42 at y 0.80 (ramp 0.32@−2.28 vs ref 0.298; the 0.84 seat
  poked the sponson floor — clip audit).
- ruDeck periY 1.22 (the deckY+0.05 periscopes topped 1.50 where the ref
  nose line is 1.266); muzzle 4.97 (side z-6.182 col; overall 9.6 ✓).
- §B2 HOLES: standard-check found enclosed top-down cells at (±1.7,
  z 3.02) between the lip-row end and the flap — bow skirt end-caps
  close the ring.
- §B4: flap floor raised to 1.02 over the raised idler wrap (clip audit
  front 249 -> flap-clear).

DIMS residual: hullLengthM 6.72 (−1.98%, −8 class) persisted through the
rack/flap/prong body fixes in r10b; the r11 probe's bodyExtent dump shows
front body ending at the prong-tip col — re-measure after r11; heightM/
overall/width all inside grace.

§B3 mystery-box sweep (owner directive ff50bf5):
| box | verdict | action |
|---|---|---|
| gun-root plug 0.66x0.42x0.28 | bare box at the gun root | kept (mask-priced mantlet mass) + canvas strap relief on the front face plane |
| bow prong pair ±1.075 | bare rectangles on the glacis | rebuilt as the measured 2-step fender staircase + dark face seams |
| tail center bar + 0.42-racks | bare bar, plan-wrong | deleted/re-seated; racks carry end-frame plates |
| corner bins ±1.30 | bare cuboids | lid seams |
| left/right roof boxes | bare (left also mis-seated) | narrowed bin + lid seams + mount bracket |
| rear tower + panel | bare sight tower | lens face + hood lip |
| cheek stow blobs | bare | split panels + lid seam |
| new tab/-1.884 | — | authored as a dark cassette end-block |
| new deep skirts + rear flaps | — | hullRubber (rubber grammar) |
(RWS/pano towers already carried barrel/glass/cyl-head tells; bustle bins
carry turretDetail lids. mg census 0: the UDP RWS is hand-authored,
pre-fittings — migration to KIT.fittings.pintleMG deferred; a blind swap
would reseat this round's tuned side/front columns. NEXT round item.)

Probes: tools/tmp-ru2-frontruns.mjs (front mask-run + sideBody dumps,
scratchpad probe-t90sm.json). LAW BANKED: a column is polluted by ANY
neighbor face within ~9mm of its span edge (front px 3.9mm — the r10
deep panels lit cols 28mm away via their 4mm overlap); check the FULL
column-grid family (whole/hull/turret grids differ) before seating
boundary-critical faces.

r11 gate line x2 IDENTICAL: min 46.9 (hull 52.4 / whole 46.9 / turret
73.0 / stations 81.1 / dims 92.2 / floaters 100). HONEST TRAJECTORY:
41.8 -> 47.4 (r10) -> 47.2 x2 (r10b) -> 46.9 x2 (r11). The r11 front-band
re-seats traded ~even on whole (−0.3) while lifting hull +0.6 / turret
+0.3 / stations +0.6 — BUT r10b carried two §B2 top-down HOLES at (±1.7,
z 3.02) and a §B4 flap-in-wrap clip (audit front 249), both gate-blocking
laws: r11 is the lawful configuration and stands as the round's final
state (+5.1 net). dims 92.2 residual: hullLengthM still reads 6.72
(−1.98%) — the sideBody probe shows the front body column ending at the
prong-tip col; the prong tips carry 15% span yet the measured extent
stays 3.29/3.33-class: the remaining decode (why the 3.36-3.43 tip cols
drop from the curve) is the round's top NEXT item, worth +7.8 dims. The
whole-row binder remains front (46.9): worst residual families are the
±1.68..1.73 transition cols and the certified-class tower/crown cols.
mg census 0 carried with the packet justification above.
Standard-check r11: top-down holes 0 (was 2 at r10b), clip audit 240
front / 376 rear — the flap-in-wrap front clip is gone but the ref-true
track seat (xc 1.3835) pushed more sprocket-wrap voxels into the raked
tub face (198 -> 376): the wrap-vs-sponson class is inherent to the
published-width tub + ref track edge; a real fix re-derives the loft's
rear rake around the wrap (§B1 slope-mass), NEXT-round item.

## VERTEX ROUND r12 — tail round-3 §B1 LOFT REWORK (2026-08-05): 46.9 -> 56.4 x2 (+9.5), dims 100, clip 376 -> 0

Gate trajectory (official runs): 46.9 -> 47.5 -> 50.5 -> 55.8 -> 52.7
(batch-J regression, reverted) -> 55.8 -> FINAL 56.4 x2 IDENTICAL (hull
61.2 / whole 56.4 / turret 72.9 / stations 75.9 / dims 100 / floaters
100). Components before -> after: hull 52.4->61.2, whole 46.9->56.4,
turret 73.0->72.9, stations 81.1->75.9 (re-phase, below), dims 92.2->100.

ORDER DONE-GATES:
1. dims 92.2 -> 100 (hullLengthM -1.98% DECODED): the r11 "why do the
   3.36-3.43 tip cols drop from the curve" mystery is the §D PROBE-FRAME
   FACTOR BAKED INTO AUTHORING — the outer course lip's 1.910 authored
   extent was the widest face, so the harness width-normalization scaled
   EVERY authored coordinate x0.9895: the prong tip authored 3.43 landed
   world 3.394 and lit only 21mm (AA-marginal, never body); the muzzle
   sat 6.135; the r11-decoded ±1.64..1.81 seats all landed ~18mm inboard.
   FIX CLASS (LAW): keep the width-defining face AT the widthAnchor
   (lip pulled 1.910 -> 1.889 extent; anchor 1.890 defines width) so
   scale = 1.0 and authored = world; prong tips extended to 3.465
   (55+ mm window coverage = solid body col). hullLengthM 6.85-6.88
   (0.16-0.32%), heightM 2.24, overall 9.66-9.71, width 3.75-3.78.
2. rear clip-audit 376 -> 0 (§B1 SLOPE-MOTIVATES-THE-MASS): the flat 0.81
   sponson floor buried BOTH wrap crowns in the tub slab. The track-bay
   roof now follows the wraps (t72b3m §B4 profile recipe): sponsonY
   [[-2.92,0.81],[-2.84,1.18],[-2.06,1.18],[-1.78,0.81],[2.52,0.81],
   [2.64,1.15],[3.02,1.15]] — raked lifts, tub face restored at the
   corners (§B2 flank stays closed). Front 240 -> 0: glacis tow-eye tori
   out of the lane (eyeX 0.98 on the ±1.0 lower tub face), fender bridge
   floor 1.075 over the 1.059 wrap arc, flap floor 1.12, headlights
   inboard (hlX 1.02 opt-in — the w*0.44 default seat lands IN the lane
   on wide hulls), sprocket disc rim r 0.263 (the 0.28 rim shared 2cm
   voxel cells with the band shell), corner bins -2.94 (wrap rear edge).
3. §B3: mg census 0 -> 1 — PKT-class pintle (FITTINGS.pintleMG nsvt,
   dark) on the bustle rack pedestal at (0.62, 0.39, -1.35): receiver top
   2.11 rides UNDER the ref's own 2.25 roof plateau (z world -0.97..
   -1.41), barrel drooped -0.18 inside the roofline — inside the ±0.4
   allowance. Hand-authored UDP RWS kept (r11 packet justification
   stands). INCIDENT (honest): the first migration attempt text-matched
   buildT72BU's nsvt (the identical comment block) — t72bu is SKIP-listed;
   REVERTED and verified byte-identical to HEAD before any t72bu build/
   gate ran. §B2: the rack re-decode enclosed a 63-cell pocket at
   (0,-3.16) -> rack tray floor; bow bridges widened base->tip.

TAIL RE-DECODE (today's renders overrule r10/r11 — §D banked numbers
re-derive before re-use): the ref -3.43 racks read at |x| 0.33..0.44 with
a SECOND pair at 1.10..1.21 (rear -3.26); the 0.66..0.77 window is EMPTY
(-2.96) and the corner rear is -3.02 (r11 had racks 0.69..0.87, corners
-3.29..-3.35). Racks re-seated, outer pair added, corner flaps -2.975,
towrope coil bridges the twin racks (plan center rear -3.43).

AA-TEETER FAMILY (measured, the front-row bind + run variance): the ref's
thin ±1.64..1.90 bands sit ON column-window edges; the shared box changes
with every edit, so the windows drift and the reads FLIP (the -1.674 col
read bottom 1.01 in one grid and 0.447 in the next; the +1.64 ground col
came and went across three consecutive runs). Chasing single reads
whipsaws (batch-J -3.1, reverted); only >=2px-from-edge authoring is
stable. This family carries ~2-4 pts of run-to-run variance on the front
rows and is the whole-row bind at 56.4.

STATIONS 81.1 -> 75.9 (explained): hullZRange defines the slice windows —
the prong body extension (z1 3.36 -> 3.46) re-phased all 14 slices
(t62mv1-r7c corollary: span changes re-phase stations). Slice 12 (topPct
~15, trimmed-dropped) is the ref's low nose line vs my deck/idler-wrap
band; headlights/stowage/spare-track tops re-seated recovered part.
Left-tab law case: its 1.872 edge partial-pixeled into the ±1.9
plan_whole window and painted a phantom +0.98 front edge (e1.0, p95
10.33) — 2px margins fixed it (x -1.83).

Sight-tower head masses added (ref front carries 2.18-2.23 across
|x| 0.15..0.55 where the bare roof read 2.03). §H.4: base-rig conformant;
variant tells vs t90a/t90m: welded wedge turret + squared bustle + tower
pair + bustle PKT. No *_vlo signature in mask behavior; no oracle repair
needed this round. npm test green; turret-parent 0/0/0.

## §B3.1 PRISM SWEEP round (2026-08-06, russia-family builder)
PRISM INVENTORY (found -> replaced-with):
- floating strap frame (3 thin boxes hovering 10-22 mm ahead of the
  mantlet plug) -> CANVAS COVER PAD filling the plug front (inside the
  straps' own z-envelope 0.288..0.312) with the straps riding it
  half-buried — the "open rectangle floating in front of the plug" read
  is gone; plug slab kept (certified SM flat-mantlet mass).
- bare root cone -> two boot fold rings on the cone (+6 mm over the
  local cone skin, inside side noise).
- bare roof box at (-0.85, 0.52, -0.27) -> stowage-bin grammar: flush
  lid seam + two latches on its own faces.
GATE HOLD x2: 56.4 | 61.2/56.4/73.0/75.9/100/100 (baseline exact;
turret +0.1). npm test green. mg1 census (Kord RWS fitting) held.
Residuals: AA-teeter family variance class unchanged; rear sight panel
and Sosna-U keep their certified masses (already lens/hood-dressed).

## §B3.2 DENSITY + T05BV-1 RWS round (2026-08-06, russia-family builder)
Owner directive: "automated machine gun emplacements" — the T-90SM roof
gun is the T05BV-1 REMOTE weapon station. BUILT (§B3.1 cylinders law, all
hand parts justified as RWS structure around the census Kord fitting):
slewing ring (torus r 0.095) + hub above the bustle lid, sensor-head DRUM
(cylZ r 0.055) with dark rim + glass lens, sensor yoke arm, cradle cheek
plates, elevation drum, RWS ammo bin + lid seam. Every part mask-INTERIOR:
side z -1.03..-1.53 carried at 0.85 by the left 2.25-plateau bin; front
x 0.17..0.47 by the same bin, x 0.53..0.71 by the Kord receiver (0.708),
x 0.69..1.01 by the right roof-bin (0.77).
ADDED KIT: unditching log through the twin rear racks (top 1.36 under the
1.38 rack-A line; len 0.9 keeps plan on the rack/tray columns — the ref's
0.66..0.77 plan window is EMPTY, r12 law); PKT coax stub + washer flush
against the mantlet canvas pad (z<=0.303 vs the 0.304 face); spare
track-link run FLUSH at the 1.413 deck; tow cable flush on the left deck.
MG census: mg1+0d -> mg1+3d. GATE x2: 56.4 | 61.2/56.4/73/75.9/100/100
(baseline EXACT; no AA-teeter flip observed this round).
Residuals (honest): kit subtle at hero distance (flush law); §B1 loft
ladder unchanged (existing t90sm ceiling work continues in its own lane).
Turret-parent: cable flag = §B5 audit-artifact. npm test green.

## TURRET-LANE round (2026-08-06/07 punch list 3, russia turret lane): turret 73.0 -> 81.0, stations 75.9 -> 84.0

Owner order: "t90sm (no attachments or decorations or the machine gun
turret, turret does not look good)". Gate x2 IDENTICAL:
min 57.4 | hull 61.2 / whole 57.4 / turret 81.0 / stations 84.0 / dims 100
/ floaters 100 (baseline 56.4 | 61.2/56.4/73.0/75.9/100/100 — every row
held or improved; whole +1.0, min +1.0).

TURRET RE-LOFT (T3R markers in buildT90SM):
- Prism h 0.515 (the flat 1.99 roof was 0.08 proud over the ref's 1.912
  front-half line) + center crown plate 1.985 with hatch rings; rear
  outline pulled to -0.80 local with a rear casting shelf carrying the
  ref's raised 1.50 underside (the poly base 1.40 was 0.11 deep on six
  rear cols); §B1 raked nose slabs to the measured plan staircase
  (1.868L @ |x|0.44 -> poly edge @1.05, chin rising 1.40 -> 1.59w);
  welded-rear staircase outline (ref rear is FLAT -0.405L across x
  1.43..1.55 — the old taper painted -0.50 at the ±1.46-1.49 cols).
- Bustle: tail slat pulled off the z -2.517 ONLY-PROC col (err 9, the
  row's old p95 driver; plan rear now -2.445 vs ref -2.418); mid-step
  narrowed for the re-phased ±1.243 window; per-side 0.985-box depths
  (print asym); basket rail ring at 1.955-1.965w (the ref's own
  1.939-1.966 rear band, was under-read 0.03).
- EQUIPMENT (the owner's missing kit, placed where the ref's own 2.239
  side band lives, z world -0.41..-1.32): pano commander sight (boxy
  head + mast + EW cluster, top 2.235) at x -0.34..-0.57; the UDP
  T05BV-1 RWS as one CONNECTED station (slew drum + ring + yoke +
  armored shroud crown 2.235 + sensor pod + ammo can) around the census
  Kord fitting, yawed ry +1.45 (CROWS law: scanning right, never
  dead-forward) with the barrel DROOPED (elev -0.26) so its line falls
  2.17 -> 2.0 along the ref's right-shoulder falloff; muzzleTipDot;
  Sosna-U gunner housing stepping 2.15/2.095/2.015 (ref 2.157/2.103/
  2.021); rear 2.24 spike panel restored z-THIN at the ref's own -1.97
  one-col spike (lost when the old panel was lowered — side_whole err
  0.174 appeared and died with it); left flank bin (ref ±1.12 front
  cols 2.009); OPVT snorkel half-sunk on the bustle; relikt single tall
  course rRows 1/rH 0.42 (the old row-1 crest printed 2.005-2.02 over
  seven cols where the ref roof is 1.912).
- GUN: mantlet plug moved to the new turret face (world 1.96-1.98 = the
  ref's own plan front line; it sat buried 0.5 behind), §B3.1 collar
  boot (crease rings + end clamp) at the ref's 1.775-1.83 boot band;
  outer tube waisted at the sleeve joint (ref band 1.611..1.748 = r
  0.0685 @ cy -0.02); muzzleBore (shadow-named).
- FRONT-DIP LAW CASE: the ref FRONT has a center dip (1.988 at |x|<=0.19)
  between shoulder masses (2.13-2.23 at x<=-0.31, 2.21 at x>=+0.15) —
  the first cluster cut read 2.233 across the center cols (front_whole
  mean +0.42, p95 +3.35 = the -7 whole regression, reverted by parking
  pano LEFT of -0.34 and the RWS RIGHT of +0.18).
- WIDTH-GUARD RE-PROVEN: the -1.898 parity blob first seated at x -1.93
  tripped the §D WIDTH-GUARD-BY-DRESSING rescale (dims 100 -> 92.2,
  hull -5.7) — re-capped inside the 1.890 anchor.
RESIDUALS (honest): whole 57.4 stays the AA-teeter front-band bind
(certified ±2-4 pt variance class); plan_turret cover 2.86 (muzzle-end
grid family); the -1.898 col teeters with dy (matched today at x
-1.874). Self-shots: shots/russia-vertex/turretlane-t90sm/ (equipment
visibly present; articulation clean). DELIVERED-PENDING-CRITIC.

## FIX-ROUND (2026-08-07, §4.999991 verdict CONDITIONAL 8.0 -> orders closed; T4S markers)

Gate x2 IDENTICAL: min 58.2 | hull 61.2 / whole 58.2 / turret 81.0 /
stations 83.2 / dims 100 / floaters 100 (baseline 57.4 | 61.2/57.4/81.0/
84.0/100/100 — whole +0.8, turret exact, hull exact, stations -0.8
inside the 1.0 budget, dims held). Geometry hash e20fb700 -> 55509794.
Evidence: shots/russia-fixround/t90sm/ (14 pairs at the final hash).

ORDERS:
1. SLAT GRID — the bustle rear dark inset is now a real slat panel:
   frame + 3 horizontal bars + 5 stiles over a RECESSED dark backdrop
   (slats read against shadow, §B2 closed), standoff struts onto step3;
   envelope byte-preserved (outer plane -2.535 local = the certified
   -2.445w plan rear; y 0.29..0.45). SIDE slat panels added on the
   bustle flank step faces (backdrop + 4 bars + 3 stiles per side, bars
   5mm proud of the ±1.06 face, 44mm clear of the ±1.109 window).
   Rear pair shows the lattice read the print signs.
2. BRIM FLARE — raked apron plates (orientedSlab, §C.1-guarded) bridge
   the main-panel face (1.735 @ y 0.155) down-out to the outer panel's
   lower edge across each side's certified outer z-window; front/rear
   pairs now show the MS brim trapezoid. LAW CASE: the first cut's
   1.872 outer edge AA-slivered the ±1.925 plan width column (2mm of
   window coverage owned the col at err 0.969 — AA-SLIVER OWNERSHIP);
   final outer edge 1.860 = the certified outer-panel extent.
3. RELIKT GLACIS ROWS + TONE — full cassette courses (3 per side per
   row + dark gap seams) in the certified hugged row envelope, SCHEME
   bucket instead of hullTrack steel (t72b3m rBucket law): the
   grey-lavender flat glacis is retired in the front pair. A lower-bow
   splash board was DECLINED (the loft nose at 3.02 sits 2cm inside the
   ref's 3.00 plan-front line — any proud board breaks it).
   PANO HEAD: a literal +0.21 flipped heightM p95 to 2.44 (dims 33.6)
   and cost stations -15, measured — dims are sovereign and the
   normalized print carries its own towers at 2.24-2.26. Delivered as
   the MUSHROOM READ the pair actually shows: thin neck (r 0.045) +
   distinct wide-lipped head, cap 2.2525w (grace line). The +0.15
   literal residual is dims-blocked (report).
EXTRAS: the T3R hatch "rings" were ARG-SWAPPED cylY cones (rT,rB,h) —
19cm spikes; whatsat vertex-arc decode. Both are now honest RAISED
CUPOLAS (commander @ -0.395 x-shifted off the 1.99 front cols; gunner
rim under the Sosna's 2.15 line) — the cones turn out to carry the
ref's own 2.083-2.086 slice-6 cupola rims, so the cupola envelopes
replicate them. Rear log off the loud-tan default (0x473e32).
LAW NOTES: STATION-SLAB LEAK — the station z-slab (~0.52) is wider than
the slice window: a 2.2575 cap read one raster px over the ref's 2.259
slice-6 line from an ADJACENT slice; cap tops near slice refs need the
grace-line seat. Audits: standard-check clip 0/0, holes 0, mg1+3d;
winding m1 clean, m2 clean; turret-parent cable flag = §B5 artifact
(pre-adjudicated). Trio-wide track-band chunky-vs-smooth note stands
(shared-material lane, report-only).

## T90-CONTINUATION round (2026-08-07, §5.10 owner order "keep working on them"; T5H markers): hull 61.2 -> 75.8, min 58.2 -> 75.8

Gate x2 IDENTICAL: min 75.8 | hull 75.8 / whole 77.4 / turret 81.4 /
stations 86.9 / dims 100 / floaters 100 (baseline 58.2 | 61.2/58.2/81.0/
83.2/100/100 — hull +14.6, whole +19.2, turret +0.4, stations +3.7; the
approved §5.0 turret read UNTOUCHED per the mid-round owner order).
Geometry hash 55509794 -> d98f27dc (0b997c5c mid-round; the SS-B4 closure
below moved it). Evidence: shots/t90cont/t90sm-before/ + t90sm-after-hull/
+ t90sm-final/ (14-view pairs at the record hash).

WHAT MOVED IT (fresh vertex-workorder absolute columns, worst-first):
1. TAIL RE-SEAT (plan_hull gold mine, ~10 cols x 0.2-0.3): today's
   registered plan staircase overrules the r12 x-seats — ref rear is
   -2.88..-2.99 at |x|<=0.5 (EMPTY center: the r12 racks/towrope/tray at
   x 0.29..0.48 painted ten center cols to -3.40..-3.46), racks at the
   ±0.806/0.833 cols. Racks moved OUT to x 0.80..0.87, tray+coil deleted,
   log forward to the -2.92 transom, outer pair widened to solidly own
   the ±1.05 window, corner bins/flaps to the -3.15 teeter compromise.
   A SECOND inner pair at ±0.38 (rear -3.31) landed under today's frame
   (the ref tail carries multiple rack modules — both pairs 20mm+ clear
   of their window boundaries).
2. BOW DECK LINE (side rows, 7+ cols x 0.11-0.19): the i=10 fender lip's
   flat 1.425 top read +0.14 over the ref's falling 1.202..1.256 line —
   run ends at z 2.455; flaps re-banded 1.075..1.205 (ref 3.05/3.16-col
   tops 1.202; §B4 floor held over the 1.059 wrap arc); fender bridge
   slimmed to top 1.12 (§B2 base->tip link kept); lips lowered to the
   ref's own 1.371 fender line (top 1.3725).
3. BELLY 0.30 -> 0.44/0.45 (front-view floor): ref front bottoms read
   0.447..0.489 where the flat 0.30 belly printed 0.10-0.15 low across
   five+ center cols. Tracks own side bottoms; plan interior (§B2: real
   metal at the real height, not a filler slab).
4. CONTACT PINS (§B6 ramps to today's ref lines): contactZF 2.45 /
   contactZR -1.88 (front ramp read 0.08 low over six cols; ground ran
   to -2.19 where the ref lifts at 0.218).
5. DIMS RE-PIN: the tail-extreme trim (sliver -3.48 -> -3.435, an
   ONLY-PROC err-9 col in today's frame) re-phased the side grid and the
   pano-cap 2.2525 grace seat sampled 2.2532 (dims 99.7 x2 measured) —
   cap to 2.245; the left plateau bin's 2.25 top + boundary AA was the
   second driver (top -> 2.245). hullLengthM body anchors held: rack B
   band 0.38 solid at the -3.39 col, prong tips 3.465 (front body).
LAW CASES: the r11-decoded LEFT 1.665..1.705 inboard rubber run (its
0.447@-1.674 front col) was decoded but never authored — landed left-only
(print asym); first cut's -1.71 edge bled 12mm into the -1.717 window
(whole err 0.281) — 2px margins. RIGHT upper-course extension REVERTED
asym (ref +1.898 col is the bare 0.893..0.936 sliver; left carries
0.574..1.308 — print skew). The T4S outer stow panel's 1.86 face
AA-kissed the re-phased ±1.89 plan window (err 0.965) — face to 1.8525.
§B2: the lip-run trim opened a 16-cell/side top-down pocket (tub/skirt/
end-cap ring) — closed by a LOW lip segment ON the ref's own 1.202-1.256
bow deck line (holes 16 -> 0). Audits: standard-check clip 0/0, holes 0,
mg1+3d; npm test green.
SS-B4 BLIND-SPOT CLOSED (exact audit at round close): rear shoe 24 vox at
band 0 (the m1a1ha class) — the wrap shoes rode 23mm INSIDE the 1.18
track-bay roof at z -2.44..-2.40 (full width) + the flap bracket's -2.72
front sat in the sprocket wrap-shoe envelope. Sprocket window roof
1.18 -> 1.21 (interior; deck 1.40-1.45 above), bracket/bin/flap fronts
pulled to -2.95..-2.96. Final exact audit: band 0/0 + shoe 0/0 CLEAN
(gate 75.8 x2 held through the closure; winding m1 0/0/11px, m2 CLEAN 0
candidates).
RESIDUALS (honest): AA-teeter front-band family (certified ±2-4 var
class) still binds hull/whole; the ±1.68..1.90 col rears teeter between
-3.35/-3.02 phases (compromise-seated at -3.15); prong-tip side col
(3.49 ONLY-PROC, err 9 x1) and the fat 0.34 tip band at 3.396 (ref
0.16 sliver) are the §D dims-vs-curve trade carrying hullLengthM's
front body column — priced, kept.

## CHEVRON-TIP round adjudication (2026-08-07, chevtip builder — §5.29, NO TOUCH)
Tip-read judged PRESENT: the welded prism's own nose facets converge at
the mantlet (the '<' in plan is the turret geometry itself; approved
§5.0 turret read, owner-approved, record d98f27dc pending critics) —
the §5.29 re-shape does not demand movement. Byte-held this round
(hash verified in the round sweep). NOTED for a future owner ask: the
real T-90MS carries bar-armor arcs on the hull rear + bustle rear —
adding them moves certified rear rows on a record-pending tank, so the
equipment order was NOT spent here (§5.29 scope discipline).

## §5.94 LECLERC-METHOD GRADUATION (2026-08-10)

The owner's strongest legacy T-90 reference is now finished rather than
merely look-protected. Source sections drive its low six-wheel hull, angular
welded shell, square bustle, Relikt flank grammar and asymmetric sight/RWS
stations. Rack webs, terminal toes, deck seats and contact knees are physical
load paths, not mask proxies; every decoration is flush to real structure.

Final gate reproduced twice at **90.0** | 90.2/90.3/90.8/90.0/100/100;
gate JSON SHA-256 is
`723648c49e6ef393b4b881bb2bfe7bcff7621d32a705f6c09c9e06000c840ca1`.
Freeze **56324371** reproduces at 46 meshes / 87,171 vertices. Standard is
band/shoes 0/0, contiguity 0 and mg1+3d; winding is 0 reversed / 0 mixed with
only a 15 px (0.03%) FrontSide deficit and zero yaw candidates. The parent
audit's tow-cable candidate is correctly fixed hull equipment.

Fresh §B8 passes all fourteen views at floor **9.0**, mean **9.04**;
yaw/load paths pass **9.1**. Sights, MG cradle, smoke banks, ERA, antennas,
bustle modules and gun rotate as one seated assembly with no air gap or
unsupported hardware. Verdict:
`docs/critique/shaded-parity-t90sm-graduation.md`.

## §5.105 OWNER-PRIORITY COMPLETE REDESIGN (2026-08-10)

The §5.94 candidate was reopened because the owner correctly identified a
still-generic turret/bustle read. The source-measured core is retained, but
its solid side bustle steps are replaced by backed slat cells with explicit
rails, stiles and buried carrier feet. A low embedded diamond cheek skin
recovers the long swept shoulder; deep inboard scalloped skirts recover the
source side silhouette while remaining clear of the native linked shoes; and
a layered rear louvre/service/tow field replaces the blank transom.

Freeze **`7efc69c9`** reproduces at 48 meshes / 93,257 vertices. Gate is
**90.0** x2 | 90.2/90.3/90.9/90.0/100/100; JSON SHA-256 is
`55c349c191fbb584620fe0cf0d88f315ff4a72c23156d19951b31a73b6a22c61`.
Fidelity is **93.3** (H96/T88/G94/R91). Standard, winding and native-track
checks pass; `fitting_towCable` is independently adjudicated as legitimate
hull-owned deck equipment.

Fresh §B8 inspected fourteen paired views and all twenty-eight yaw frames.
Scores are `[9.0,9.1,9.0,9.1,9.0,9.1,9.0,9.1,9.1,9.1,9.1,9.1,9.1,9.2]`,
floor **9.0**, mean **9.08**. Every turret decoration rotates with a visible
seat; skirts, rear service geometry and tow cable remain correctly fixed;
the single native six-road-wheel course remains continuous. No fused turret
mass, floater, empty-air attachment or visible winding wound remains. **KEEP
`7efc69c9`; prior `56324371` is retired.**
