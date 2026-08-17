# t72m1_jaguar — T-72M1 Jaguar (Polish modernization) — oracle packet

## Source
`public/models/community-candidates/t72m1_jaguar_manako.glb` — FUSED
two-mesh conversion (CC-BY-NC, manako), whole-view instrument only
(componentMasks:false). LOCAL-ONLY quarantine (§5.248 batch B; provenance
in docs/ATTRIBUTION.md). Owner identity brief: "Polish modernized T-72M1
(the Jaguar package: new ERA arrangement, thermal sights, RCWS — print is
whole-view; T-72 lineage grammar from russia lane conventions applies but
BUILD FRESH)."

## Registration (orientation TBD resolved this round)
Nose = raw +x (the az-0 render shows a full side profile with the gun on
+x) -> `yawOffset: -Math.PI/2` per the userdrops3 convention receipt
("Nose = raw +X -> yawOffset -90°"), mirrored into all four maps
(procedural-fidelity, tmp-tank-critic, visual-evaluator-page,
vertex-extract). Pre-fix whole rows measured the print sideways
(baseline wholeCurves 15.4).

## Measured lines (vertex-workorder post-fix, absolute world)
- rear extreme -3.29 (log/plate train, tops 0.98-1.46 rising to the deck);
  deck plateau 1.46-1.48 over z -2.66..-1.70; turret bustle band 1.98 over
  z -1.60..-1.07; cast dome band 2.43-2.51 over z -0.33..+1.05 with the MG
  spike 2.78 @ -0.86 (1 col); glacis-over-tube line 1.75-1.77 falling to
  the 0.85-0.90 nose at z 3.60-3.70.
- plan: hull edge ±1.73, fender front corners 3.69 @ |x| 1.02..1.73,
  center glacis nose 3.32-3.48, rear plate -3.27, right-flank snorkel
  sliver x 1.86 z -1.31..-2.02, tube ±0.145 to muzzle ~6.2, evacuator
  bulge to 4.83.

## Published dims (spec true-up applied this round, with sources)
hull 6.86 / overall 9.53 / width 3.59 / height 2.23 — the landed §5.248
REG bracket (classic T-72M1 figures; the old spec's 6.95 hull was the
PT-91 figure and 2.36 height a with-AAMG figure). Gate dims 97.4
(heightM 2.26 / hull 6.88 / overall 9.51 / width 3.58).

## Certified oracle-defect caps (dims never covered)
PRINT-TALL TURRET BAND: the print's dome band reads 2.43-2.51 (+9-12% vs
published 2.23) across ~13 columns. The build pins its crown at 2.25
(inside the 1% grace) and keeps every roof station under the crown per the
pt91m NSVT precedent; the residual ~0.2 m divergence on the dome columns
is the wholeCurves row's principal remaining error and caps it near the
current 90.6-91 (i.e. the row PASSES but cannot chase the print higher
without failing dims — measured both ways this round: a crown-matching
build read heightM 2.49-2.50 -> dims 0).

## Reported normalize plan (orchestrator lane; warp law v2)
y-scale the print's turret band 2.43-2.51 -> 2.21-2.25 (factor ~0.91 above
the 1.98 bustle line) so the dome columns measure the published vehicle;
length/width are already ~true at the loader's width normalization.

## Gate close (round 1, ×2 bit-identical) — PASS
wholeCurves 90.6 | dims 97.4 | floaters 100 -> min 90.6 PASS (hull /
turret / stations vacuous: fused print, componentMasks:false — §K.3 "fused
references remain whole-mask only"). Audits: track-clip --exact --strict
0/0+0/0; turret-parent 0/0/0; standard-check contig 0 holes (bow
fender-slot floors added as REAL dark plates after the v2 hole scan proved
it hides /shadow/ meshes — per-harness law receipt; both plates cleared by
the strict sweep), census mg1+6d.

## Build notes (ground-up §5.248 rebuild)
buildT72M1Jaguar in src/vehicles/profiles/poland.js — fresh loftHull to
the measured whole lines (NOT buildT72B87Native; russia-lane grammar
reused: loftHull/ruSkirtBand/ruGlacisKit/ruDeck/ruBoot/tubeGun/
meshDomeCurved), T-72 six-pair running gear with dished faces
(suspension-owned §B4 meshes), ERAWA-1 glacis course + ERAWA-2 cheek
wedges (the Jaguar ERA arrangement), PCO KLW-1 Asteria thermal sight,
low-slung shoulder RCWS (pt91m height-law precedent), snorkel on the
right flank at the print's own sliver, unditching log at the rear
extreme, 2A46M with evacuator (dia 0.28 — §D razor-band: the first 0.34
evacuator made hullLengthM read the tube as body, 8.55), muzzleBore.
Rig: turretPivot [0,1.40,-0.02], gunPivot [0,0.24,0.52], barrel 5.74
(muzzle world 6.24 = -3.29 + 9.53).

## Law-bank notes
- p95 4-COLUMN LAW refined: heightM = p95 of body-column tops ≈ the
  4th-from-top column — EVERY station (MG, cupola, ring, whip) must
  either stay under published+1% or fit the shared <=3-4 column window;
  receipts: MG runs read heightM 2.49/2.50; a single antenna stub owned
  pl01's p95 at 2.89.
- Evacuator/boot diameters interact with the 12% body filter: dia >=0.30
  on a 2.5-governing-height tank turns tube columns into body columns.
