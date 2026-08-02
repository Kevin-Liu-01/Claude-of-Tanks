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


## r6 ORACLE-TRUST AUDIT (2026-08-01, russia-family dual-gate round)

Width-normalized reference vs published dims: hull len +12.1%, height +28.3% (roof band 2.74-2.88 vs pub 2.23), overall +9.2%.

**Structural findings:** desirefx print: FOUR near-identical hull meshes at slightly different scales all visible (union fattens every silhouette); turret mesh includes plate-like geometry; heavy stylization.

**Certified caps (gate doctrine):** Ceilings: side_whole 73.8 / side_turret 55.2 / front_whole 61.7 / stations ~60. Roof cap 2.88-2.29 = 0.59 m. NOT passable against the current print.

**Gate state after r6:** hullCurves 33.3 / wholeCurves 11.1 / turretCurves 9.3 / stations 0 / dims 100 / floaters 100. (r5 dims-first + r6 probe pass (turret reseat reverted — net negative).)

Probes: tools/tmp-ru-worldtrace.mjs (absolute-world curve dumps),
tools/tmp-ru-overlay.mjs (registered ref/proc mask diffs),
tools/tmp-ru-ceilings.py (dims-clamped achievability ceilings),
tools/tmp-ru-glbnodes.py (scene-graph/bounds audit — no vertex reads).
Repair queue ask: re-parent baked barrels to gun nodes and strip the
shadow plates from the t-series TurretMesh/hull meshes (mesh-level surgery
beyond the rigid-transform queue); t72bu is unusable as an oracle until then.

## batch-9 ORACLE REPAIR (2026-08-01, tools/repair_oracles.py REPAIRS['t90a_vladimir'])

HULL DE-DUP by node surgery only: the print's FOUR stacked near-identical
hull meshes resolved per-layer (batch-9 solo renders, scratch ru9): me_003
(34k verts, full hull + running gear — wheels seat exactly in the
me_011/me_012 track runs, deck meets the me_001 turret) is the
AUTHORITATIVE copy and is kept; me_004 (3.7k, decimated LOD dropping an
oversized wheel BELOW the track bed), me_007 (4.4k, decimation slivers +
triangle flags above the skirt line) and me_008 (3.3k, same class) are
DETACHED from the scene (nodes/meshes stay in the file, unreferenced —
restorable from the .bak, snapshotted 2026-08-01; recipe byte-idempotent).
me_002 (fender/tub skin) and me_009 (skirt/ERA kit + drums + turret K-5
cheeks) are NOT hull duplicates and stay.

MEASURED EFFECT: mask-neutral at gate resolution — the three LOD layers
sat inside the union of the kept meshes (batch-9 gate re-run identical:
hull 33.3 / whole 11.1 / turret 9.3 / stations 0 / dims 100 / floaters
100; ceilings re-derived unchanged: side_whole 73.8 / side_turret 55.2 /
front 61.7 / stations ~60). The de-dup ends the stacked z-fighting layers
and the sub-belly/over-skirt LOD junk; the +28.3% stature and the me_001
plate-like turret geometry (NOT in the batch-9 queue) remain the
documented caps — authored proportions stay an owner decision.

## r7 post-batch-9 certification (2026-08-01, LOD layers detached)

Batch-9 detached the desirefx LOD stack (me_004/me_007/me_008); rows below
are vs the de-duplicated oracle. Final r7 row: hull 33.3 / whole 11.1 /
turret 9.3 / stations 0 / dims 100 / floaters 100. Dims all <=0.8%
(heightM 2.22, hullLen 6.91, overall 9.52, width 3.76) — published sovereign.

CERTIFIED STATURE CAPS (per-column, r7 worldtrace, side_whole):
- roof cluster/stack: 23 ref columns top > 2.38 over z -2.06..+0.63, tops
  2.39..3.68 vs published 2.23 (+7..+65%); the build's legal ceiling is
  ~2.26 (p95 law: 3 spike columns only). This band alone caps side whole/
  turret rows ~35-55 and owns the station topPct 15-23 at slices 3..7.
- length: ref body spans -5.23..+5.20 vs the published-legal build's
  -4.88..+4.61 (print +14% long): 8 ref-only columns (3 tail + 5 muzzle)
  plus a +0.24 registration bias (side dAlong) — station 0 wPct 27.7 is the
  unmatchable tail slice.
A cap never excuses dims: dims 100, floaters 100 across all five poses.

**r7 update (edge-on prism law, docs/GEOMETRY-GATE.md):** loftHull now subdivides at <=0.36 m and full-length fender/shelf/skirt-lip prisms are authored segmented, so station slices see real cross-section faces. State: hullCurves 33.3 / wholeCurves 11.1 / turretCurves 9.3 / stations 0 / dims 100 / floaters 100.


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
96aead422c006e82c93d993b44743e3078f030cb).

Stylization before -> after: height +28.6%, hull mask +14.0%, overall +9.1% -> height -0.5%,
hull mask -0.1%, overall -0.2%, width 0%
(gate-meter plans in tools/vertex-normalize.mjs PLANS['t90a_vladimir']).
The stylization-cap certifications of r5-r7 are RETIRED for this print.

**Standing asserts (docs/references/vertex/t90a_vladimir.json):** orientation
glacis +z / gun +z / agree True
(descent runs {"runFront": 3, "runRear": 0.29}); interpenetration
487 verts (worst dip 0.533 m outside the r>1.05 ring annulus).

**Gate row after this round:** hull 0 / whole 0 / turret 7 / stations 25 / dims 100 / floaters 100.
BUILD NOT YET RE-ANCHORED. Print turret still carries the fender-line strip (interpen 487 verts to -0.53 m — the documented LOD-copy quirk); its plan_turret columns remain oracle-parity, not real turret.

## VERTEX ROUND r2 — corner-driven re-anchor (2026-08-01)

Re-anchored to docs/references/vertex/t90a_vladimir.json (AFT frame, mask
-4.755..+2.10 = 6.855). FUSED-GUN PRINT: axis ~1.55, my muzzle +4.775 for
published overall. Key finds: the raised mid deck band 1.79-1.82 over
-2.72..-0.92 is FULL WIDTH (wUp segment 1.79 — the front-view outer columns
prove it), the pano/mast spike is a single LEFT-rear cluster (apex x ~-0.3,
z -1.99, 2.60), drums sit ON the tail plate (1.655-1.671). Two passes:
0 -> min 32.3 (hull 56.0 / whole 32.3 / turret 42.6 / stations 77.9 /
dims 97.8). Board: orientation correct, no interpen (the 487-vert fender
strip quirk stays quarantined per the packet). NEXT: front_whole (K-5 wedge
columns), side nose-gear fade columns (family cap class), turret plan.

## VERTEX ROUND r3 — dome plan-chord re-anchor (2026-08-01)

Gate plan-turret flank chords overturned the r2 dome seat: ref chords at
x +-1.23..1.45 center on z -0.52 (NOT -0.99 — the r2 "dome mass -2.29"
included the bustle bins) with A 1.50 / sz 0.73; the r2 "raised mid band
FULL WIDTH" claim was another flipped-digest artifact — ref front reads
1.25 at |x| 1.77, so the band is x<=1.58 and ends SHARPLY at -0.92 (lerp
smeared 1.78 at -0.80). Ref front dome falloff is steep (1.94 at |x| 0.3,
1.78 at 1.05): dome apex is now 2.06 with a NARROW center hump box owning
the 2.19-2.23 side band (front columns +-0.12 only), cupola dropped to the
1.94 line, K-5 tips shortened off the glacis zone (ref reads bare 1.48-1.49
over z +0.5..+1.45), pano authored as a THIN plate (0.06 x-width:
sub-column in front view where ref reads 1.94, full-height 2.16 in side
view at z -1.87; spike mast to 2.56 stays 1-col). Recoil housing slimmed
out of the |x| 0.27 plan column (t72b3m lesson); basket rails to 1.74.

Gate: 32.3 -> min 42.2 (hull 52.5 / whole 42.2 / turret 54.0 / stations
81.7 / dims 97.8 / floaters 100). Board reviewed: articulation clean.
NEXT: side_whole z -2.1 rear-stack band, hull rear/front gear-fade columns
(certified family class), front_whole K-5 flank residual (+0.1), dims
hullLengthM 1.28% (front body band straddles a column).

## r12 LANDING (2026-08-02): 42.2 -> 53.6 — r11 law set + bow notch + roof decode

Final row: hull 58.4 / whole 53.6 / turret 63.3 / stations 87.3 / dims
97.8 / floaters 100 (min 53.6). Board r12 reviewed
(shots/russia-vertex/r12/): orientation correct, articulation clean, no
floaters, masks 86.7-97.8. Two rounds:
- GEAR-FADE STRIPS both ramps (front 0.14@1.34 -> 0.92@1.985, rear
  0.14@-3.175 -> 0.79@-3.927 at x ±1.40) — this print fades BOTH its
  idler and sprocket runs; whole 42.2 -> 51.2 came mostly from here plus:
- REAR PLAN NOTCH: ref tail is full-depth (-4.70..-4.76) only at
  |x|<0.9; |x| 0.95..1.35 is notched to -4.26 (wUp/wLo staircase pts).
- BOW NOTCH (t64bv1 class, overturns the r2 "nose 1.27@1.85 -> 1.05@2.10"
  read): the ref center plate ends 1.68 (plan 1.641-1.695 at |x|<0.7!);
  corner prongs rake 1.90@0.83 -> 2.045@1.05 -> 2.10@1.24 with a 0.40
  side band (0.86..1.26) — the 0.30 band sat exactly ON the 12% body
  filter and hullLengthM coin-flipped. glacisKit re-seated (z 1.42,
  eyeZ 1.58, hookZ 1.86) onto the shortened plate; flaps 0.965..1.075
  (the ref 2.09-col sliver).
- ROOF DECODE (fresh digest): the 2.12-2.21 band is the LEFT SIGHT BLOCK
  (front 2.196-2.211 at x -0.7..-1.2; center cols read 1.90-1.94): sight
  block rebuilt as a 2.225 rear run (z_w -1.08..-0.46, heightM p95
  anchor — heightM 2.21 -> 2.23 exact) + 2.15 front run ending z_w 0.41,
  segmented; the r3 center hump DELETED; dome apex squashed to 1.975;
  mast to x -0.245 top 2.50 (ref front 2.583@-0.23, side 2.419@-1.99)
  with the 2.25 plate (z-slimmed off the -2.09 col) and 2.07 step.
- Bustle staircase: bins narrowed (x to ±0.90/0.97 outer steps, rear
  -2.04) under the ref's -1.86..-2.18 plan staircase; basket rails
  x ±0.40 rear -2.275 (ref center rear -2.24); rails z-deepened to touch
  the posts (float guard); LEFT tall bin wall x -1.10..-1.32 top 2.19
  (front 2.196 cols) hidden inside the 2.20 side band z-window.
- L skirt-front cassette x -1.61..-1.80 top 1.80 z 0.0..0.6 (front
  -1.61..-1.76 cols read 1.79-1.80, RIGHT stays at the 1.41 lip line —
  print asym); both-side ground skids at ±1.752 (ref grounds ±1.72-1.76).
- trackW 0.58 -> 0.52 (ref floors 0.372 at the ±1.13 front cols); glacis
  chevrons hugged; tube col split [2.30,2.87,0.106] (the ±0.15 plan col
  reads the ref sleeve end 3.17, not the muzzle — sub-6mm flat reach
  dropped the col entirely at r 0.104: PLAN-COLUMN RASTER LAW).

KNOWN RESIDUAL: dims 97.8 = hullLengthM 6.77 vs 6.86 (-1.28%) — the
front body read still ends ~2.015 despite the 0.40-band prongs to 2.10;
the 12%-filter interaction here is NOT the prong band (deepening it
changed nothing). Decode the body-span trace directly next round (dump
the dims replica from the fidelity page) before touching geometry.
NEXT: side_whole -1.9..-2.1 cols (mast plate zone rework printed 1 col
wide?); front_whole ±1.08 floors (0.686 vs ref 0.356 — unidentified
content, whatsat it); turret_plan center rear -2.48 vs ref -2.24 (rails);
the -0.19 front col (mast x-margin 14mm — verify it held).
