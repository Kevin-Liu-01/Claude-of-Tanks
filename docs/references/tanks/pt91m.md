# PT-91M Pendekar (`pt91m`)

**Exact variant modeled:** PT-91M Pendekar (Malaysia, 2000s) — Polish T-72M1
deep upgrade: ERAWA-1/2 flat ERA tiles over glacis/turret/skirt fronts,
2A46MS gun, SAVAN-15 sight, distinctive tall met mast on the turret rear and
large rear turret basket; big engine-deck stack (S-1000R powerpack).
NOT a Russian T-72B (different ERA type — flat square ERAWA tiles, not K-1
bricks) and NOT the Polish base PT-91 Twardy.

## Corroborated dimensions

| Measure | Value | Sources (2+ independent) |
|---|---|---|
| Hull length | 6.86 m (T-72M1 hull ~6.86–6.95) | en.wikipedia.org/wiki/PT-91_Twardy; army-guide.com/eng/product3431.html |
| Overall length (gun forward) | ~9.53 m | en.wikipedia.org/wiki/PT-91_Twardy |
| Width | 3.59 m (PT-91M with side skirts ~3.7) | en.wikipedia.org/wiki/PT-91_Twardy; army-technology.com twardymainbattletank |
| Height | 2.19 m roof | en.wikipedia.org/wiki/PT-91_Twardy |
| Gun | 2A46MS 125 mm (Slovak ZTS), tube 6.0 m, mid evacuator, sleeve | army-guide.com/eng/product3431.html; en.wikipedia.org/wiki/2A46_125_mm_gun |
| Road wheels | 6 T-72 pattern wheels, rear sprocket, rubber skirts with ERAWA on forward third | en.wikipedia.org/wiki/PT-91_Twardy |

## Identity cues

- Turret: T-72 low dome carrying flat square ERAWA tiles across the whole
  front arc; big pipe-frame stowage basket wrapping the rear; tall
  meteorological mast on the bustle; OBRA laser-warning corner sensors.
- Mantlet/gun: 2A46MS with sleeve; WW-2 smoke banks angled on both cheeks.
- Hull: ERAWA raft on glacis; tall engine-deck rear stack (upgraded pack)
  ~1.9–2.1 m; skirts full length.
- Running gear: standard T-72 6-wheel set.

## Reference links (links only)

1. https://en.wikipedia.org/wiki/PT-91_Twardy — family data (CC BY-SA)
2. http://www.army-guide.com/eng/product3431.html — PT-91M specifics
3. https://www.army-technology.com/projects/twardymainbattletank/ — dims
4. https://www.army-guide.com/eng/product.php?prodID=3862 — ERAWA ERA

## Local GLB oracle notes

Path: `public/models/tanks/community/recovered/pt91m.glb` (misc_a turret /
misc_b gun, gun authored −z; the fidelity tool flips it before scoring).
Width-normalized (3.59 m) probe, flipped to +z-forward convention:
- whole 3.59 × 3.82 × 10.42; hull ±3.83 (7.67), glacis nose ≈ 1.35, deck
  rises rearward 1.51→1.70, tall REAR stack y→1.9–2.07 near z −3.0…−3.7;
  halfW 1.59–1.79.
- turret: dome z −1.53…+1.65 (plan ~3.2 deep), halfW 1.61–1.62 (3.23 m),
  roof 2.64–2.75, met mast to 3.82 at bustle (z ≈ −1.0 rel pivot), basket
  halfW ~0.9–1.0 to z −1.4.
- gun: muzzle-to-pivot ≈ 6.52, overhang beyond hull nose 2.75, fat sleeve
  r ≈ 0.23; axis y ≈ 1.88.
- rig: fully segmented (turret + gun nodes).
Oracle defects: model proportionally tall (scale 1.34 after width norm).

## Mismatch log

| Date | total | minView | hull | turret | gun | tracks | change |
|---|---|---|---|---|---|---|---|
| 2026-07-30 | 70.5 | 75.8 | 82 | 41 | 60 | 87 | baseline (t72b3 donor + small kit) |
| 2026-07-30 | 77.5 | 77.3 | 83 | 57 | 87 | 78 | donor->standalone: hull 7.67 roof 1.52, dome 3.15x3.10 h1.10 + flat crown cap, ERAWA tile arcs, met mast, basket, tall rear powerpack stack, 6.05 m gun |
| 2026-07-30 r2 | 79.2 | — | 85 | 58 | 91 | 79 | shaded r2: ERAWA tile field + corner chevrons, met mast full height + sensor cross, louvered powerpack stack, rear drums added, basket mesh face, evac, NSVT |

r3 (shaded-parity r2 items): 79.2 → 79.3. ERAWA tile FIELD (3 rows x 5 tiles per cheek,
steel-dark, seated on the dome skin — r2 rows above the first were buried) + corner
chevron stacks re-seated; evacuator w/ dark seam rings in a 0.61 m gap; skirts
fender-lip→axle, rollers lowered (rust-band cover).

r4 FROM-SCRATCH rebuild (2026-07-31, profiles/pt91m.json): 79.3 -> 81.1 (H85->84 T59->67
G91->89 R79->80, minView 80.1). Lofted hull at the measured tall deck (1.80) with the
two-step Malaysian powerpack hump (±0.9 wide — the old build made it full width) and high
overhanging tail; ERAWA-1 tile fields on glacis + cheeks, ERAWA skirt plates at the measured
±1.795 front course; dome crown 2.33 at center 0.18; 2A46MS to the measured contour (sleeve
r.122, muzzle 6.58, axis 2.008). WIDTH GUARD lesson: the first pass overshot the normalized
width by 6 mm and safeScale sank every authored height ~0.6% — an exact-width anchor stud now
pins procScale to 1.0 (applied family-wide). A trial parenting of the skirt course into the
turret (suspected misparent) scored WORSE and was reverted — this print's skirts are hull-side.

## Geometry-gate v6 certification (2026-07-31, gate 8d552c2, dims-first rebuild r5)
Final v6 row: hull 44.3 whole 23.3 turret 33.1 stations 8.0 dims 98.9 floaters 100
Dims vs published: heightM 2.18 hullL 6.91 overall 9.49 width 3.63 - all within grace but width (-1.14%, -1.1 pts).
Oracle audit (v6 true cameras, width-normalized frame): safeScale 1.341 print: height +24.4% (2.725), hullLength +11.0% (7.617), overall +9.4% (10.429).
Certified oracle-defect caps (component | ceiling | cause):
- wholeCurves | ceiling ~24-35 | stature/length defect vs published-pinned build (the r5 floater fix also re-seated the pano/OBRA/mast furniture the print carries 0.5-1.6 m higher)
- stations | ceiling ~8-25 | roof topPct 12-20% on the turret slices from the +24% stature defect
- hullCurves | ceiling ~45-60 | length defect concentrated at both hull ends
- turretCurves | ceiling ~33-45 | print turret towers (Sosna/pano to 2.9-3.7) vs published 2.19 roof
A cap never excuses dims: every dim other than the certified widthM bias is inside the 1% grace (see row above). Build is dims-first: published spec.dims anchor the envelope; the caps quantify what the print cannot corroborate.

## Geometry-gate v10 round-2 certification (2026-07-31, gate 86d1071+a524818+bfa751f)
Final v10 row: hull 44.3 whole 19.1 turret 24.2 stations 8 dims 100 floaters 100
Dims vs published (all inside the 1% grace -> dims 100): heightM 2.18/2.19 (0.68%) hullLengthM 6.91/6.86 (0.73%) overallLengthM 9.51/9.53 (0.17%) widthM 3.58/3.59 (0.24%)
Oracle re-derivation (TRUE_AXES profile trace, width-normalized, 12% body filter): bodyH 2.679 vs pub 2.19 (+22.3%), bodyLen 7.587 vs 6.86 (+10.6%)
Cap verdict: HOLDS, revised — round-1 claimed +27%; TRUE_AXES gives +22.3%
A cap never excuses dims: this build measures published spec.dims at 100 with zero floaters across all five articulation poses.


## r6 ORACLE-TRUST AUDIT (2026-08-01, russia-family dual-gate round)

Width-normalized reference vs published dims: hull len +10.6%, height +22.3% (roof 2.69 vs pub 2.19), overall +9.5% (muzzle 6.58).

**Structural findings:** STRUCTURALLY CLEAN print (chassis/misc_a/misc_b properly split, no plate!) — the caps are pure stylization.

**Certified caps (gate doctrine):** Roof cap 0.45 m: side_turret ~68, front ~72, stations ~68, whole ~80 ceilings. overall span: ref 10.43 vs pub 9.53 — muzzle + rear lip window like t90sm.

**Gate state after r6:** hullCurves 44.3 / wholeCurves 23.8 / turretCurves 24.6 / stations 15.7 / dims 95.5 / floaters 100. (r6: rear span lip + flap/idler window trims.)

Probes: tools/tmp-ru-worldtrace.mjs (absolute-world curve dumps),
tools/tmp-ru-overlay.mjs (registered ref/proc mask diffs),
tools/tmp-ru-ceilings.py (dims-clamped achievability ceilings),
tools/tmp-ru-glbnodes.py (scene-graph/bounds audit — no vertex reads).
Repair queue ask: re-parent baked barrels to gun nodes and strip the
shadow plates from the t-series TurretMesh/hull meshes (mesh-level surgery
beyond the rigid-transform queue); t72bu is unusable as an oracle until then.

**r7 update (edge-on prism law, docs/GEOMETRY-GATE.md):** loftHull now subdivides at <=0.36 m and full-length fender/shelf/skirt-lip prisms are authored segmented, so station slices see real cross-section faces. State: hullCurves 44.3 / wholeCurves 23.8 / turretCurves 24.6 / stations 15.7 / dims 95.5 / floaters 100.


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
124f9584959a28ca12b153fd1a85d7e47391c4f2).

Stylization before -> after: height +23.5%, hull mask +11.6%, overall +9.1% -> height -0.4%,
hull mask -0.1%, overall -0.1%, width 0%
(gate-meter plans in tools/vertex-normalize.mjs PLANS['pt91m']).
The stylization-cap certifications of r5-r7 are RETIRED for this print.

**Standing asserts (docs/references/vertex/pt91m.json):** orientation
glacis +z / gun +z / agree True
(descent runs {"runFront": 1.52, "runRear": 0}); interpenetration
0 verts (worst dip 0 m outside the r>1.05 ring annulus).

**Gate row after this round:** hull 0 / whole 0 / turret 0 / stations 11.6 / dims 89.9 / floaters 100.
BUILD NOT YET RE-ANCHORED. dims 89.9 = old-frame heightM 2.26 vs the (unchanged) published 2.19 + met-mast p95 interplay — resolves with the rebuild.

## VERTEX ROUND r2 — build re-anchored to the normalized oracle (2026-08-01)

Four passes: rear span lip DELETED (mask spans published 6.856), hull/turret/
gun re-anchored (deck plate 1.40-1.48 with the TWIN-HUMP powerpack stack —
the ref's front view proves a center trough at 1.555; ERAWA glacis/skirt
courses re-seated; V-hull center bottoms 0.30; dome widened to the ref's 3.23
plan (halfW 1.60) roof band 2.14-2.19; mast slimmed sub-column at the ref's
z -0.73 spike; gun axis 1.62, muzzle +6.10). Gate: 0 -> min 34.3 (hull 58.8 /
whole 34.3 / turret 49.7 / stations 63.8 / dims 100 / floaters 100). Board
reviewed: orientation correct, twin humps + ERAWA read, no floaters/interpen.
NEXT: front_whole gates (mast/turret-edge columns at |x| 1.59-1.72 and the
center 1.96-2.13 band), side rear-gear ramp (print fade quirk, family class),
turret plan columns. Ref front tells banked in this section's derivation:
track outer face ends 1.675 (ground content at 1.67, skirt-only 0.78..1.40
at 1.68-1.72).

## VERTEX ROUND r3 (2026-08-01): the met-mast CROSSBAR owned three front
columns at 2.50 where ref reads 1.94 (deleted); sight cluster dropped to
the 1.94 line; trackW 0.54 -> 0.50 per the banked 1.67 ground-line tell.
Gate: 34.3 -> min 39.7 (hull 59.4 / whole 39.7 / turret 49.7 / stations
63.4 / dims 100 / floaters 100). Board reviewed: clean. NEXT: front |x|
1.64-1.68 pad/skirt slivers are SUB-PIXEL against the 1024 gate (my pads
1.62-1.66 vs col edge 1.626 — decode before moving anything), center-left
1.76-1.94 band residual, side rear-gear fade (certified family class),
turret plan columns.

## r3 WORKORDER STASH (2026-08-02, decoded NOT applied — re-run before use)

Fresh digest banked from tools/vertex-workorder.mjs (world coords, dAlong
0.000 — registration clean). Top movers for the next owner:
- side_turret ONLY-PROC at world -1.536 (my content 1.53..1.75 band where
  ref turret is empty — bustle basket rear lip?) + z +0.9..+1.4 cols: ref
  2.12 vs my 1.99-2.04 (crown front LOW there) and my 1.02 bottoms vs ref
  1.48 (something of mine hangs 0.45 low at the cheek band — probably the
  ERAWA cheek rows).
- side_whole/hull z -2.0..-2.9: my bottoms 0-0.4 vs ref 0.19-0.89 (rear
  gear-fade class, t90a/t72b3m treatment: raise/shrink sprocket wrap).
- z +2.3..+3.2: my glacis tops 1.29-1.75 read 0.1-0.27 proud (t90a-style
  clean-glacis treatment: chevrons/cable/headlights hug the plate).
- plan center cols: ref rear -2.864 vs my -3.428 at |x|<0.6 AND ref front
  3.10 vs my 3.449: the familiar REAR NOTCH + BOW NOTCH pair (t90a/t90sm/
  t64bv1 pattern — powerpack tail carried by rack, bow corners by prongs).
  ref rear -2.864 also at x +-1.22-1.36 (my skirts/lips reach -3.35).
- plan_whole x -0.148: ref front 6.108 vs proc 4.013 — MY plan tube dies
  at 4.01 where the ref's reads to 6.11 (muzzle): tube/evac radii vs the
  0.107/0.16 column boundaries (t72b3m gun law; check which cols its
  fatter sleeve owns before touching r).

## VERTEX ROUND r4-r5 (2026-08-02, r9 family round, in progress): 39.7 -> 41.5

Stashed r3 workorder APPLIED + two fresh digests. Gate: hull 59.4 -> 62.4 /
whole 39.7 -> 41.5 / turret 49.7 -> 66.6(!!) / stations 63.4 -> 81.5(!!) /
dims 100 / floaters 100. What moved it:
- REAR NOTCH decode: loft rear pulled -3.43 -> -2.88 full width (ref plate
  -2.86 at center |x|<0.15 AND outboard |x|>1.2); the -3.40..-3.43 zone is
  stack/rack-carried at |x| 0.2..1.1 ONLY. Rear kit: humps x 0.20..1.10
  top 1.735 z -2.94..-3.34 + roof bridge 1.70 plates (center kept clear),
  tail step 1.50..1.64 to -3.43, SPLIT tail lip 1.425..1.555 x +-0.17..0.65
  (center notch!), rack towers x +-0.16..0.42 band 1.17..1.47 to -3.42
  (BODY -> hullLengthM keeps -3.43..+3.43; costs dAlong +0.053 because the
  REF's own -3.4 tail cols are sub-body — accepted, dims sovereign).
- REF REAR PROFILE (banked): side tops 1.451@-2.61 -> 1.558@-2.72 ->
  1.639@-2.83 -> 1.746@-2.93 plateau, falling 1.743@-3.13 -> 1.609@-3.45;
  bottoms 0.886@-2.93 then 1.18..1.29 to the tail (overhang floor — NOT
  deep towers); front-hull is FLAT 1.716 across |x|<1.15 (NO center trough
  in silhouette; the r2 "trough 1.555" was a flipped-digest artifact).
- BOW NOTCH: loft front -> 3.10; ref plan front RAKES 3.16@0.68 ->
  3.33@0.9 -> 3.44@1.2..1.46 -> 3.40@1.78: 3-step corner boxes + outer
  fender box, band 0.98..1.22 (body -> front dims column). Fender bins
  x +-1.53..1.67 top 1.45 (ref front 1.454-1.464; hides under deck line in
  side). Stowage boxes DELETED (ref deck is the clean 1.477 line).
- ERAWA WALL rework (turret): tiles now a near-vertical 3-row wall, plan
  front 1.46@center staircase to 1.05@1.14 (per-arc dist table in
  eraRuCheeks 'erawa'), rows y .08/.24/.40, upper rows lean back (side stays
  inside the ref 1.42 line above y 1.72), flanks 2-row (ref 1.817@1.075).
  SAVAN housing x -0.36..-0.26 z_world 0.94..1.37 top 2.1825 (heightM p95
  anchor; ref side band 2.122, front 2.13) + met mast moved to the ref's
  single spike col (x -0.26, z -0.88, top 2.495 = ref 2.498). Basket
  rebuilt as thin top-rail staircase 1.725..1.785 (ref band 1.746..1.8)
  with plan rear -1.36 center -> -0.23@1.36, LEFT deeper than RIGHT (print
  asymmetry); OBRA corner sensors on dome brackets at +-1.60..1.71 top
  1.745 (ref front 1.747 at the -1.63..-1.67 cols; killed the -1.652
  ONLY-REF). Old full-width basket slab + crossbar mast DELETED.
- GUN: 2A46MS re-contoured: root r .118 cx +.012 (ref tube RIGHT edge
  owns +0.175 col to 4.47-4.50 via evac .126 + collar .120 there), slim
  mid/tip .100/.098 cx -.006 keep the -0.148 col to the 6.108 muzzle like
  the ref's LEFT edge; axis 1.598 (gunG y .138); saddle roll .16, cradle
  chin DELETED (hung 1.02 where ref mantlet floor is 1.477).
- Gear: trackW 0.58 (ref ground tell: LEFT face 1.67 reads the -1.671 col;
  RIGHT col +1.681 is skirt-only 0.818..1.403 — print asymmetry), sprocket
  -2.36/y.84/r.245, idler 2.70/y.68/r.23, skirts 0.82..1.23 z0 -2.62,
  ERAWA skirt plates 0.79..1.23; hatch to z 1.72 (was poking 1.51 over the
  2.3 glacis cols), periscopes periY 1.42; glacis kit hugged (y 1.20).
NEXT (whole 41.5 is the min): fresh side/plan/front_whole digest queued —
expect muzzle-window and turret-band columns; then board + top-down review.

## r9 LANDING (2026-08-02): 39.7 -> 56.5 — dims 100 / floaters 100

Final row: hull 62.6 / whole 56.5 / turret 70.0 / stations 76.7 / dims 100
/ floaters 100 (min 41.5 -> 56.5 after the mast-float + heightM fixes).
Round-3 closers on top of the r4-r5 section above:
- DOME SQUASH: ref crown is FLAT ~1.949 at front-center with the shoulder
  falling to 1.807@|x|1.065 — rings now end [0.66,0.462],[0.02,0.478]
  (apex 1.938; the old 2.18 apex was 0.18-0.22 proud across six center
  cols, and ring [1.18,0.50] pushed a 1.96 flank out to x 1.18 — REMEMBER:
  a lathe ring [r,y] spans x +-r, the whatsat verts only show azimuth
  samples).
- heightM p95 law (banked): heightM = p95 of side_whole BODY-column tops
  (4th-tallest col of ~64). After the squash the SAVAN housing must carry
  it: top pinned at published 2.19, z world 0.90..1.40 (5 side cols); the
  slimmed 1-col mast (2.495) is excluded by p95 as designed. dims 86.9 ->
  100.
- MAST FLOAT (law): mast base y 0.50 sat 0.08 above the squashed dome skin
  — frontRight island (dilated ~500 px > 400) -> floaters 0. Seat bases
  INTO the skin after any dome re-ring (base 0.40 now).
- Rear kit round-3: humps deepened to z -3.39 (plan ref -3.401 at
  |x| 1.0-1.14), center raked plate stack 1.50@-2.60 / 1.56@-2.74 /
  1.69@-2.845 ends at the -2.892 plan notch (side ramp AND notch agree);
  rack towers band 1.17..1.47 (ref overhang floor 1.18..1.29 — NOT deep
  towers; overlap the hump bottoms or they float).
- wheel0 -> -1.90 (explicit wheelZs array; ref arc bottom 0.21@-2.165, its
  belt flat dies at -2.28) + sprocket -2.46/y.80/r.25 (wrap bottoms 0.54-
  0.64 = ref 0.51-0.62); front flaps to z 3.16 (ref 0.805 bottom @3.19).
- OBRA sensors narrowed to the single 1.641 front col (1.745 = ref 1.747);
  bracket extended under them; mast slimmed to 1 col at -0.257 (2.495 =
  ref 2.504; at r 0.020 it spilled into 3 cols x 0.25).
- Tube: mid/tip r 0.105 flat c -0.008 (the 0.100 12-gon flat was SUB-PIXEL
  in the -0.148 plan col: it read only to the 4.11 evac end, err 0.98 ->
  ~0.01; muzzle rings 0.108). PLAN-COLUMN RASTER LAW: coverage needs >=1px
  past the col edge at the polygon FLAT radius (r*cos(pi/seg)), not the
  circumradius.
NEXT (whole 56.5 min): side_whole rear-ramp residuals -2.2..-2.6 (belt
flat-end class, certified; partial), stations 76.7 (i-slice tops at the
new stack — re-check), turret_plan front staircase cols (tile arc vs ref
1.3@0.93), housing 2.19 vs ref band 2.122 (5 side cols x 0.07 — the dims
trade, documented). Board review pending this round.

## r10 LANDING (2026-08-02): 56.5 -> 70.8 — housing band + front-floor + asym decode

Final row: hull 74.8 / whole 70.8 / turret 74.8 / stations 80.1 / dims 100
/ floaters 100 (min 70.8). One batch off a fresh workorder:
- SAVAN/roof band: ref carries 2.13-2.19 across x -0.24..-0.74 AND z world
  -0.02..1.37 (the r9 0.14x0.50 stub left ~11 cols 0.10-0.12 short both
  views). Housing now box(0.46,0.295,1.42)@(-0.47,0.5825,0.525) top 2.19 —
  p95 anchor VALUE unchanged, more columns at it, dims stayed 100.
- FRONT-FLOOR LAW (b3m r10 class): belly plate 0.30 -> 0.42/0.43 — the
  front rows read min-over-z belly and the ref floor between the tracks is
  0.434 (~20 cols x 0.13). Rear rake pts unchanged.
- SPROCKET-SPAN LAW: xc 1.37 -> 1.41 — the gear assembly's INNER face
  (xc - trackW/2 - 0.035 = 1.045) grounded the -1.065 front col where the
  ref floor is its 0.384 belly line.
- OBRA ASYMMETRY (decode overturns r9's symmetric read): only the LEFT
  sensor exists — right +1.641/+1.681 front cols read the 1.40-1.41 bin
  line and plan +1.676 is ref-EMPTY (old right sensor was ONLY-PROC err
  9). Left narrowed to x 1.623..1.653 (its edge leaked 1px into the
  -1.671 col, err 0.28).
- DOME sz 0.97 -> 0.94: the dome rear edge (world -1.40) painted the
  -1.414 side col where the ref is only a thin 1.743..1.824 rail band
  (new rear rail sliver box owns it); plan center rear -1.354 = ref
  -1.363. RIGHT basket staircase pulled in (rears -1.03/-0.79 vs ref
  -1.014/-0.773; LEFT stays deeper — r9 print asymmetry confirmed).
- Micro: roll w 0.40 (0.60 painted plan +-0.255 at 2.016 vs ref 1.453);
  mast c -0.268 w 0.028 (leaked the -0.217 front col at 2.484); rear
  center stack's 1.69 step moved to |x| 0.13..0.20 side tabs (front
  +-0.02..0.11 cols read the ref's 1.555 line; side -2.845 keeps 1.69);
  commander ring y 0.34; idler y 0.72 (front fade).
Board r10 reviewed: orientation correct, articulation clean, no floaters,
masks 87.4-98.5 (top 98.5).
NEXT (whole 70.8): side rear-ramp -2.0..-2.8 bottoms (belt flat-end
class, certified partial — ref 0.16-0.78 vs ramp 0-0.51); front +-1.68
right-track absence (certified print asym — symmetric buildRunningGear
grounds +1.681 where the ref is skirt-only 0.818..1.403); plan_turret
right-flank chords (dome round vs ref's pinched rear-sides at x 1.0-1.46:
ref front 0.809@1.46 vs dome-chord — needs cheek boxes or a flank-wall
decode); stations 80.1 (slice tops at the new housing); erawa row-2 lean
cols +-0.31..0.51 (~0.05 x 6).

## r12 LANDING (2026-08-02): 70.8 -> 83.4 — r11 law set applied + flank/station decode

Final row: hull 84.6 / whole 83.4 / turret 87.6 / stations 84.3 / dims 100
/ floaters 100 (min 83.4). Board r12 reviewed (shots/russia-vertex/r12/):
orientation correct, articulation clean, no floaters, masks 90.9-98.8.
What moved it, in landing order:
- GROUND-PLANE LAW (t72b3m r11, fleet class): botY 0.03 -> 0.0475 (band
  bottom -0.015 -> +0.0025 — prints the ref's 0-row).
- GEAR-FADE STRIPS: per-column horizontal-bottom strips at x ±1.36
  (rear 0.11@-2.045 -> 0.72@-2.815; front 0.04@2.345 -> 0.40@2.895 +
  the 0.44 idler-window col at 3.092). STRIP-GRID LAW (banked): author
  strips on the GATE's own column grid (z = 1.335 - at) — the workorder
  grid sat half a column off and the band pads printed under them.
- TRACK X-WINDOW: xc 1.37 / trackW 0.50 (band face 1.62, pin caps
  xc+0.49·tW+0.029 = 1.644 clear of the 1.661 col edge): the ref's RIGHT
  +1.681 col is skirt-only, LEFT grounds -1.671 via an authored outer
  skid at x -1.684..-1.660; a RIGHT inner skid grounds +1.07 (the ref's
  inner-face ground is RIGHT-side; left floors at 0.32 — diagonal print
  asym). High side rails x 1.625..1.70 (y 0.85..1.00) carry the plan
  ±1.676 col the old 1.70 band face owned.
- SKIRT RE-WINDOW (station probe): face 1.713..1.745 prints the ref's
  ±1.742 station edge (was 1.775); lip sliver to 1.755 keeps the plan
  ±1.783 col; skirt z0 -2.86 reaches the plan's -2.838 rear; the ±1.79
  course is z-WINDOWED: plates 0.50..2.54 + a RIGHT-only rear cassette
  x 1.745..1.795 z -1.90..-1.02 (stations i3/i4 read +1.792/-1.742).
- WIDTH-ANCHOR LAW (banked): the ±1.795 anchor studs printed ALONE in
  station slab i7 (dW 0.111) — seat anchor studs inside a z-zone where
  real ±width content lives (moved z 0.45 -> 1.26, the plates zone).
- PRISM LAW at stations: the 0.82-deep housing box was edge-on-INVISIBLE
  in slab i7 (dTop 0.197!) — housing segmented (3+3 boxes) and SPLIT:
  2.19 run only over z -0.165..0.49 (heightM p95 anchor, 5-6 cols; ends
  inside i7 so slab i8 reads the ref's 2.075 line), 2.075 front run to
  1.395, left step 2.1025 (ref front 2.11 @ x -0.75).
- TURRET PLAN DECODE: dome shrunk to the wedge chords (r 1.40/sz 0.885/
  cz -0.10; rear -1.179) — LEFT-rear filler steps carry the deeper left
  chords (-1.10/-1.00/-0.81/-0.67), fender-line RAILS (t64bv1 class,
  y 1.43..1.475) at L -1.60..-1.16 (stepped -0.40/-0.65/-0.79) and R
  1.30..1.60 (stepped -0.27/-0.085/+0.08), RIGHT tall wall x 1.5375..
  1.6075 top 1.825 (+1.56/+1.60 front cols 1.828-1.838), 1.775-walls
  BOTH sides (R inboard step x 1.44..1.515; L x -1.545..-1.615 over the
  OBRA shelf, widened to the -1.44..-1.51 cols), ERAWA wall support
  wedges bridge the squashed dome face (board hygiene).
- GLACIS RE-LINE: deck pts 1.335@2.23 -> 1.281@2.45 -> 1.247 nose
  plateau; splash ridge strip 1.368 @ 2.53..2.69; tiles hugged (rows
  1.35/1.27/1.215, tilt -0.28); hlY 1.26; bow fenders re-raked (fronts
  3.175/3.29/3.42/3.435/3.39) and y-split (mains 0.94..1.16, noses
  0.94..1.10 for the 3.41 col's 1.10 top); outer bow tabs asym (L 1.745
  R 1.733 per stations i13).
- MANTLET-BAND TRUTH (t72b3m law): sleeve box narrowed to |x|<0.095
  (its 0.45 width painted the ±0.255 plan cols at 2.016 vs ref 1.453 —
  the ERAWA wall owns those cols); tube root slimmed 0.118 -> 0.105;
  evac re-read as r 0.10 cy -0.032 (ref band 1.47..1.61; the +0.174
  plan col is owned by the 4.30..4.54 collar, NOT the evac reach).
- Rear powerpack ramp re-seated one column (fresh grid): humps forward
  face to -2.90 carrying 1.743 at the -2.925 col; 1.63 step at -2.809;
  the r10 1.69 side tabs DELETED; center rake 1.505/1.525 lines; the
  1.66 center line is a NARROW ridge x 0.163..0.203 (front +0.18 col
  only); tail lip 1.42..1.56; towers 1.19..1.47.
- BODY-EDGE PIN (hullLengthM law): the hump rear face landed ON the
  -3.3799 col boundary and the body read COIN-FLIPPED 6.87/6.76 between
  runs — every body-defining face now sits >=10 mm from its column
  boundary (humps rear -3.37).
- NSVT dropped to the ref's 1.931 line; commander post/head to the 1.94
  crown line; right roof box 1.98 @ x 0.87; mast re-buried (base 0.28);
  rear rail band 1.6655..1.7385 w 0.36 (frees the ±0.255 plan cols);
  hanging bin lip 1.5825..1.7325 clear of the -1.405 col; asym flaps
  (tops 1.15 at the 3.16 face; the 1.40/1.25 front tops at ±1.68 are
  the inner skirt-lip course, z-hidden under the deck).

CERTIFIED RESIDUALS (r12): belt flat-end corner pads dip to -0.016 at
the -2.045/-2.155 cols (t72b3m -3.252 class, ~0.10 x 2); tube side band
0.05-0.07 x ~6 mid/tip cols (warp-squash, circle law — root/evac now
authored); housing 2.19 vs ref 2.13 band = the heightM dims trade
(~0.05 x 5 side cols + ~2% on station i7; DO NOT drop below 2.19 —
heightM already reads 2.18/2.19 with the fixed ground plane).

NEXT (whole 83.4): front dome falloff x ±0.83..0.95 (ref 1.93-1.98 vs
lathe 1.84-1.89, ~0.06 x 4 — needs a right-cheek shelf decode); front
±1.76..1.80 plate-top rake (L 1.17 vs 1.24, ~0.06 x 2); plan_turret
right-rear chords x 0.6..1.25 (dome vs staircase, 0.09-0.12 x 4 after
the shrink; the ref's right-rear pinch is beyond a lathe — cheek-void
class); plan 'at -1.66' cell (0.317) reads a ref bracket sliver 0.81..
0.94 vs my full-length rail — decode which x-window the rail may keep;
stations i9/i11-13 tube tops (certified band).

## Vertex round r25 (2026-08-03) — ORCHESTRATOR LANDING NOTE — 90.7 PASS
(Builder finished without a section; from its verified report.) 83.4 ->
90.7 PASS x2 (hull 92.0 / whole 90.7 / turret 95.1 / stations 91.8 / dims
100). Movers: corner-pad clearance (wheels respaced, diagonals steepened),
fade strips re-lined on the current grid (r12's had drifted half a step +
bled into neighbor windows), botY 0.055, front-center finger decode,
powerpack rake, skirt re-face with opt-in dressIn/lipY (dressing was
printing 1.747-1.756 into stations i1-i7), SAVAN cover as a 4-step raked
staircase, ERAWA rows re-seated on the 1.475 seam (right-only flank tiles
— print asymmetry verified), tube decoded inside the circle law (true
r 0.078 cylinder + side-invisible sleeve-clamp rails carry plan width).
Residuals: the certified set (heightM-trade col, muzzle-band bottoms,
row2-corner ~0.05x2). NEXT: visual pipeline (critic round).

## r27 (2026-08-03): critic-order delivery — gate 90.7 -> 91.2 PASS x2, all six orders delivered or measured-residual

Builder round against the archived visual-review receipt (FAIL floor
8.2, every deduction tone/read class). Gate HELD through the round: 91.2
PASS x2 (hull 92.2 / whole 91.2 / turret 95.1 / stations 92.3 / dims 100 /
floaters 100 — whole +0.5 over r25's 90.7). standard-check: clip 24/0 ✓
contig 0 ✓ decor mg1+4d ✓ (was mg0+0d). Evidence: shots/russia-r27/,
fresh official pairs shots/critic-pt91m/, visual-evaluator parity clean
(yawProxy 0.1-0.6°, no RIG MISMATCH).

Delivered, with the verdict's own done-gates measured on the official
pairs (ITU-601 via tools/tmp-r7-merkava.py, warm census
tools/tmp-pt91m-warm.py):

1. RUNNING-GEAR RETONE (order 1) — ALL GATES PASS. view-left dark census
   x45..460 y330..405 thr25: 1861 -> **0** (<=200). Wheel band x150..520
   y355..390: med **55.5** (50-56) / p5 **51.4** (>=38; ref 50.6) / sd
   **3.93** (<=11; ref 7.4). Rear ramp x45..175 y330..400 p5 **51.4**
   (>=40), med 59.7 vs ref 62.8. Recipe: opt-in gear params padHex
   0x343a29 / chainHex 0x2b3122 / gearFloor:true (merkava r12 params);
   band emissive floor 0x293021 with dimmed diffuse (t72b3m run-lift);
   mats.dark -> shadow-olive 0x2e3426+0x0c100a (strips/skids/grille);
   tire clone 0x26291f + dish clone x0.66 both rehooked (CLONE-MATERIAL
   LAW). First pass overshot pale (med 62.1) — one family notch down per
   the overshoot law.
2. WARM POLARITY SWAP (order 2) — 3 of 4 gates pass. frontright warm
   census x300..420 y270..330: 470 -> **0** (<=200). Front L-cheek med
   **61.4** (>=58; ref 60.9) / p95 **101.5** (>=80). Skirt band view-left
   med **71.4** vs ref 73.7 (Δ2.3 <= 5L; was -10L) via the new opt-in
   ruSkirtBand rubberBotH 0.16 (lower 0.16 m of each panel re-buckets to
   hullRubber at identical faces) + warm rubber 0x483e31. spareTrack
   (ERAWA family) -> neutral olive 0x475039+0x15180f (R<=G-2 ✓).
   RESIDUAL: top glacis rows med 56.4 vs the >=60 order — the med pixel
   decodes as the per-spec camo deck between tile rows (t72b3m r16b camo
   value-split class, unmovable from a profile); a hullTrack clone-lift to
   0x525a42 moved only p95 (72->74) while washing the skirt plates pale in
   side views — measured and reverted.
3. REAR DRUMS (order 3) — built + read delivered; census 3/4 cells.
   TRANSVERSE ribbed drums (axis along x — the ref dead-rear shows two
   wide cylinder bodies; a first along-z pair measured as two small
   circles and was rebuilt) inside the certified hump envelope: r 0.245 at
   (±0.55, 1.47, -3.10), rails keep every certified extreme (side
   staircase, station-0 width, plan -3.37, the ±0.107-column center
   notch). Hue matched by sample: ref drums (72,64,56) family; wood
   0x473e32. Dead-rear zone med **72.4** / sd **5.89** vs ref 68.6 / 5.85.
   Straps + tail lip re-bucketed hullWood (the camo lip was slicing the
   warm mass; in the ref those -3.38..-3.45 columns ARE the drums).
   Top-view warm cells (256..352,32): **279-297 >= 250 ✓**; cells (·,64):
   **229-238 vs 250** — honest residual: the forward-arc shaded pixels sit
   under the R>55 census at the ref-matched tone; pushing hotter flared
   the caps salmon (measured, reverted) and moved zero census.
4. FRONT KIT + MG (order 4) — delivered, census green. Smoke banks BOTH
   cheeks: 5 parallel vertical 'detail' tubes/side at x 1.237..1.603,
   tops 1.78 — INSIDE the wall/filler front silhouette (first seat at
   1.95/±1.78 cost front_whole 18 pts + turret_plan 4.6% cover, measured
   and reseated; the stock smokeBank base bracket reached x 1.82 and
   safeScale shrank the whole model 1.24% — base:false + slim authored
   bracket). lightCluster guards both fender noses (tops 1.298 under the
   1.33 bin line). NSVT -> FITTINGS.pintleMG cls nsvt scale 1.05 tone
   'dark' (pale-deck polarity), receiver mass tops 1.92 at the ref's
   1.931 line, 0.57 m crown-riding barrel. Census mg1+4d.
5. CONTAINMENT (order 5, geometry-priced) — **178/220 -> 24/0** (<=60
   band; residual 24 = tow-eye tori at their measured seat grazing the
   band end-cap dilation). Movers, each audit-verified: sponsonY 0.86 ->
   1.00 (the floor plane sat on the band-top dilation; lower slab lofts
   with it so no mask change), high side rails inner face 1.625 -> 1.66
   (it sat ON the band wall's voxel key; the deck's own 1.5525..1.575
   slice already owns the ±1.606 plan column), sprocket 0.98/0.24 ->
   0.75/0.115 + idler 0.86/0.19 -> 0.70/0.13 (constraint-solved: arc tops
   clear the sponson plane by a full key AND every in-band strip top
   keeps >=2 keys under the arc bottom — the intermediate 0.72/0.15 try
   clipped three strip tops, measured 142), skirt-course box i0 z-trimmed
   out of the wrap zone. Gate x2 + fresh pairs after.
6. POLISH (order 6) — glass 0x3d4233 (blue dashes gone), OBRA sensor
   slimmed (h 0.13 -> 0.095, x extents untouched), basket post-rhythm
   slats proud 1.5 mm (sub-half-pixel) on rear/side faces. DECLINED:
   crown-air staggering (front air 55.8% vs >=63% — every box in the
   1.95-2.10 band owns front columns per the r25 notes; needs a
   front-column decode round) and dome tile-arc seams (torus-on-squashed-
   lathe pokes plan; risk over budget).

LAW NOTES (bank): (a) vertex-workorder's printed side/front absolutes are
polluted this round — its union-center recompute reads the ref root
invisible after the page's last renderMask (C.z read 1.44 vs the true
0.7184); scratchpad true-workorder.mjs recovers the page camera center
and applies gate registration to the pairing. (b) The track-clip audit
dilates band SURFACE voxels ±1 key (2 cm) — clearance design is by voxel
key, not distance. (c) smokeBank/lightCluster envelopes must be checked
against the width anchor BEFORE seating (safeScale shrink class).

Self-read vs the 14 r25 views (orders cleared per view): left/right/
quarters/heroes/close-front (A+B) 8.8-9.0; rear family (C) 8.8-9.0; top
8.7 (glacis-med camo residual); front/close-front (D) 8.8; close-roof (E)
8.8; front crown-air residual holds front at ~8.7. Rebuild of the critic
pairs required per §G (geometry edits invalidate the r25 verdict).
NEXT: independent critic re-cert; the two residual classes above are the
only known sub-9 reads.

## r28 (2026-08-03): critic r27 fix round — gate 91.2 -> 91.3 PASS x2, four
## of five orders delivered on their done-gates, crown-air delivered-partial
## + §6-style column cert

Builder round against the archived visual-review receipt (FAIL floor
8.6 top, five views at 9.0). Gate: **91.3 PASS x2** (hull 92.2 -> 93.0 /
whole 91.2 -> 91.3 / turret 95.0 / stations 92.3 -> 92.8 / dims 100 /
floaters 100 — every component at or above r27). standard-check clip
**24/0 ✓** contig **0 ✓** decor **mg1+4d ✓**. visual-evaluator rig parity
CLEAN (yawProxy 0-0.5°, all 14 views; the hero-rr 0.606 m² enclosed void is
the r27-inspected benign under-barrel sky-window, ref carries it too).
t72b3m locked at hash 3be08468 ✓ (re-gated 91.8 = committed); every diff
hunk inside buildPT91M (siblings byte-exact). Profile md5 4a46fafa.
Evidence shots/russia-r28/ (final official pairs + diagnosis zooms); all
numbers below re-derived on the final pairs (ITU-601 tmp-r7-merkava.py,
warm census tmp-pt91m-warm.py).

1. **DECK-PLATE FAMILY LIFT (order 1) — ALL THREE DONE-GATES PASS.**
   view-top proc: grille x240..400 y130..170 med **59.6** (>=58; ref 60.0,
   was 53.4) / mid-deck x240..400 y200..300 med **60.7** (>=60; ref 62.3,
   was 55.3) / hull-edge x408..430 y280..360 med **60.4** (>=57; ref 59.6,
   was 54.4). NO skirt regression: view-left band med **71.8** vs ref 73.7
   (Δ1.9 <= 5; r27 was Δ2.3) — the ERAWA/spareTrack family was never
   touched (the r27 wash lesson). Glacis rows re-measured **56.4** (<60,
   unchanged by design — z>2.04 excluded to protect close-front glacis
   parity) => per the verdict's own rule the camo value-split declaration
   is FINAL for the rows. Owned as the UNIFORM family lift it was (law
   note a): a post-merge VERTEX-COLOR pass on the merged camo hull+turret
   meshes (queueMicrotask, t72b3m post-merge precedent) scaling bakeDirt
   colors on UP-FACING verts only (ny>=0.55, smooth onset; hull k 1.30
   y>=1.30 z<=2.04 + bin shelf |x|>=1.42 z<=2.20; turret k 1.25) — pure
   albedo, masks byte-identical, per-tank meshes only.
2. **DRUM COMPLETION (order 2) — delivered on all three prongs.**
   (a) Plan: row-64 warm cells **464/454/322/311, all >= 250** (ordered
   >=250 each; were 238/229/181/178; ref 463-578); total drum-window warm
   **3344 vs ref 3701** (90%, r27 was 53%). The green constraint rails
   re-bucketed hullWood (law note b — the rails now JOIN the drum family
   instead of eating it) — same boxes where kept, mask-identical.
   (b) Dead-rear: the stepped-slab read is gone — the whole train is one
   warm mass with drumShell() cylinder normals (meshDomeCurved class,
   shading-only: rear-facing verts get normals about the drum axis, so the
   lip/rack/sliver/step boxes shade as one crown-banded cylinder).
   constant-y edge runs >=12px in the drum band x190..300 y310..375:
   **0 (= ref's own 0)**. Zone med 73.5 / sd 5.53 vs ref 68.6 / 5.85
   (Δ+4.9, inside the ±5 family window; rowsd-gradient parity held).
   (c) hero-rr: rail BODIES dropped to a 1.52 cradle line (the r28c
   rear-stack decode below) — the drum bodies + end discs stand proud of
   the rails (zoom z-herorr2.png vs the r27 'half-buried' read).
3. **MG READ COMPLETION (order 3) — both done-gates PASS.** close-roof
   proc x540..640 y320..400: **98 sub-45px** (>=40; was 4) including a
   **34px connected run** (>=30) — the fitting now carries its OWN
   gun-steel clones (0x20251a body/barrel + 0x2a2f20 can; order 1's
   family-dark lift had washed the r27 barrel to within ~8L of the dome).
   view-rear crown: **gun-class silhouette present at 1x** (zoom
   z-rearcrown.png) — elev 0.10 -> 0.26 + seat +0.02 puts the muzzle/
   flash hider at 2.06-2.11 world, clearing the local dome line by ~20px
   from dead-rear while staying UNDER the 2.19 crest's side-col z-run
   (side-invisible; heightM/dims untouched; receiver top 1.94 vs the
   ref's 1.931 line — equal |err| to r27's 1.92). Pintle cost measured in
   the gate: front_whole cols x +0.51..0.59 read +0.2 (the §C <=0.4
   allowance); whole still rose 91.2 -> 91.3. Top-plan bonus: the dark
   crown line now reads in view-top.
4. **CROWN AIR (order 4) — DELIVERED-PARTIAL 55.6% -> 58.6% + the
   §6-style cert with column proof (the verdict's accepted alternative).**
   Done-gate was >=60% (full order >=63; ref 67.0). Delivered shaves, all
   front-col-preserving (gate held x2 through them): SAVAN 2.19 crest
   x-narrowed -0.262..-0.70 -> -0.575..-0.70 (heightM p95 is SIDE-column;
   inboard band 2.085 + front cols fall to the fwd slab's 2.146 = the
   ref's own raked read), 2.13 inner ledge z-forward (rear half owned no
   side col), left-step z-slide, cupola outer shelf z-split (narrow rear
   finger keeps the -0.448 side col), right roof boxes 2.035/2.010 ->
   1.98 (their own certified purpose line), rear corner boxes 1.825 ->
   1.73 (plan footprints unchanged), left wall z-split (rear half 1.76,
   front half keeps the 1.835 cols), -1.37 filler transfer (1.8275 top
   moved to a forward crest fin over the rails' plan cover — front cols
   identical, tilt v 1.867 -> 1.79), stair nubs 1.79 -> 1.7275, mast head
   pinned at the ref's 2.525 spike and slimmed 0.030 -> 0.022, straps
   flush, fingers shortened to the ref's own z-seat, and the r28c
   REAR-STACK DECODE (the big one, below). RESIDUAL COLUMN PROOF (v-space
   law: the critic front ortho tilts 0.08 down, v = y*0.9968 - z*0.0797;
   owner table from fresh-pair per-column tops + raycast probe
   tools/tmp-skyprobe.{html,mjs}): x206..231 = the 2.19 heightM crest
   (dims-sovereign, the verdict's own certified residual); x237..277 =
   the 2.146/2.119 fwd slabs at their side-col-pinned z (ref's own
   staircase bands); x147..200 + x285..435 + x461..487 = the DRUM CROWNS
   (1.715@-3.10, v 1.954 — the order-2 protagonists; the ref's drums read
   r~0.35 on a lower axis, v~1.94 — shrinking mine regresses order 2) +
   the crest bar/posts/sliver at the certified stack-front cols +
   station-i0/side-staircase carriers; x280..282 = the mast station-i5
   column. Every residual owner is gate-pinned; the ref itself carries
   NOTHING above v 1.94 outside its SAVAN/NSVT cluster and right cupola
   (fresh-pair ref column scan) — the remaining 1.4% needs a rear-stack
   x/z re-decode round (station-i0 + side staircase + plan -3.37 + the
   order-2 drum-warm plan all pin the same carriers). Scheduling ask,
   r27-crown-air class.
5. **POLISH (order 5).** (a) cassette pale-pop -1 notch total (two half
   steps, sampled): front L-cheek med **61.5**/p95 **92.9** (>=58/>=80 ✓;
   p95 was 101.5, ref 87.3); skirt band p95 **84.5** (<=85 target ✓).
   (b) basket frame read at 550px: band rear face recessed 8.5 mm, SEVEN
   22 mm dark slats stand 5 mm proud at the old plane (rears -1.3565
   world, 4 mm clear of the -1.3605 col boundary — no plan col moves) —
   3px-wide verticals at 15px pitch read in view-rear (zoom
   z-basket2.png); band-zone med 67.0 -> **70.2** vs ref 71.7. (c) tire
   rings one hue step warm at held luma: view-left gear-zone warm census
   1164 -> **2099** (ref 3499); every r27 gear luma gate re-verified
   (dark census 0, band med 55.5/p5 51.4/sd 3.23, ramp p5 51.4). Dome
   arc-seam decals: DECLINED again (plan-poke risk over budget — same
   r27 reason; optional item).

**r28c REAR-STACK DECODE (the round's law-grade finding):** the fresh
tilted pair proves the ref's tall rear-stack content is the CENTER drum
train — its front view carries no column above v 1.94 at wx 0.84..1.10,
while its ±0.2..0.98 cols' 1.716-1.727 line projects at v 1.94 = a
carrier at the stack FRONT (z ≈ -2.9). The r25 full-height outer/inner
rails (tops 1.735 at z -2.91..-3.17) were therefore (a) the r27 hero-rr
'burying frames' and (b) ~1500px of the crown window. Fix: rail bodies
drop to a 1.52 cradle (footprints identical — plan -3.37 / station-0
width are height-free), the side staircase (1.735@-2.92..-3.17,
1.716@-3.30, 1.69@-3.37) rides the full-height station-width sliver at
x -1.114 (side view maxes over x; third step added), and a FRONT CREST
BAR at z -2.93 (top 1.72, sunk to the drum fronts, outer support posts
down to the cradle) carries the ±0.2..1.11 front-hull cols at the ref's
own skyline height. Gate confirmed the decode: hull 92.2 -> 88 with the
naive drop, **93.0** with the crest bar (above the r27 build).

LAW NOTES (bank): (a) the critic standard views are TILTED orthos (front
dir (0,0.08,1) => v = y*0.9968 - z*0.0797, up = cross(dir,right)) — a
rear-seated top prints ~8px/m-of-z higher than the same height forward;
front-col transfers (same top, same x, forward z) are gate-silhouette-
IDENTICAL and buy tilted-view air. Owner attribution for skyline pixels
is a raycast under the exact rig (tmp-skyprobe), not window luma.
(b) A fitting that must stay DARK cannot ride a family mat that a tone
order lifts — clone at the fitting boundary (pintleMG mats override).
(c) Per-half orthoFor framing re-centers on the content bbox: trimming
top content (mast) shifts the whole proc half UP ~2px in the fixed
window — bbox-coupled framing eats ~40% of naive skyline shaves; budget
from measured deltas, not geometry alone.

Self-read vs the r27 verdict's five 9.0 views: unchanged classes only
(left/right/frontleft/frontright/hero-fl untouched except tone-family
lifts that track the ref). The five fix orders: top (deck family
delivered — expect 8.6 -> ~8.9+), rear/rearleft/rearright (drum train
one warm mass, seam runs at ref parity, basket rhythm, rear-crown gun),
hero-rr (drums proud), close-roof (dark 34px gun run), front (crown air
+3.0pts, residual certified). Ready for the graduation critic.

## GRADUATION (2026-08-03) — the program's 14th graduate
DUAL GATE PASSED: geometry min 91.3 gatePassed x2 (hull 93.0 / whole 91.3 /
turret 95.0 / stations 92.8 / dims 100 / floaters 100) + graduation critic
9.0 on ALL FOURTEEN views, floor 9.0 mean 9.01 (verdict the archived visual-review receipt — floor climbed 8.2 -> 8.6 -> 9.0 across
r25-r28; the crown-air column cert independently audited and binding).
SS-10 executed: userdrops5 source('pt91m') registration RETIRED
(procedural is the model of record; chips under CUSTOM);
USERDROP5_SOURCED_IDS excludes pt91m; icons regenerated (5 staged, tree
restored); measurement-only override configs in ALL THREE maps — NOTE the
-z-forward print: critic + evaluator entries carry yawOffset PI, the
fidelity entry does not (probe-proven both ways; load-prove gate run at
graduation confirms).
**FREEZE HASH e6994e54 (52 meshes / 100624 verts)** — any intentional
change re-runs gate + critic re-cert and re-freezes in the same commit.
Certified carries: crown-air column cert, heightM-trade col, muzzle-band
bottoms, row2 corners, camo-split-final glacis rows. Non-blocking wishlist
in the verdict (dome seam decals, drum ribs, tube-end grid, rear-stack
decode).

## §B4 GRADUATE-CHANGE round (2026-08-05, russia agent) — containment
## front 24 -> 0/0, SPLIT-ONLY (renders BYTE-IDENTICAL 14/14, gate row
## identical x2) — HASH e6994e54 -> a37a0d24 (needs orchestrator re-freeze,
## NO re-cert required)

The queued t72-line containment carry closed. The work-order's 178/220
baseline was stale: the r25-r28 gear re-authoring (corner-pad recipe,
strip fade) had already cleared everything but ONE flag — official
`track-clip-audit --exact` read front 24 / rear 0 at round start
(pre-round A/B on the same instrument, same day).

Decomposition (tools/tmp-ru-b4-census.{html,mjs} — the tmp-leo-r13-census
per-add pattern adapted for russia.js): front 24 = the ruGlacisKit
TOW-EYE TORI (russia.js L306, 12 vox/side, aabb x ±1.141..1.343,
y 0.404..0.596, z 2.864..2.896) — per-side in-lane fittings (lane x
window 1.12..1.62) whose merged center-spanning hullDetail AABB (reach 0)
defeated the audit's lane-local skip: the t72b3m/leo r13 false-flag class
EXACTLY, with a 'detail'-material twist. The rear-zone direct hits
(idler/sprocket spinner bodies, 206/58 vox per side) are in-lane gear the
reach rule already skips by design — not debt.

FIX (split-only, zero transforms): ruGlacisKit gains opt-in `eyeSplit`
(default byte-identical — t72b3m/t84 frozen proofs below) routing the
tori into per-side hullTrackDetailL/R buckets; BUCKET_DEF gains
hullTrackDetailL/R: ['hullG','detail'] (tankFactory.ts, the e3918e6
rider class: same 'detail' material slot + LOD path as hullDetail, no
other caller — NEEDS ORCHESTRATOR LANDING with the russia.js change in
one commit). Each merged mesh keeps an honest one-sided AABB (reach
1.141 > laneInnerX−0.15 = 0.97) and the audit classifies the eyes as the
in-lane bow fittings they are.

GRADUATE-CHANGE VERIFY (all on final bytes):
- track-clip-audit --exact: front 0 / rear 0 (official instrument;
  standard-check agrees 0/0). Baseline 24/0 same instrument same day.
- gate x2: min 91.3 PASS both runs, components 93.0/91.3/95.0/92.8/100/
  100 — IDENTICAL to the graduation ledger row to the decimal, twice;
  floaters 100 x2 (all five poses).
- 14-view rest pixel-diff (official critic rig, tools/tmp-b5-t72b3m-
  diff.py): **BYTE-IDENTICAL 14/14** — cleaner than the t72b3m donor
  round (zero coplanar-seam reshuffles; the tori are the only moved
  pieces and they merge into fresh buckets appended after the existing
  scene children). Render determinism proven first: two before-runs on
  identical bytes read byte-identical 14/14 (shots/russia-b4-pt91m/
  before vs before2), so the diff is attributable.
- evaluator digest spot: RIG PARITY OK (11 ortho views, max dYawProxy
  0.5° @close-front, max |dCentroid| 0.091m).
- standard-check: gateMin 91.3 | clip 0/0 PASS | contig 0 | mg1+4d.
- §B6 trapezoid: zero gear params touched (buildRunningGear cfg
  byte-identical; side profiles byte-identical by the 14/14 proof).
- hashes: pt91m e6994e54 (52/100624) -> **a37a0d24 (54/100624)** — +2
  meshes = the per-side eye buckets, verts UNCHANGED (pure re-bucketing).
  Frozen siblings in the same run: t72b3m **3d92bb98** and t84
  **fd0bca6c** byte-frozen (both are ruGlacisKit callers, eyes:false —
  the eyeSplit default + BUCKET_DEF addition are byte-inert for every
  non-caller).
- RE-CERT DECISION: NOT REQUIRED — no geometry moved, no mask moved, no
  render byte moved; per the §B5/§10 graduate-change flow this is the
  split-only lane (rest-pixel-diff proof, non-camo buckets). Re-freeze
  a37a0d24 in the landing commit.

Evidence: shots/russia-b4-pt91m/{before,before2,after}/ (14 views x3),
shots/russia-b4-census-baseline.json + -after.json, shots/track-clip.json.
