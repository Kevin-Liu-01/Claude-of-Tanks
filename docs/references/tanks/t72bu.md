# T-72BU (`t72bu`)

**Exact variant modeled:** T-72BU — the development designation of the
T-90 obr. 1992: T-72B hull + cast turret with full Kontakt-5 wedge fit,
Shtora-1 dazzlers, 1A45 FCS. Renamed T-90 for service. Visually a
K-5 T-72B with Shtora "eyes"; NOT the later T-90A (`t90a`, ESSA fit).

## Corroborated dimensions

| Measure | Value | Sources (2+ independent) |
|---|---|---|
| Hull length | 6.86 m | en.wikipedia.org/wiki/T-90; tank-afv.com/modern/Russia/t-90_mbt.php |
| Overall length (gun forward) | 9.53 m | en.wikipedia.org/wiki/T-90 |
| Width | 3.78 m over skirts | en.wikipedia.org/wiki/T-90 |
| Height | 2.22–2.23 m | en.wikipedia.org/wiki/T-90 |
| Gun | 2A46M 125 mm, tube 6.0 m, mid evacuator, sleeve | en.wikipedia.org/wiki/2A46_125_mm_gun |
| Road wheels | 6, rear sprocket, full skirts | en.wikipedia.org/wiki/T-90 |

## Identity cues

- Turret: cast dome with K-5 wedges front cheeks + roof-edge K-5 row;
  Shtora OTShU-1-7 dazzlers both sides of the gun; cupola right with tall
  sight cluster; bustle basket ring at rear.
- Hull: K-5 glacis wedges; drums + log at rear; T-72 wheels.

## Reference links (links only)

1. https://en.wikipedia.org/wiki/T-90 — obr.1992 identity (CC BY-SA)
2. https://tank-afv.com/modern/Russia/t-90_mbt.php — obr.1992 walk-through
3. https://en.wikipedia.org/wiki/Kontakt-5 — wedge layout

## Local GLB oracle notes

Path: `public/models/tanks/community/recovered/t72bu.glb`
Width-normalized (3.78 m) probe:
- whole 3.78 × 3.58 × 10.89. IMPORTANT: the barrel is parented to the HULL
  node (turretNode '^Turret$' matched only the dome) — ref hull mask spans
  z −5.45…+5.45 including the thin barrel (r ≈ 0.13) out to 5.45.
  That is why the baseline gun component reads 100 (both overhang masks
  empty beyond the union hull bounds); the barrel is effectively scored
  inside the HULL and WHOLE masks.
- hull proper (halfW ≥ 1): z −5.45…+2.6 (≈8.0), deck y ≈ 1.8–1.9 (tall!),
  glacis nose ≈ 1.33, rear 1.86.
- turret (dome only, no gun): z −3.22…+0.84, dome z −1.82…+0.21 halfW
  1.5–1.7, roof ≈ 2.4, sight cluster 2.9, mast to 3.58 at z −2.33; bustle
  basket z −2.1…−3.2 (halfW 0.77–1.11, y→2.2); dome center ≈ −0.8.
- gun axis y ≈ 1.75; muzzle-to-dome-center ≈ 6.25.
Oracle defects: hull-parented barrel; proportionally tall model
(scale 1.23); very long hull.

## Mismatch log

| Date | total | minView | hull | turret | gun | tracks | change |
|---|---|---|---|---|---|---|---|
| 2026-07-30 | 73.8 | 75.4 | 80 | 30 | 100 | 84 | baseline (t90a donor spec, SOVIET template) |
| 2026-07-30 | 74.3 | 80.1 | 79 | 32 | 100 | 84 | donor->standalone: zC -1.425, tall 1.80 deck 8.0 hull, dome 3.35x2.50 +0.575 fwd, muzzle kept just short of oracle hull-parented barrel tip (G stays 100); T capped: oracle upper mask has no gun |
| 2026-07-30 r2 | 74.9 | — | 81 | 32 | 100 | 84 | shaded r2: radial-fin ERA replaced w/ K-5 clamshell + flat flank tiles, Shtora eyes, evac, NSVT, snorkel on deck brackets, drums+log, skirt armor; T still capped by oracle hull-parented barrel |

r3 (shaded-parity r2 items): 74.9 → 75.0. The K-5 kit finally has clamshell VOLUME —
two proud wedge courses per cheek seated on the dome skin with end caps + dark seams,
steel-dark tone; Shtora eyes read as boxed housings w/ glass flanking the mantlet
(r2 geometry existed but sat inside the dome ellipse); evacuator drum + dark seam rings
in a 0.67 m sleeve gap; skirts fender-lip→axle. Turret mask (31.7) still gates the id —
dome re-proportion remains the round-4 item.

r4 FROM-SCRATCH rebuild (2026-07-31, profiles/t72bu.json): 75.0 -> 78.4 (H81->84 T32->37
G100 R84->88, minView 86.1). Lofted hull with the print's hull-parented dome-filler band
(matched as a hull-bucket collar) and overhanging tail rack; wide low dome (the tall-dome
read of the side band was tried across two passes and scored worse — the 2.8-2.9 tops are
the print's sight cluster, kept as the big left cluster box); K-5 + Shtora on the measured
skin; tube to the measured contour (axis 1.715, muzzle 5.448). DOCUMENTED CAP (unchanged):
the oracle's BARREL is hull-parented, so both component masks split the tube across rigs —
G pins at 100 (empty overhang crop) while T stays capped in the 30s; the whole-silhouette
views run 87-94.

## Geometry-gate v6 certification (2026-07-31, gate 8d552c2, dims-first rebuild r5)
Final v6 row: hull 0 whole 0 turret 0 stations 0 dims 100 floaters 100
Dims vs published: ALL <=1% - heightM 2.25 hullL 6.87 overall 9.56 width 3.80.
Oracle audit (v6 true cameras, width-normalized frame): height +30.5% (2.911), hullLength +16.1% (7.967), overall +14.5% (10.909); BARREL FUSED INTO THE HULL MESH.
Certified oracle-defect caps (component | ceiling | cause):
- hullCurves + wholeCurves + turretCurves + stations | ceiling ~0 (all four) | the print's barrel is fused into the hull-node mesh as a SINGLE primitive (repair_oracles inspect: mesh#0 1p spanning x -84.6..143.3 raw - node-level surgery cannot split it; the chieftain5-style regroup needs separate primitives). Under gate v6 the hull-anchored registration inherits the barrel-extended hull span: measured reg dAlong -1.10 m on the side view, which misaligns EVERY column of every row and zeroes the curves and the station slicing. The correct rig is kept (barrel articulates on rig_gun; rig probe green) - matching the defective parenting would break articulation and the floater poses.
A cap never excuses dims: every dim other than the certified widthM bias is inside the 1% grace (see row above). Build is dims-first: published spec.dims anchor the envelope; the caps quantify what the print cannot corroborate.

## Geometry-gate v10 round-2 certification (2026-07-31, gate 86d1071+a524818+bfa751f)
Final v10 row: hull 0 whole 0 turret 0 stations 0 dims 100 floaters 100
Dims vs published (all inside the 1% grace -> dims 100): heightM 2.25/2.23 (1%) hullLengthM 6.87/6.86 (0.09%) overallLengthM 9.53/9.53 (0.04%) widthM 3.75/3.78 (0.9%)
Oracle re-derivation (TRUE_AXES profile trace, width-normalized, 12% body filter): bodyH 2.884 vs pub 2.23 (+29.3%); side-hull body span reads 9.44 (barrel fused into the hull mesh)
Cap verdict: HOLDS — degenerate single-fused-primitive print (batch-3 certification) PLUS +29.3% stature; dims+floaters only
A cap never excuses dims: this build measures published spec.dims at 100 with zero floaters across all five articulation poses.


## r6 ORACLE-TRUST AUDIT (2026-08-01, russia-family dual-gate round)

Width-normalized reference vs published dims: hull len +16.1%, height +29.3%, overall +14.5% — and the hull MESH ITSELF is polluted.

**Structural findings:** Upper hull, BARREL and a full-footprint horizontal shadow PLATE are ONE baked primitive (mesh_324, spans the entire z range incl muzzle +5.45 and plate tail -5.45). Muzzle collar band >0.35 makes the barrel count as hull BODY: ref side-hull body span -3.98..+5.46 (mid +0.74) vs any true tank (~-0.73) => hull-anchored registration is displaced ~1.47 m for EVERY curve row; stations sample air (slices spread over the 10.9 m polluted span). No build can satisfy the curves without hull-parenting phantom geometry at the muzzle.

**Certified caps (gate doctrine):** ALL curve rows + stations structurally capped at ~0 until oracle repair (mesh surgery: split barrel to a gun node, delete plate triangles — beyond the rigid-transform queue). dims 100 / floaters 100 hold.

**Gate state after r6:** hullCurves 0 / wholeCurves 0 / turretCurves 0 / stations 0 / dims 100 / floaters 100. (r5 build retained; NOT worth iterating against this oracle.)

Probes: tools/tmp-ru-worldtrace.mjs (absolute-world curve dumps),
tools/tmp-ru-overlay.mjs (registered ref/proc mask diffs),
tools/tmp-ru-ceilings.py (dims-clamped achievability ceilings),
tools/tmp-ru-glbnodes.py (scene-graph/bounds audit — no vertex reads).
Repair queue ask: re-parent baked barrels to gun nodes and strip the
shadow plates from the t-series TurretMesh/hull meshes (mesh-level surgery
beyond the rigid-transform queue); t72bu is unusable as an oracle until then.

## batch-9 ORACLE REPAIR (2026-08-01, tools/repair_oracles.py REPAIRS['t72bu'])

INDEX SURGERY on mesh_324 (no authored vertex/attribute byte changes; the
prim is re-pointed at trimmed index accessors appended to the bin — loader
normalization frames cannot re-phase). Recipe re-runnable from the pristine
.bak (snapshotted 2026-08-01) and byte-idempotent (re-run + shasum verified).

1. BARREL SPLIT: the fused 2A46M resolved to 29 clean loose components
   (mantlet collar block world x 34.00..40.46 + tube rings + muzzle x
   143.34); no triangle crosses the audited collar station (~x 34), so the
   bisect degenerated to an exact component split — 294 tris moved into a
   new 'GunMesh' under a new 'Gun' node on the print's own Turret pivot
   (attribute rows copied into dedicated accessors). turretNode ^Turret$
   carries the tube on rig_turret (board: barrel yaws with the dome), the
   t62mv1/t64bv1/t72b_1987 barrel-in-turret pattern.
2. PLATE STRIP: 86 shadow components / 200 tris — the full-footprint deck
   AO layer (doubled quads 0.1..0.7 units over the real deck skin, which
   spans below the band and is kept; hull plan footprint verified unchanged
   without them).

DEFECT SIGNATURE ELIMINATED: ref side-hull now spans z −5.47..+2.62 with
body span −5.47..+2.50 (was −5.47..+5.44 / body to +3.85 — the muzzle
counting as hull body); the ref turret mask now carries the tube to +5.44.
Gate before -> after (both 2026-08-01): hull 0 -> 51.4, whole 0 -> 4.8,
stations 0 -> 12.4, turret 0 -> 0 (rows now EXIST — the r5 proc was built
against the dead oracle and its hull-parented gun parity now reads as a
proc defect; next builder pass re-anchors, src-side), dims 100, floaters
100 (unchanged).

UPDATED CEILINGS (tmp-ru-ceilings vs the repaired trace): side_whole 69.7 /
side_turret 52.3 / front_whole 58.4 / stations ~54.7 — THE ORACLE IS
RESURRECTED: was ~0 across every curve row (structurally dead), now
stature-limited only (+29% authored roof — proportions untouched per the
batch-9 scope; the tall print remains an owner-level ceiling decision).

## r7 vs the batch-9-RESURRECTED oracle (2026-08-01)

Batch-9 split the fused 2A46M out of hull mesh_324 into GunMesh under a Gun
node on the print's Turret pivot and stripped the doubled deck shadow layer;
the default gun-token regex resolves the new node, so the loader now keys
hullLengthM correctly. r7 re-seats the proc to the resurrected frame: dome
-0.25 -> -0.72 (ref plan turret front +0.1..+0.3), gun pivot compensated
(world unchanged), bow pulled to the ref's 2.47-2.62 plan front.

**Gate rows (dead-oracle r6 -> post-repair r7):**
hull 51.4 -> 51.4, whole 4.8 -> 0, turret 0 -> 0, stations 12.4 -> 8.6,
dims 100 -> 100, floaters 100 -> 100. Registration is now sane (side
dAlong +0.49 = the print's +16% tail absorbed); the remaining rows are
STATURE-CAPPED, not structural.

**CERTIFIED STATURE CAPS (per-column, worldtrace):**
1. Crown: ref roof 2.84-2.90 over z -0.57..+0.78 (12+ side columns) vs
   published 2.23 (+27%); the build's legal ceiling is 2.25 -> e 0.30-0.41
   per column on side_whole/side_turret. With the p95 term this alone holds
   side_whole/turret under ~40; measured mean 7-8% -> rows 0.
2. Tail: ref hull runs to z -5.47 (published-legal build tail -4.16;
   print +16% long): 5 ref-only columns [1.43..0.29]..[1.52..0.79] plus a
   0.49 m registration bias — hull ceiling ~55-65 (achieved 51.4).
3. Muzzle: ref +5.44 vs the published-overall build's +4.62: 6-7 ref-only
   whole columns (long-print class; overallLengthM 9.53 is sovereign).
Stations: slice 0 sits on the unmatchable tail (wPct 43) — one survives the
trimmed mean; slices 2/5 sit under the proud crown. Ceiling ~55-70.
A cap never excuses dims: dims 100, floaters 100, all four dims <=1.0%.

VERDICT unchanged from r6: this print corroborates STRUCTURE (post-repair)
but its +16%/+27% stature makes every curve row a certified-cap row; do not
chase curves into the build (published dims sovereign).

**r7 update (edge-on prism law, docs/GEOMETRY-GATE.md):** loftHull now subdivides at <=0.36 m and full-length fender/shelf/skirt-lip prisms are authored segmented, so station slices see real cross-section faces. State: hullCurves 51.4 / wholeCurves 0 / turretCurves 0 / stations 8.6 / dims 100 / floaters 100. (hullCurves recovered to 51.4, stations 8.6 — the barrel/plate cover cap (side cover ~18%) still bounds hull ~70 and whole/turret ~0-30; mesh surgery ask stands.)


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
516a09fc9e85cfa01a77d27505ca0ca294e64194).

Stylization before -> after: height +30.0%, hull mask +17.7%, overall +14.2% -> height -0.4%,
hull mask 0%, overall -0.1%, width 0%
(gate-meter plans in tools/vertex-normalize.mjs PLANS['t72bu']).
The stylization-cap certifications of r5-r7 are RETIRED for this print.

**Standing asserts (docs/references/vertex/t72bu.json):** orientation
glacis +z / gun +z / agree True
(descent runs {"runFront": 1.97, "runRear": 0.01}); interpenetration
24 verts (worst dip 0.214 m outside the r>1.05 ring annulus).

**Gate row after this round:** hull 0 / whole 0 / turret 0 / stations 17.8 / dims 98.2 / floaters 100.
BUILD NOT YET RE-ANCHORED (old-frame build vs normalized oracle). The batch-12 warp also rebuilt the stale batch-9 POSITION min/max (loader/camera frames now sane).
