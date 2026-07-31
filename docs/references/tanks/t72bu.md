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
