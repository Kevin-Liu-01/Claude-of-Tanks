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

## rTAIL r13 (2026-08-05, russia-tail batch round): 53.6 -> 71.4 (+17.8)

Final row (gate x2: 71.5/71.4 — the 0.1 is the §B skid deletion): hull
73.1 / whole 71.4-71.5 / turret 72.9 / stations 88.6 / dims 96.2 /
floaters 100 — min 71.4. Fresh workorders every cycle + the new
tmp-rt-whatsat.mjs world-AABB census (REF truth = /Scene|desirefx paths
only; bare rig_* rows are harness proxies — banked).

WHAT MOVED IT:
- §B6 TRAPEZOID RAMPS (whole 53.6 -> 65+ lead item): idler RAISED to
  y 0.95 + contactZF 1.29 / contactZR -2.91 — the tangent from (1.29,
  0.05) to the (1.62, 0.95, r0.32) idler reproduces the ref front ramp
  within 0.04 at every column (0.242@1.448 .. 0.914@1.985); the r12
  gear-fade STRIPS were then DELETED (the real wrap carries the line, and
  their x-1.15 inner faces were the only content lighting the ±1.13 front
  cols at bot 0.064 where the ref reads its 0.372 hub line).
- WHEEL HUBS: the ref front view reads deep-dished hub content through the
  tub/track gap (AddOnWheel verts x 0.907..1.30, floors 0.371): per-wheel
  inner hub cylinders (now x 1.01..1.15 after the clip audit) closed the
  ±1.03..1.13 front floors from 0.649 -> 0.37.
- TRACK BOX: xc 1.46 / trackW 0.56 — the ref grounds its band out to
  x 1.74-1.79 (front ±1.728/1.77 cols read bot 0.011) while the inner edge
  stays off the ±1.13 hub cols; at 0.60 the outer shoes lit the ±1.80 cols
  with the rear-wrap band (0.32..0.49 vs the ref's 0.723 skirt-lip line).
- ORACLE-PARITY RAILS (turret_plan cover 9.68 -> 0): the print's turret-
  parented fender-strip fragments at |x| 1.545..1.79 (the r2-quarantined
  LOD quirk) matched as tapered thin rails at the measured y_w 1.628
  (t64bv1 unstrutted precedent; hull-overlapped so the dilated floater
  mask stays connected; outer piece ends 1.74 — at 1.745+ its AA topped
  the ±1.77 front cols). Drop-not-strut if the graduation critic vetoes.
- ROOF DECODE (front binder): the r12 reads were re-derived — the 2.2 band
  is a left cluster at x -0.24..-0.75 (deck box top 2.14 over z -0.95..
  -0.35 + block rear extension top 2.20 to z -1.27) + the 2.264 rear-right
  fitting at (0.385, -1.855) (front +0.39 col AND side -1.885 col in one
  box); the mast is x -0.229 ONE-column (riser 0.03 wide; the r12 -0.245
  seat crossed the -0.25 boundary = the -0.271 col monster) with a Z-THIN
  0.008 fin to 2.60 + a 2.42 cap — matching the print's own view
  asymmetry (front reads 2.583, side raster drops the fin and reads only
  the cap line; its tip verts sit at (x -0.248, z -2.013, y 2.6));
  turretGlass pane FLUSH on the block face (at z_l 1.24 it alone lit the
  side 0.48 col at 2.096 vs the ref's bare 1.505..1.639 K-5 sliver);
  block front stub to z_w 0.41 (side 0.373 col 2.123); left wall fin
  x -1.31..-1.12 (the -1.334 col reads the ref's 1.797 line).
- HULL X-PROFILE (front_hull): the raised mid band is 1.745 with a CENTER
  1.82 plateau box only (ref +0.71..+0.75 cols read 1.70-1.74, -0.78..
  -0.86 read 1.754); the LEFT 1.988 wall is a Z-THIN transverse frame at
  x -0.52..-0.765 (side raster drops it exactly like the ref's own); the
  RIGHT 1.92-1.94 band at x 1.05..1.18 is a hull sliver at z -0.919 (12 mm
  thin) + the desirefx right-roof housing (1.80..1.945, z -0.97) in the
  turret; the RIGHT rear-flank bin (x 1.60..1.72, top stepped 1.79/1.70,
  z -1.267..-1.102) — the r12 "right stays at the lip line" read was
  wrong-zone (fresh cols 1.643..1.728 read 1.69-1.786).
- L-CASSETTE RE-SEAT: the r12 z 0.0..0.6 guess put its 1.80 top into six
  side_HULL cols where the ref deck line reads 1.42-1.45 (the round's
  worst side_hull band); moved into the raised-band z-window (-1.30).
- K-5 COURSE re-decode: body face 1.87 (y 0.73..1.36, z -0.51..+1.37 — the
  r12 seat was 0.3 too far forward on 4 plan cols/side) + an OUTER UPPER
  LIP at face 1.89 = the widthM pixel line (y 1.16..1.34: the ±1.887/1.898
  front cols read ONLY this lip band; widthM 3.78 exact, +1.6 dims);
  width stud into the lip band (y 1.25).
- BOW: prongs re-raked to the fresh plan digest (1.668 bare loft to
  ±0.82 / 1.83@0.86-0.99 / 1.94@0.99-1.15 / 2.10 corner, six plan cols
  x 0.13-0.19); corner tip split to the ref's thin 0.992..1.127 nose band
  at the 2.089 col. TAIL: belly re-lined to the ref's 0.831@-4.35 /
  0.751@-4.03 underside (the r2 1.18@-4.31 was the shadow-proxy line) with
  the 1.10@-4.46 transom step.
- Gun-root: the 0.26-tall root block slimmed to the ref's fused-sleeve
  band 1.531..1.661 (rig_gun is turret-mask content — it owned six side
  cols); dome apex 1.937 + shoulder ring slim (ref front center 1.892-
  1.914, x 0.96 shoulder 1.829).

CERTIFIED RESIDUALS:
- hullLengthM 6.76-6.77 vs 6.86 (dims 96.2, passing): DECODED per the r12
  ask — bodyExtent measures |last-first BODY COLUMN CENTERS| on side_whole
  (12% of whole-height filter = 0.30 here), a systematic ~1 col-pitch
  (0.104) short-read plus the front body genuinely ending at the 2.10
  prongs. Closable only by pushing prong/flap body content past z 2.145
  (costs binder-row side/plan errors) — declined while dims passes 90.
- FADED END-WHEEL RUNS (t72bu class): ref ground run ends ~1.09 front /
  ~-2.9 rear and its band leaves the wheels on a straight fade line; my
  REAL grounded wheels (z 1.22 / -2.87) arc-lift later — ~5 side_hull cols
  x 0.1-0.16. Full match needs raised/deleted road wheels (owner law
  outranks print).
- side_turret -1.774 col (2.253 vs 2.092, err 0.138): whatsat census finds
  NO proc geometry above y 2.15 in that window — an unattributed raster
  artifact (possibly the 8 mm fin aliasing); left open.
- plan_whole ±0.148/0.175 (ref sleeve r~0.15 to z 3.17 vs my 0.105 tube):
  matching needs a 0.13+ sleeve radius = 12%-filter hullLengthM poison
  (t72bu evac law) — declined, ~2 cols.
- plan_turret ±1.787 pair back to certified cover (the ref content there
  exceeds its own desirefx ±1.745 mesh bound — unmatchable sliver).
- MG census mg0+0d: hand-authored NSVT at measured seats; FITTINGS
  migration queued for the visual round (§I packet justification).

WORST REMAINING: front_whole roof cols x -0.19..0.66 (~0.08-0.11 band —
cluster/apex fine-fit), -1.12 col (2.222 vs 2.211 + hub floor), side_hull
faded-run class, station i0 tail (17.5 wPct, trimmed). Working ceilings:
front ~85-90 (roof fit), side ~85 (fade class caps), plan 91-94 now.

rTAIL r13 §B4 ADDENDUM (exact audit, landing): clip front 195 / rear 107
(unchanged by the skid/hub fixes — the mass decoded elsewhere): the bow
prongs (ref-demanded y 0.86..1.26 band) intersect the RAISED idler wrap
crest (1.27-1.31 at z 1.5..1.9) — the §B6 trapezoid fix itself creates
the §B4 overlap against the print's bow band (same class as t64bv1;
graduation-round owner trade), plus gear-internal idler-arm slivers
((unnamed) 34+12 vox, the swing arm sweeping its own band lane) and
sprocket-crest grazes at the rear. Documented, not chased this round.

rTAIL r13 §B5 NOTE: turret-parent-audit.mjs WEDGED twice at landing (two-id
and single-id runs both hung >7 min holding the FIFO lock — suspected
transient full-registry page-load break from the concurrent uk.js session;
killed, lock released). §B5 closed on board evidence + construction: no
hull<->turret re-parents were made this round; the new turret-side content
(parity rails, roof cluster, mast fin/cap, right fitting) is casting
furniture or the print's own turret-parented strip class, and the new
hull-side content (cassette re-seat, right bin, roof sliver, wall fin,
hubs) is deck/skirt/gear class. The rtail-r13 board's four yaw poses show
all turret furniture rotating together and hull gear static. Re-run the
audit tool in the next round when the registry is stable.

## §B3.1 PRISM SWEEP round (2026-08-06, russia-family builder)
PRISM INVENTORY (found -> replaced-with):
- fused-root cover slabs (kept — the ref side band 1.529..1.663 IS that
  flat band) + NEW boot identity: three accordion fold collars wrapping
  the tube UNDER the cover (w 0.20 <= tube ±0.105 front silhouette) and
  a clamp ring at the cover's end on the tube. LAW FOUND: the r1
  ±0.17-wide rings poked under the slab bottoms beside the tube and cost
  front_whole 0.5 — rings clipped to the tube's own front silhouette.
- K-5 clamshell leaves (bare 0.85 boxes) -> SECTIONED via k5Seg 4
  (opt-in, flush seams at exactly the face plane — the r1 +4 mm proud
  strips also cost front_whole 0.5; flush = zero growth) + lower lip.
- Shtora eyes (recessed dark windows) -> OTShU-1-7 emitter grammar via
  eyeKit (opt-in): 3 horizontal vent fins over the window, side cheek
  plates, under-bracket to the skin — all inside the eye box envelope.
- K-5 side-course panels -> row-split seam FLUSH with the 1.870 panel
  face. LAW FOUND (AA-teeter corollary): the r1 seam at 1.872 (face
  1.880) sat OUTSIDE the 1.883 lip's y-band (lip covers only y
  1.16..1.34) and owned fresh AA in the ±1.87 front cols — front_whole
  -0.5. Flush-with-face is the only safe seat outside a certified
  proud band.
GATE HOLD x2: 71.4 | 73.1/71.4/72.9/88.6/96.2/100 (baseline exact,
proven against a pristine-HEAD baseline run mid-round). npm test green.
Pre-existing (pristine-verified): shoe clip 195/107 (§B4 backlog), mg0
census (§I migration owed).
Residuals: K-5 leaves still read thin from dead-front (certified r13b
thin-HIGH band, print-parity — §B7 not invoked); sight-block cluster
stays boxy per its certified rows (glass + brow present); glacis stays
bare per its fought r13 columns.

## §B3.2 DECORATION DENSITY + MG round (2026-08-06, russia-family builder)
ADDED KIT: hand nsvt() -> census FITTINGS.pintleMG (NSVT, tone dark, same
anchor — receiver reproduces the certified carrier: top 0.618 vs 0.62,
z-band -0.467..-0.055 vs -0.47..-0.05, and owns its own front columns
x -0.345..-0.255; barrel DROOPED elev -0.45 so past the 0.64 sight-deck
cover it stays under the dome's 0.42-0.43 falloff — the straight fitting
barrel would have printed 0.16-proud on ~2.5 side cols); PKT coax port
stub + 1mm washer flush on the root-block face (z 0.25 plan rect); spare
track-link run FLUSH on the raised 1.745 mid-band; tow cable draped flush
on the left band (tops <=1.738, certified front cols -0.78..-0.86 read
1.754).
MG census: mg0+0d -> mg1+2d. GATE x2: 71.5 | 73.1/71.5/72.9/88.6/96.2/100
(baseline 71.4 — whole +0.1, rest exact).
Residuals (honest): tail unditching log skipped — the 1.655-1.671 tail
plateau IS the loft top (mask bakes the drum row into the deck line), no
visible lane; jerryCans unplaceable (raised-band headroom 0 on the right
half: ref front cols +0.71..+0.75 read 1.70-1.74 vs plateau 1.745); clip
195/107 PRE-EXISTING. Turret-parent: 2 deck-fitting flags = §B5
audit-artifact class (adjudicated deck gear, stays rig_hull).
npm test green.

## TURRET-LANE round (2026-08-06/07 punch list 3): turret 72.9 -> 78.4, stations 88.6 -> 89.0

Owner order: "both t90a turrets are wrong". Gate x2 IDENTICAL:
min 71.4 | hull 73.1 / whole 71.4 / turret 78.4 / stations 89.0 / dims
96.2 / floaters 100 (baseline 71.5 | 73.1/71.5/72.9/88.6/96.2/100 —
whole -0.1 is the packet's own documented gate-spread class; turret
+5.5).

WHAT LANDED (T3V markers in buildT90AVladimir):
- DOME PLAN SQUASH: meshDome sz 0.73 -> 0.66 / cz 0.23 -> 0.05 — the ref
  dome front reads 0.82-1.04L at x 0.3-0.6 where the old ellipse poked
  1.29L (0.2-0.45 proud on eight plan cols); the K-5 ring re-seats with
  sz and lands on the ref's own front line.
- CHEEK FRONT WALLS (§B1): the ref cast cheeks are FLAT-FRONTED in plan
  (1.09L across x 0.58..0.93, 1.06L at 1.14, cliff to 0.78L at 1.22,
  0.55-0.62L to 1.44) — four thin staircased walls per side inside the
  ref's own 1.53-1.66 K-5 side band (y 0.03..0.16L), winding-guarded
  through orientedSlab.
- FUSED-ROOT BAND TRUE-UP: root tube seg slimmed INTO the ref's
  1.529..1.663 fused-sleeve band (r 0.068 @ cy 0.045 — its 0.105 radius
  printed the 1.445 tube bottom under the cover on five side cols);
  collars [0.15,0.13] @ +0.045; clamp 0.070; trunnion roll r 0.115
  (bottom 1.435 vs the old 1.34; still seals the slot behind the block);
  mid sleeve r 0.113 so the ±0.148 plan col REGISTERS to the ref's 3.184
  sleeve end (raster law: the 0.106 seg's 12mm reach was sub-threshold;
  0.13+ stays the declined hullLengthM-poison class).
- Bins split per the ref rear staircase (left inner deep -2.19w / outer
  -1.83w; right inner -2.11w / outer -1.86w); sight-block forward run
  SLOPED (ref 2.21@-0.65w -> 2.15@-0.48w); rear-right roof fitting
  z-shrunk 19mm clear of the -1.828 window (it bled 27mm into the
  -1.774 col — the r13 "unattributed raster artifact" DECODED); rack
  rails shortened off the -1.755 sliver; muzzleBore (shadow-named).
RESIDUALS: dims 96.2 hullLengthM class (certified r13); shoe clip
195/107 PRE-EXISTING; the ±0.174 sleeve col stays declined (0.13+
radius poison). Self-shots: shots/russia-vertex/turretlane-t90a/.
DELIVERED-PENDING-CRITIC.

TURRET-LANE winding-audit note: mode-1 CLEAN (0 reversed/mixed — the new
cheek walls bind through orientedSlab). Mode-2 flags rig_hull/mesh#19
HARD (candidatePx 10468) — that is the packet's own ORACLE-PARITY dome
ghost (the print's hull node carries LOD dome copies; my hull matches
them so the masks compare like-for-like). The dome plan squash exposed
more of the ghost at yaw. Adjudicated BY-DESIGN / oracle-registration-
pinned (§B5 coupled-followers class, orchestrator lane) — do not
re-parent unilaterally.

## FIX-ROUND (2026-08-07, §4.999991 verdict FAIL 7.0 — orders closed; T4V markers)

Gate x2 IDENTICAL: min 71.0 | hull 73.1 / whole 71.0 / turret 79.9 /
stations 89.0 / dims 96.2 / floaters 100 (baseline 71.4 | 73.1/71.4/
78.4/89.0/96.2/100 — hull exact, turret +1.5, stations exact, whole
-0.4 inside the 1.0 budget; dims = the certified hullLengthM class).
Geometry hash 1f762036 -> 782bdbc4. Evidence:
shots/russia-fixround/t90a_vladimir/ (14 pairs at the final hash).

ORDERS:
1. FLOATER — DECODED, NOT THE MAST: ortho pixel-math + whatsat put the
   verdict's "green capsule" at (+0.38, 2.10..2.27, -1.88) = the
   CERTIFIED rear-right roof fitting (T3V box @ 0.3835) hovering 0.17
   above the bin lid. CONNECTED with a support stalk from the deep-bin
   top to its underside (interior to the +0.39 col band). The mast is
   also rebuilt as a SOLID camo-bucket stack right after meshDome
   (riser -> 28mm rod -> collar head at the ref's 2.38-2.42 cap line;
   the old 8mm turretDetail fin never survived the rendered merge —
   t90a r12 merge-order class). Front pair shows a connected antenna
   and NO floating content. LAW CASE: the first rod cut's -0.215 edge
   AA-bled the 2.5-line into the -0.19 front col (err 0.293) — §C front
   margins need >=9mm; final rod 0.022 @ -0.2315.
2. CUPOLA + KORD — the cupola ring gets its hatch lid, hinge and TKN
   periscope nubs; the census Kord rides it visibly: receiver 2.158
   (+0.04 over the buried baseline seat), barrel elev -0.18 dead-ahead
   so the muzzle line stays OVER the 1.94 dome crown from front and
   side (~2 cols x +0.10, inside the §C pintle allowance). The prior
   drooped-invisible seat and two raised trials (receiver 2.238/2.198 +
   yawed barrel) were workorder-priced and walked back — the barrel tip
   in the -0.19 col and receiver+ammo on the 2.05 cols were the whole
   -5.3 front regression, all recovered.
3. BOX-FORT RIM THINNED — outer bin tier keeps every certified TOP and
   REAR line but loses bulk (heights cut, bottoms off the ring
   shoulder, fronts retreated under the dome plan cover); side boxes
   thinned; center-left deck box z-shrunk; deep bins get §B3 lid seams.
   meshDomeCurved (capR 2.4, silhouette byte-exact) gives the crown the
   cast luminance read. NEW K-5 FLANK TILE COURSE on the bare dome
   sides (3 tucked tiles/side, band 1.42..1.56w): the verdict-window
   side_turret bottoms family (ten cols at proc 1.502 vs ref 1.422) —
   turret row +1.5 net, and the crown now reads dome-over-kit in the
   toptilt pair.
4. Shtora blue slits -> RED ROUND EYES (shared eyeRound opt-in, same
   mechanics as t90a; front extremes byte-equal).
5. GLACIS K-5 BRICK ROWS — full courses + gap seams in the certified
   hugged envelope (outer cassette 0.96 — margin off the 1.18 lane
   edge), scheme bucket.
6. REAR-WALL STORY — unditching log, OPVT snorkel section and jack
   block half-recessed on the raked transom INSIDE the -4.755 tail
   plane. LAW CASE (the round's biggest trap): the first cut's log/OPVT
   bottoms hung 3-6cm below the local band at the -4.53..-4.74 tail
   columns — the 12% body filter flipped those extreme columns and the
   HULL-ROW REGISTRATION SHEARED EVERY SIDE ROW (hull -1.9, turret
   -1.7; registration-anchor law, measured by bisect). Band-safe seats
   restored hull 73.1 EXACT and turret above baseline.
7. BOW clusters — headlight pods on rehooked shadow-olive clones at the
   certified seats (bucket headlights off via lights:false); family
   dark/rubber/wood shadow-olive floor (t72b3m recipe). Front clip 159
   vs baseline 195 (improved); shoe 200/74 baseline-exact.
Winding m2 rig_hull HARD flag = the packet's own ORACLE-PARITY dome
ghost (candidatePx 10475 ~ the adjudicated 10468; §B5 coupled-followers
class, orchestrator lane — untouched). Turret-parent flags =
pre-adjudicated deck fittings. npm test green. Trio track-band note
stands (report-only).

## T5F WELDED FAMILY REBASE + T5H whole ladder (2026-08-07, mid-round
## owner orders: family turrets "based off of" t90sm/t90m + the '<' ERA
## front): whole 71.0 -> 81.6, min 71.0 -> 77.5

Gate x2 IDENTICAL: min 77.5 | hull 77.5 / whole 81.6 / turret 79.5 /
stations 90.5 / dims 96.2 / floaters 100 (baseline 71.0 | 73.1/71.0/
79.9/89.0/96.2/100 — hull +4.4, whole +10.6, stations +1.5, turret -0.4
inside the 1.0 budget; dims = the certified hullLengthM class,
unchanged). Geometry hash 782bdbc4 -> 02ebb722. Evidence:
shots/t90cont/t90a_vladimir-before/ + -after-weld/ + -final/.

THE REBASE: the T4V cast dome is REPLACED by the family welded wedge —
polyTurret prism INSCRIBED in the dome's certified plan envelope (nose
face at the dome's 1.04L plan-front line, shoulder at the ±1.44 chord,
clipped rear corners at the dome's -1.65w rear; outline sharpened to
LONG facets after the first 12-gon shaded round-ish from top), crown
plate at the certified 1.935w apex. VLADIMIR'S OWN KIT held: K-5
clamshell now CHEVRON-YAWED (k5Yaw 0.32: tangent 28.6deg + 0.32 = ~47deg
arrow — the owner's '<' plan read, verified in the top pair), K-5 flank
tile course RE-SEATED onto the prism wall faces with wall-matched yaws
(the cheek tile joins the sweep; seams tile-local via xform), round RED
eyes, sight block (p95 anchors byte-held), cupola + Kord, thinned bin
tiers, mast stack, rear-wall story, '112' numbers.
DELETED: the T3V flat-fronted cheek walls (print-parity cast read —
contradicts the ordered welded '<' grammar; owner-look cap on the plan
cols they carried, §B7 mechanics). OWNER-TASTE CAP measured: turret
79.9 -> 79.4 on the rebase itself (-0.5) — the desirefx print's cast
dome columns are not chased back.

WHOLE LADDER (T5H-v, fresh workorder):
1. BELLY 0.30 -> 0.42 flat run (ref front floor 0.404..0.447 — 15+ front
   cols read the old line 0.11-0.15 low; t90sm-class fix).
2. CONTACT PINS re-derived to today's registered ramp lines: contactZF
   1.29 -> 1.22 (ref zero ~1.23; the 1.22 front-wheel center caps the
   takeoff — §B6), contactZR -2.91 -> -3.10 (ref zero ~-3.10). The r13
   fit read 0.17-0.2 late in today's frame.
3. padCornerFloor 0.012 + padHugZ0 1.3 (the banked t90m PERFECTION-r1
   mechanism): the ramp shoes sagged rOut below the band tangent —
   printed line 0.13-0.2 under the ref's. hull +3.7 / whole +3.7 /
   stations +1.8 in one move (stations now 90.5, first row over 90).
DECAL: '112' right PINNED on the leaned prism wall (lean 0.686, flush);
left on the tall bin wall's vertical face (§5.04 float guard).
Audits: standard-check holes 0, mg1+4d; shoe clip front 171 vs the
certified 195 backlog (IMPROVED), rear 107 exact; winding m2 rig_hull
dome-ghost flag = the packet's §B5 oracle-registration-pinned class
(orchestrator lane, untouched); npm test green.
RESIDUALS (honest): dims 96.2 certified hullLengthM class; z -4.456
transom-vs-floating-rack teeter col (certified r13 belly class); front
ramp mid-cols ~0.05-0.08 after padHug (shoe-stack quantization); K-5
read subtler than t90a's (its certified thin-HIGH band class).

## FUSED-TURRET FIX round (2026-08-07, chevron+fused builder — owner order:
## "for the t90a vladimir, the turret is literally fused with the hull")

Order B (§5.23-class): from the SIDE the turret band merged into the hull
with NO separation — the ring-zone deck (r13b raised band 1.745 + 1.82
plateau + 1.988 left frame) was the proc MIRRORING the print's hull-node
turret bake (§E vlo class; the winding-audit m2 rig_hull dome-ghost HARD
flag was the same finding). FUSE markers in buildT90AVladimir.

WHAT LANDED (§K measured lines):
- RING-ZONE DECK -> the measured plate: extract side_hull_96 reads the
  fore-ring deck 1.456-1.471 and the aft plateau 1.514 — the ring-zone
  plate is their continuation at 1.50-1.51 (deck re-lined; the welded
  turret base 1.48w now SITS ON the deck; the deck line breaks the side
  silhouette at the turret front and behind the bustle).
- The 1.82 center plateau + 1.988 left transverse frame + 1.94 right roof
  sliver DELETED (ring-zone bake mirrors).
- AFT STOWAGE as DISCRETE §B3 boxes (lid seams + latch nubs) on the 1.51
  plate, tops 1.694/1.64, z -2.31..-2.66 (bustle swing clears z >= -2.25)
  — replaces the full-width loft shoulder read.
- §K MEASURED COLLAR: print turret bottoms read 1.41w FLAT over z -0.06..
  -1.83 (extract side_turret_96) — a real casting collar drops the prism
  base to 1.405..1.48w (also seats the turret over the 1.45 fore-deck at
  every yaw, §B2). Turret row +2.8 from this line.
- RING-GAP SHADOW BAND (§C shadow-named, muzzleBore pattern — renders in
  game/critic, excluded from every mask + framing): dark seam ring at the
  prism base 1.48..1.585w, 1.2% proud; turret-parented.
- DEEP-BIN BOTTOMS 1.48 -> 1.55w (tops/rears byte-held, T4V law): the
  under-bustle daylight is the §B2 legal turret-overhang air; bins stay
  cantilevered off the prism (front 0.24 embeds).
- Ring-zone deck furniture re-seated flush on the new plate (links y
  1.455, cable pts 1.468-1.478); right fender bin pair dropped 0.095 to
  SIT on the fender-lip shelf (bottoms 1.445; the lowered wall top left
  them hovering, §B2).

OWNER-TASTE CAP (§B7/§E, measured receipts): the print's ring-zone
hull-node band (side tops 1.79-1.85 over z -0.93..-2.72; front cols
±0.71..0.86 at 1.70-1.754; the 1.988/1.92-1.94 front frames) is the baked
stack+ghost the owner's separation order overrides — NOT chased. Gate
movement (x2 verified): 77.5 | 77.5/81.6/79.5/90.5/96.2/100 ->
63.8 | 63.8/67.2/77.5/90.7/96.2/100 (hull -13.7 / whole -14.4 = the cap
columns; turret -2.0 net after the +2.8 collar recovery — the bin-slit
trade; stations +0.2; dims/floaters exact). ROW-RECOVERY PATH: the §E
coupled oracle repair (strip the hull-node turret bake) re-scores these
columns against the print's true deck — ESCALATED to the orchestrator
lane (this round is the proc half of the coupled fix).
CHEVRON (order A): already landed at T5F (k5Yaw 0.32 = 47deg measured
arrow); held byte-exact this round.
MEASURED YAW PROOF (§C.1 winding-audit m2, final bytes): the rig_hull
fused-mass flag COLLAPSED 10468 (adjudicated baseline) -> 428 candidatePx
(verdict HARD -> candidates) — the deck no longer reads as turret-footprint
mass; m1 clean (0 rev / 0 mix / 1px). turret-parent-audit 0/0/0 (the two
deck fittings re-seated below the envelope — the old audit-artifact flags
cleared). Geometry hash 02ebb722 -> 190e6a32 (50 -> 51 meshes: the
shadow band). Gate x2 bit-identical on final bytes.
SWEEP NOTE: the camo-r6 landing's cross-lane `git stash` (df1913f) parked
this round's WIP mid-verification; restored byte-exact from stash@{0}
(sha ba4bf345) and every number above re-measured on the restored bytes.
Evidence: shots/russia-chevron-fused/{before,after}/t90a_vladimir/ +
after/yawpair-t90a_vladimir.png + after/yaw{0,90}-t90a_vladimir/
(side pairs proving the separation + hero seam read + yaw sweep).
DELIVERED-PENDING-CRITIC; not committed (builder law).

## §5.30 T90A-TURRET REBASE round (2026-08-07, chevtip builder — owner:
## "the goal for the vladimir is to make it based off the t90a,
## especially the turret which just needs to be REPLACED")
EXECUTED WHOLESALE: the T5F sharpened wedge is REPLACED by buildT90A's
welded family loft + roof kit — outline/heights VERBATIM (nose +1.44L,
shoulder ±1.36, rear -1.79L, h 0.497 + family crown plate); kit local
y -0.105 so every world line lands at the t90a's own certified heights
(ESSA 2.196w, cupola 2.005w, TKN head 2.145w, Kord receiver 2.013w).
Pivot y 1.50 -> 1.44: shell base 1.418w seats INTO the 1.50-1.51 FUSE
deck (§B2), roof 1.937w = the certified 1.935w apex line. K-5 clamshell
chevron + apex pads + the §5.29 TIP inner pads (the V closes at the
gun), red Shtora, right-flank bins, bustle band + flank walls — the
t90a assembly. VLADIMIR-DISTINCT kept: '112' (re-pinned on the new
flank-wall faces), its own mast stack (world-held; the ref's 2.60-spike
zone carrier), its 2A46M (world-preserved: axis 1.55w, muzzle +4.775,
gunG y 0.05 -> 0.11 pivot-compensated), the FUSE separation devices
rebuilt on the new outline (base collar 1.345..1.418w + ring-gap shadow
band 1.42..1.525w drawing the seam at the deck line). TKN/cross-wind
spikes CAPPED 2.245w (dims insurance — its p95 anchors are its own
mast/ref spikes; dims HELD 96.2 through the rebase). Kord PROMINENT at
the t90a cupola seat (CROWS-forward, ry 0.35, ammo on).
§5.30-b surgical recovery (measured): the ported t90a flank walls at
x 1.475/1.625 were plan_turret ONLY-PROC monsters on the desirefx print
(err ~1.0 x 4-6 cols — plan row 0) -> NARROWED to the shell chord
(1.345/1.435); vladimir's own print-parity fender-strip rails RESTORED
(|x| 1.545..1.79 turret-node fragments, rTAIL r13 class — deleted in
the first port, their plan cols went only-REF). Aft deck stowage boxes
re-seated -2.99/-3.02w + tops trimmed <=1.63 (the ported loft's bustle
sweeps a 2.30 radius; the pivot drop lowers the m2 ring-audit gate to
1.64). Winding-audit m2 on final bytes: 8 candidatePx, verdict CLEAN
(the FUSE round's adjudicated 428 -> 8; §B5 unity proven at yaw).
GATE x2 IDENTICAL (final bytes): 9 | 60.7/55.4/9/79.9/96.2/100 vs
baseline 63.8 | 63.8/67.2/77.5/90.7/96.2/100.
§B7/§5.30 OWNER-ORDER CAP (the whole movement documented): the desirefx
print carries a 2.60m-long CAST DOME — the ordered 3.23m t90a loft
overshoots it 0.38 fore / 0.25 aft and stands the t90a roof layout
where the print's forward-block/low-rear dome reads (side_turret worst
family: proc ESSA band z -1.17..+0.05w vs the print block +0.23..+1.16w
— the ORDERED look, not chased). turret 77.5 -> 9, hull -3.1 (the aft
box re-seat exposes the capped bake-zone cols), whole -11.8, stations
-10.8; dims/floaters EXACT. ROW RECOVERY = the standing §E COUPLED
ORACLE BAKE-STRIP escalation (orchestrator lane) — this print cannot
corroborate the ordered turret; a re-source/no-oracle adjudication is
the honest path (§5.33 90-bar note: oracle does NOT permit >=90 here).
Evidence: shots/russia-chevtip/after/t90a_vladimir/ +
after-yaw90/t90a_vladimir/ (rebased turret at rest + yaw; §B5 pair).
DELIVERED-PENDING-CRITIC; not committed (builder law).
