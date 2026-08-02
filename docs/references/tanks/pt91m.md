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
