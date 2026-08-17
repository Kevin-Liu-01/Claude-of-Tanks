# type10 — §5.248 GROUND-UP REBUILD PACKET (japan wave, 2026-08-17)

## Order
§5.248 owner order applied to the JAPAN lane: first-party ground-up
rebuild measured against the certified repaired oracle at leclerc
standards. The 08-12 native build had never gated honestly ("the legacy
source-component gate remains an honest incompatible zero").

## Instruments (§5.251 restore receipts)
- Certified oracle RESTORED from history: `git show '952561ea^:...' >`
  public/models/tanks/community/type-10_main_battle_tank_repaired.glb —
  md5 **c3df50a6** (the deterministic semantic repair: Hull / TrackGuards /
  DonorRunningGear / Turret / Gun; .bak untouched). Loads + renders (gate
  rows populated).
- Fresh vertex decode: docs/references/vertex/type10.json — bodyH 2.646
  (-1.3% vs the 2.68 datum), bodyLen 6.72, hullMask 6.774, overall 9.478,
  width 3.169; ring autoPivot [0, 1.596, +0.214]; gun contour bore 1.81,
  sleeved tube r 0.13-0.15, muzzle 6.095; deck/belly corner tables.
- §5.248 re-drop = byte-identical pristine receipt (ATTRIBUTION);
  registration rows mirrored across all four harness maps
  (turretComponentMasks:false documented — internal basket).

## Spec true-up (src/vehicles/modern3.js, receipts in type10.md)
dims 6.79/9.49/3.24/**2.30** -> **6.84/9.49/3.24/2.68** = the 2026-08-10
sovereign datums (vertex-REG pubDims; §5.73-1 P95-ENVELOPE law — heightM
includes the mandatory pano head; t14 3.16 / type99a 2.86 / type90 2.55
precedents). Armor rig synced to the print: turretPivot [0,1.52,+0.21]
(was [0,1.40,-0.12]), gunPivot bore 1.81, barrelLenM 4.57, roofY 1.53.

## Build (buildType10Native2026 — full rewrite, world-frame receipts inline)
- HULL to the print lines: mid deck 1.535 / raised engine deck 1.62 with
  the §B1 transition, two-plane glacis 1.535@2.05 -> 1.36@2.90 -> beak,
  W-shaped plan bow (center prow 3.42 anchor, recessed 3.19 shoulders,
  3.39 fender lobes), raised transom (bottom 0.96) at the 6.84 span,
  RAISED BELLY 0.34 (front-row decode: the print's visible belly line is
  0.337-0.408 — its 0.001 "belly" is the donor track sheet; real Type 10
  hydropneumatic clearance), lower tub side strakes 0.34..0.81, deep
  0.35-hem modular skirts w/ seams+studs, §D width anchors at the print's
  own 0.42-0.60 band.
- GEAR: five R0.35 wheels; terminals at the print's wrap stations — rear
  drive HIGH in the -2.86 bay (y 1.05), idler far/low (2.98, 0.80);
  trackR 0.20/0.21 both ends (the r>=0.23 band-solver malformation
  landmine, re-measured this round: 0.24/0.315 ran the ground segment
  flat to ±2.8); contact pins 2.18/-2.15; SPROCKET-BAY ROOF carved into
  the rear sponson (underside 1.42) so the raised wrap corridor is
  §B4-clear (139 strict voxels measured against the solid 1.115
  underside before the carve).
- TURRET at the print ring [0,1.52,+0.214]: 12-station welded wedge loft
  (nose ±0.28@1.93L, cheek V, ±1.30 walls, tapered bustle to the print's
  -2.15 wall line), crown 2.09 plateau (the print's roof reads 2.03-2.16
  in front rows — the side 2.2-2.29 band is kit), modular side armor to
  ±1.43/1.45 (asymmetric: left rides the 1.60/1.87 lines), CONTINUOUS
  central sight complex x -0.45..+0.10 (gunner housing top 2.604 +
  conduit spine 2.595 + pano pedestal/head 2.68 — the P95 datum carrier,
  pixel-center-trimmed), commander cluster LEFT (cupola ring 2.23 +
  episcopes + flank sight box 2.45 at the print's own -0.61..-0.28
  window), loader ring RIGHT at the 2.27 line, M2 on the low right swing
  mount (§B3 mandatory even though the print carries none — priced), twin
  4-tube smoke banks, LEFT whip mast (solid base 1.98..2.77 + h 1.15 whip
  + raked stay) at the print's ±1.31 front col, RIGHT stowed mast at
  z_w -2.07 on a §B2 rail-stub+arm chain, SLAT-SIDED bustle rack (band
  1.67..2.05 to z_w -2.98, 9 rear + 6 side slats, mesh floor, stowage),
  §B3.1 gun: boot collar + fat sleeved tube (r 0.095/sleeve) + evacuator
  + muzzle REFERENCE COLLAR (r 0.155, world 5.75..6.03) + recessed bore;
  muzzle 6.07 = the 9.49 overall.

## Gate ladder (honest, ×2 at close)
| state | min | components h/st/w/d/f |
|---|---|---|
| BASELINE (08-12 native vs the repaired print) | **0** | 50.3/28.5/32.2/84.3/**0** |
| first full re-lay | 0 | 23.2/74/2.2/94/0 |
| masts seated (floater fixed) | 31 | 41.5/79.6/43.2/100/100 |
| BELLY DECODE (0.34 line) | 68.8 | 77.3/78.5/68.8/100/100 |
| sight-complex/cluster/strips | 73-75.4 | ... |
| §B4 wrap-corridor price | 68.7-69.3 | ... |
| **FINAL ×2 BIT-IDENTICAL** | **69.3** | **77.3/85.4/69.3/100/100** |
Row-JSON md5 **31692002** both runs. Hash **97267188** (62 meshes /
59890 verts) ×2. dims 100 (heightM 2.68/0.02%!, hull 6.88/0.58%, overall
9.55/0.62%, width 3.24/0.11%); floaters 100 (baseline was a REAL
disconnected island — the old mast cluster hung on a 5.5 cm air gap,
found by visibility bisect).

## Reverted / priced experiments (receipts)
1. Raked whip run: spread 3.0+ tops over 4 cols, owned heightM p95 at
   2.76 (dims 92-class) — reverted to vertical (dims 100).
2. R mast seated on the rack rail at z_w -2.35: cleared §B2 but paid the
   -2.375 side col 0.43 vs the print's -2.07 station — re-seated at -2.07
   on a rail-stub chain.
3. SOLID MAST POLES to 3.425 (two attempts, one with lowered L modules):
   75.4→64.2 and 69.3→64.0 — the interpolation halo priced worse than the
   thin-whip flicker both times. Reverted; receipts banked (the thin-whip
   EV is ~0.35 on one col).
4. 08-12-era sponson (solid 1.115 underside): strict track sweep 139
   voxels vs the raised drive wrap — replaced by the bay roof (§B4 law
   outranks the ~5-6 gate points it cost through the corridor moves).
5. Anchor strip at z to 3.17: station i13 wPct 7.29 — re-cut to the
   i11 lobe + low strip (stations 78 -> 85.4-86).

## Certified residuals at 69.3
- front_whole 69.3 binds: mast-col phase/flicker class (±1.31/±1.35,
  0.24-0.37 — the ref masts are solid 1-col reads; my thin whip flickers
  at 1024 and solid poles price worse, receipts above); M2 band ~0.13 x4
  (§B3 mandatory-decoration price, seat lowered to halve it); pano-head
  cols 0.10-0.22 x4 (the §5.73-1 heightM-datum carrier vs the print's
  2.55 front line — dims sovereign); one asymmetric R col at +0.96
  (0.28, attribution open).
- plan cover 3.23 (ref-only cols at the bow-lobe/stern corners) +
  side gun-run smalls (0.09-0.27) — §E-class print features (fused
  DonorRunningGear ground reads).
- The 08-12 board's "direct fidelity 91.41" is a DIFFERENT instrument
  (never the curve gate); this row is the first honest non-zero curve
  line for a first-party type10.

## §B battery (final bytes)
track-clip --exact --strict **0/0 band + 0/0 shoe + 0/0 sweep**
(three-stage fix receipts above); turret-parent stranded 4 = towCable /
driver-periscope glass / stern bags — the kf51 AABB false-flag class
(hull DECK gear under the turret overhang; §B5 letter keeps them
hull-side; yaw-90 evidence shows them static and correct); winding m1
rev 0 / mix 0 (10px 0.01% hairline), m2 clean; §B3.1 bore + collar +
boot ✓; npm test exit 0 at the final live tree.

## Evidence
- before/ (pre-edit tree): shots/japan-wave/before/type10/ (16 views)
- after/: shots/japan-wave/after/type10/ (16) + type10-yaw90/ (16)
- §5.254: before/after PNGs differ (md5-verified front/left/top).

## Owner-landing absorb (5ed4d73c, §5.278)
Tall-antenna intent absorbed (mast + whip to 3.49 + stowed right mast);
winding hygiene absorbed (orientedSlab throughout); prominent terminal
wheels absorbed (sprocket r 0.32 / idler r 0.35 discs at the print's own
high stations); stb1-specific lathe/searchlight changes out of scope.

## Orchestrator items
1. type10's armor FRAME values predate the round (only pivots/barrel/roof
   synced) — armor-value refit out of scope (china §5.258 precedent).
2. tools/tmp-misc3-worldtrace.mjs null-guards suppressed turret rows now
   (type10 class) — committed-path scratch improvement, keep.
3. The +0.96 front col (0.28, right-side-only ground-read asymmetry)
   left open — suspect thrown-side shoe visibility, needs a mask-pixel
   probe.
4. type10b variant builds clean on the new base (hash 77870ef0); its
   §5.248-listed package rode the old 2.30-roof build — variant re-seat
   round suggested (same as type90a).
5. Foreign uncommitted WIP sits in tools/procedural-fidelity.html
   (batch-A row removals — not this lane's; type90/type10 rows verified
   untouched).
