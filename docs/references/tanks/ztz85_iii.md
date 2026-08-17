# ztz85_iii — §5.248 GROUND-UP REBUILD PACKET (china round, 2026-08-17)

## Order
§5.248 owner order: donor-clone (type59 + kit package) replaced by a complete
first-party §K build. Spec true-up per the round brief (overall 9.82 -> 10.28,
Janes bracket).

## Instruments
- Print: public/models/community-candidates/ztz85iii_manako.glb — FUSED
  CC-BY-NC conversion, WHOLE-VIEW ONLY, hull LOW-CONF (ATTRIBUTION §5.248
  batch B). Orientation resolved this round: length on raw X, nose +X ->
  yawOffset -PI/2 (registered in tools/vertex-extract.mjs + the fidelity map).
- Published: docs/references/tanks/scout-gen2-type85.md (tank-afv.com +
  army-guide.com): overall 10.28 gun-fwd / hull 6.33 / width 3.45 /
  height 2.30 / 41.0 t.
- Measure artifacts: docs/references/vertex/ztz85_iii.json (post-yaw-fix).

## Spec true-up (src/vehicles/china.js)
dims: 6.40 / 10.28 / 3.45 / 2.30 (was 6.40 / 9.82 / 3.45 / 2.45)
- silhouetteOverallLengthM 8.43: MUZZLE LAW (type59 precedent) — the tube is
  built to the print's extracted +4.43 muzzle; published 10.28 stays the
  gameplay/UI datum.
- silhouetteHeightM 2.53: t62mv1 DShK-height convention — the mounted W-85
  cluster carries the gate's P95 trace; its columns sit inside the print's
  own 2.5-2.75 roof-cluster band.
- variant() now strips donor-inherited silhouette* keys (t62mv1's
  7.06/9.96/2.74 rows had ridden type59 -> ztz85_iii and were silently
  gating the clone).

## Build (src/vehicles/profiles/china.js — buildZTZ85III)
Ground-up: loftHull station hull (deck 1.41-1.44 flat to the stern, 17-deg
composite glacis, belly 0.375), six-wheel running gear phased to the print's
contact line (-2.88..+1.02, rear sprocket, §B4-clear idler/flap spacing),
full-length fender shelf + 7-bay skirt at the 3.45 width datum, welded
polyMultiLoft turret (near-vertical belt -> raked flat cheeks; roof RAKES
REARWARD per the print: cheek apex 2.30 = published datum, bustle 2.18),
side + rear slat baskets, cupola-right W-85 (compact z-footprint), ISFCS-212
sight box, 2x4 smoke banks, staged radio mast + swept whip, 125 mm with
mid-tube evacuator and §B3.1 muzzle bore, '85-III' flank decals.

## Gate history (tools/geometry-gate.mjs; whole|dims|floaters)
- BASELINE (donor clone vs new print): min 0 — whole 15.3, dims 0, floaters 0
  (shots/china-wave/ztz85_iii-gate-baseline.json)
- first ground-up: whole 83.7, dims 0 (donor silhouette rows), floaters 100
- + orientation/scale/silhouette fixes, muzzle law, mast: 87.4 / 100 / 100
- FINAL (x2 BIT-IDENTICAL consecutive runs): min 87.4 = whole 87.4,
  dims 100, floaters 100 (shots/china-wave/ztz85_iii-gate-final.json)

## Reverted experiments (receipts)
- FAT vertical mast stack: whole 87.4 -> 85.6. REVERTED.
- Print-true AFT-RAKED mast: floaters 0 (thin raked rod breaks pose
  contiguity) + P95 3.93 volatility. REVERTED.
- Stern unditching log at -4.32 (print stern mass): whole 87.4 -> 86.7/87.0
  (its 1.28 line sits under the print's 1.41 band). REVERTED.
- Whip trim 0.95 -> 0.80: part of the -0.4 run-11 regression. REVERTED.

## Residual (documented instrument ceiling)
The print runs ~+9% tall against its own width datum in the turret band
(roof 2.5-2.59, cluster 2.75 vs published 2.30) and carries a 0.2 m-thick
fused mast rod and a gapless solid underbody. Published dims are the ratified
anchor (§K.1 / round brief: prints are WEAK silhouette instruments); the
remaining whole-view gap (87.4 vs 90) is print stylization the published
band forbids chasing. Every other gate component is 100.

## Guards
- type59 donor byte-held: tmp-hashgeo ea1ff837 before AND after (identical).
- type99a byte-held: 7f613788 before AND after (identical).
- Resident china kit (mount/armorCassette/addChineseRoofSuite/addSmokeBanks/
  addRearFuelDrums/addZTZ99AOraclePackage + the type99a profile row):
  byte-identical to HEAD.
- track-clip-audit --exact --strict: 0/0 (band + shoes + sweep).
- npm test: GREEN (final state).
- Final build hash: ztz85_iii b888d2f8 (54 meshes, 73547 verts).

## Evidence
- shots/china-wave/after/ztz85_iii/ — 14-view photoclass + hero/muzzle shots
- shots/china-wave/diag/ztz85_iii-*.png — harness ref|proc overlay masks
- shots/china-wave/ztz85_iii-gate-{baseline,final}.json

## §5.266 FIX ROUND (critic 7.2 -> ordered surgical list, 2026-08-17)
Verdicts context: identity landed (turret reads, family strip PASS); gap =
buried gear + hidden marks + nose doghouse + pale rim + bare lamps.
1. SKIRT RAISE: ruSkirtBand yBot 0.45 -> 0.80 (lip 0.78) — the six-wheel run
   reads side-on (before/after pair shots/china-fix1/).
2. MARKS VISIBLE: the mid-wall seats reseated onto the shell BEHIND the
   turretDark basket backing (the marking ray sees only the 'turret'
   bucket).  Star + both numerals re-authored on the exposed forward flank
   band (census receipts: insignia z +0.48..+0.68, numerals z +0.21..+0.55,
   both sides, below the smoke banks).
3. DOGHOUSE TUCK: saddle box shrunk/lowered (0.58x0.50 proud -> 0.54x0.40
   buried at z 0.36), brow plate deleted, IR pod tucked onto the shoulder.
4. CROWN RIM: crownRimTrim() dark weld-trim band dresses the pale
   polyMultiLoft lip (2 mm proud — mask-neutral).
5. LAMPS: twin guarded pods — brush-guard frames (uprights + wrap bars)
   around the white pair and the IR drum.
6. BASKETS: flank backing slatted open (4 slats, shell carries the mask).
   The REAR backing stays solid: a slatted rear was built and measured -0.3
   on the rear gate view (the print's bustle band is solid) — REVERTED.
Recovery work holding the gate at the raised-skirt state: fender bins up on
the print's 1.40-1.45 line + left-forward bin added, mast-foot junction box,
ISFCS head raised to 2.41 (P95-safe), deep stern corner flaps (§B4-clear),
silhouetteHullLengthM 6.47 row (flap-inclusive trace; print's own 6.49).
End-column 2 cm nudges were tried and REVERTED (-0.1 whole, no dims gain).
GATE: 87.4 held (x2 bit-identical), dims 100, floaters 100; §B4 0/0 strict;
npm test green; donors ea1ff837/7f613788 byte-held.  FINAL HASH: 13f0c8d7.
