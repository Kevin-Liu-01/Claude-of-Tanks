# Leopard 2A7V (`leo2a7v`)

**Exact variant modeled:** Leopard 2A7V, Bundeswehr, 2019+ fit — A7 wedge
turret with 120 mm L/55A1, added frontal hull armor module, deeper side
protection, APU/cooling housings on the rear hull, sensor masts.

## Corroborated dimensions

| Measure | Value | Sources (2+ independent) |
|---|---|---|
| Hull length | 7.72 m | Wikipedia Leopard 2, army-guide Leopard 2A7 |
| Overall length (gun forward) | 10.97 m | Wikipedia Leopard 2 (L/55 variants), armyrecognition 2A7 |
| Width (over armor modules) | ~4.0 m (3.75 base) | armyrecognition 2A7 (4.0 w/ appliqué), spec row |
| Height | 2.64 m roof / ~3.0 over sights | Wikipedia, steelbeasts SBWiki |
| Combat weight | 66.5 t | Wikipedia Leopard 2 (2A7V row), esut.de reporting |
| Gun | 120 mm Rh L/55A1, tube 6.60 m | Wikipedia Leopard 2, KNDS 2A7 materials |
| Running gear | 7 dual road wheels, rear sprocket | Wikipedia Leopard 2 |

## Identity cues

- A7V adds: frontal hull appliqué module (blunter, taller prow), thick modular
  side skirt courses the full hull length, enlarged rear-hull cooling/APU
  boxes, roof-mounted sensor/antenna masts, spare-track rack + rear baskets.
- Turret: A5/A6-family arrowhead wedges + EMES cutout + PERI stalk + crosswind
  mast + full-width bustle rack; tall mast farm at the bustle.
- Gun: L/55A1 — same 6.6 m tube identity as the A6.

## Reference links

1. https://en.wikipedia.org/wiki/Leopard_2 — variant table
2. https://www.armyrecognition.com/military-products/army/main-battle-tanks/main-battle-tanks/leopard-2a7-germany-uk — 2A7 data
3. https://www.kmweg.com / KNDS Leopard 2A7 product page — manufacturer imagery

## Local GLB oracle notes

Path: `public/models/tanks/community/recovered/leo2a7v.glb` (desirefx print;
turret node `desirefx_me_003` = complete upper fighting compartment).
ORACLE PROPORTION NOTE: the print normalizes tall — deck at 2.6-2.9 on a 4.0
width (real deck/width ratio would give ~1.9); everything below matches the
print's own frame, giving deliberately chunky proportions. A mast farm
reaches y 5.5 (turret node) and a second mast lives in the HULL node at
z −2.1..−0.6 topping 3.16-3.24 (front-view hull mask tops 3.45).

Width-normalized probe (ground = 0 after +0.05 shift):

- hull z −5.92..+2.60 (8.52), plan full width ±2.0; deck 2.63-2.74 mid,
  2.74-2.92 rear shoulders (z −4.6..−3.5 rack/APU 2.72-2.92); glacis falls
  1.99@1.9 → 1.50@2.55 (blunt tall prow, hull nose 2.60); rear wall −5.92
  with lower ledge 0.9-1.4 at −5.7..−5.3.
- turret: band z −2.8..+2.6 walls; roof 2.99-3.10 rear-mid (z −2.1..−1.0),
  2.66-2.81 front; wedge falls 2.51@1.2 → 2.32@1.65 → gun; rear basket to
  z −4.6 at 2.58-2.73; masts: 5.55@z −3.93, 5.04@−3.71, 2.99@−3.48.
- turret width (front view upper): ±1.23 (narrower than hull's 4.0 spread).
- gun: axis y≈2.10, muzzle z 5.92 (3.3 m past the 2.60 nose), tube Ø≈0.22.
- tracks: bottom 0, wheels behind full-length deep skirts (side hull bottom
  edge 0-0.15 the whole run); idler ramp z 1.9→2.6 under the prow.

## Mismatch log (before → after per fidelity iteration)

| Date | total | minView | hull | turret | gun | tracks | change |
|---|---|---|---|---|---|---|---|
| 2026-07-30 | 73.3 | 76.7 | 77.7 | 53.2 | 61.8 | 87.5 | baseline (donor leo2a7 canonical + hull kit) |
| 2026-07-30 | 74.0 | — | 78.0 | 47.0 | 88.0 | 85.0 | r1: bespoke build in the print's chunky frame (deep courses, mast farm, L/55A1 at the print's muzzle) |
| 2026-07-30 | 74.4 | — | 81.0 | 40.0 | 85.0 | 83.0 | r2: stepped rear deck, gear ends on the print ramps, hollow sponson gap under a floating deck shell (the print's construction), pivot to the print's low band |
| 2026-07-30 | 74.3 | 77.3 | 80.7 | 39.5 | 84.7 | 83.0 | r3: apex tier raised for 180°-yaw deck clearance + shortened (was a floating canopy over the low bow), bustle rack shortened to the real 1.2 m basket |

TURRET CHANNEL ORACLE CAP (logged per HANDOFF §7): the print's turret node
(`desirefx_me_003`) carries hull-side armor and sponson courses down to
y≈1.9 across z −3.4..+2.4, plus a hull-node mast/plinth at z −2.2..−0.6
topping 3.2 that no sane articulated rig can reproduce (a hull plinth taller
than the turret roof would clip through the yawing shell). The turret score
is committed at ~40; the whole-silhouette views carry the identity. The r3
apex/rack changes traded ~0.1 total for honest articulation — kept.

## GATE-V9 CERTIFIED ORACLE-DEFECT CAP — all curve components + stations (2026-07-31)

Measured via `docs/references/profiles/leo2a7v.json` (mask-trace-1024,
width-normalized to the committed 4.00 m): the desirefx print is
**proportionally defective as a whole**, not merely mis-rigged:

- hull body span reads **8.47 m** vs the published 7.72 m (**+9.7 %**);
- p95 roof plateau reads **3.24 m** vs the published 2.64 m (**+22.7 %**),
  with the bare DECK at ~2.7 m — taller than the entire real vehicle;
- overall length reads 11.83 m vs the published 10.97 m (+7.9 %).

No rigid transform can repair relative proportions (width normalization is
already applied; scaling height would break width). Per the contract, dims
is sovereign: the build (2026-07-31 rebuild) carries the PUBLISHED envelope
— hull ≈7.72, roof 2.64 (EMES-hood anchored, PERI+mast as the spike-column
budget), width 4.00 over the modular skirts, muzzle at the published
overall. Against this oracle every curve row therefore reads a systematic
~0.6-0.9 m band error over most columns (≈11-16 % of the 5.56 m norm):
**hullCurves / wholeCurves / turretCurves / stations are certified
oracle-capped at their measured residuals** (single digits to low tens).
The cap does NOT excuse dims or floaters (both must be 100). Repair queue:
none possible short of re-sourcing a correctly-proportioned print.

### V10 re-verification (2026-07-31, round 2)

Fresh post-batch-6 extraction confirms the certified proportional defect
unchanged: ref box z ±5.93 (11.86 m vs published 10.97), y to 5.56 (mast
farm), hull span/roof unchanged from the v9 numbers. The batch-6 rigid
repair (authored ring origin + plinth carve) fixed articulation only; the
proportions remain unrepairable. Cap STANDS at the measured v10 residuals
(hull 0 / whole 5.9 / turret 0 / stations 5.6); dims + floaters pass
(100/100) — the dims-sovereign rebuild's published envelope held through
the round-2 shared-builder changes.

## Round-3 cap re-verification (2026-07-31, post kit track fix 146d25c)
Re-measured on gate v10 after the kit contact-span/ground-clamp fix and
the family-wide raisedEnds-workaround removal: the certified oracle/print
defect cap STANDS (curve/station rows unchanged at their capped levels)
and dims HOLDS >= 90. No compensation was re-introduced; end wheels are
plain kit-native fits.

## Round-4 BASE-21 MODERNIZATION (2026-08-06, leopard starter round)

### Oracle adjudication (the "why is the ledger row 0" question)
The reference EXISTS and MEASURES (dims/floaters run and hold 100) —
this is NOT a false-0/broken-ref case and gating is legal. The row
reads 0 because the CERTIFIED ORACLE-DEFECT CAP (v9/v10 above) sits at
near-zero residuals: the print is proportionally defective as a whole
(+9.7 % hull span, +22.7 % roof; no rigid transform can repair relative
proportions), so hull/turret curve rows are capped single-digits BY
CEILING. There is no ladder: the certified ceiling IS the current row.
Lane taken per the round orders: photo-class modernization under the
full rulebook, dims-sovereign anchors preserved, gate x2 at close to
prove dims/floaters hold.

### §E RE-SOURCE REQUEST (orchestrator lane; literals)
Request: replace `public/models/tanks/community/recovered/leo2a7v.glb`
(desirefx print) with any correctly-proportioned CC/community 2A7V (or
2A7) print. Acceptance literals, measured in the width-normalized gate
frame (width = 4.00):
- hull mask span 7.72 m ±3 % (print reads 8.47, +9.7 %);
- p95 roof plateau 2.64 m ±4 % (print reads 3.24, +22.7 %);
- overall length 10.97 m ±3 % (print reads 11.83, +7.9 %);
- deck line ≤ 1.9 m at width 4.0 (print bakes 2.6-2.9);
- no hull-node mast/plinth taller than the turret roof (print carries
  one at z −2.2..−0.6 topping 3.2 — un-riggable);
- turret node articulable about a sane ring (the print's turret node
  drags hull-side courses to y≈1.9 across z −3.4..+2.4).
Until then the v10 cap STANDS and the row stays ~0 by ceiling.

### r4 changes (photo class; dims anchors byte-preserved)
- HULL re-laid on the family V3 rig (the v1 slab hull clipped 330/234
  band + 88/102 shoe and read chunky): leopard glacis line with the
  A7V's blunter prow + lower-front appliqué module plate (identity),
  deck staircase 1.60->1.82 to the −3.78 wall / −3.86 lip (hull 7.72),
  deep modular skirts at ±2.00 EXACT hanging to 0.55 (lower wheel
  halves visible — photo class), §B4 lane opt-ins at 1.17 (= track
  inner face 1.20 − 0.03 family clearance; the 1.20 first cut was
  coplanar and voxelized 378/184+146/51), fenders 1.84..1.955, front
  mudguard assembly + fender-hung rear flaps (a4 recipes at this
  frame), APU/cooling housings with §B3 tells (louvre ribs, lid seams,
  latches, intake mesh), rubber tone 0x33352b.
- GEAR: §B6 raised-end geometry at the real Leopard 2 configuration —
  idler {3.40, 1.06, 0.25}, sprocket {−3.26, 1.05, 0.29} (the print
  frame's 0.56/0.64 centers gave a near-flat run); span [2.60, −2.40].
- TURRET kept at the dims-proven wedge fit (shell/roof params
  byte-identical: EMES hood 2.66 = the heightM anchor, PERI 2.90,
  bustle mast) + ring plinth (§B2 slit closure), loader MG3
  FITTINGS.pintleMG mag/two-tone FITTING-SUNK through a mount collar
  (cap under the 2.64 published line — the revolution FITTING-SINK
  law), four low-profile ADS-ready sensor pods at the roof corners
  (body + dark lens + conduit, tops 2.545 < 2.64), cross decals
  re-pinned ON the side-module outer faces (±1.386 — the old ±1.17
  pins were buried inside the wall).
- GUN: L/55A1 len 5.45 -> 5.56 (tube tip world 7.09 over the −3.86
  tail = overall 10.95 / 0.18 %; the v1 constant predated the honest
  ±3.86 hull and read 10.84 = −1.8 dims).

### Close battery (official rigs, final bytes)
- geometry-gate x2 BIT-IDENTICAL:
  min 0 | hull 0 / whole 8.9 / turret 0 / stations 8.5 / dims 100 /
  floaters 100 (x2). dims RECOVERED to 100 (a mid-round muzzle state
  read 98.2); curve/station rows sit inside the certified v10 cap
  regime (pre-round 0/6.2-7.9/0/9.2 — whole/stations moved +1..+2.7
  WITHIN the cap band; the cap covers curve rows only, never dims).
- track-clip --exact: 0/0 band + 0/0 shoe, blind spots 0 (was 330/234 +
  88/102).
- standard-check: contig 0 ✓, decor mg1+0d ✓ (dressing = family kit
  helpers + hand-authored §B3 tells; MG fitting censuses).
- turret-parent: 0/0/0.
- §B5 yaw-90 pair: shots/leo-a7v-r4/after-yaw90 — wedge shell, roof
  farm, MG fitting, ADS pods, rack and plinth yaw as one mass.
- npm test PASS. Geometry record hash 20bc6b30 (40 meshes / 92300
  verts; not a freeze — capped id, no graduation possible under this
  oracle).
- Renders: shots/leo-a7v-r4/{before,after}/ (14 views each) + yaw pair.

### 14-view SELF-READS (photo class; builder reads)
front 8.5 / frontleft 8.6 / left 8.6 / rearleft 8.5 / rear 8.5 /
rearright 8.5 / right 8.6 / frontright 8.6 / top 8.7 / hero-fl 8.6 /
hero-rr 8.5 / hero-toptilt 8.7 / close-front 8.3 / close-roof 8.6.
Weakest named: close-front — the v1-era wedgeTurretShell apex tier
under the gun reads busier than the photo class (the a5/a6 V3 wedge
grammar is finer); candidate for the family wedge-consolidation round.
Mid-hull side band between skirt top (1.30) and deck edge shows the
bare band face on long stretches.

### Residuals
- The certified proportional-defect cap (v9/v10) — re-source per the §E
  literals above is the only path to a measurable ladder.
- wedgeTurretShell apex tier (above).
- Whole/stations rows wobble 6.2..9.5 run-to-run inside the cap band
  (defective-print comparison noise; dims/floaters stable at 100 x2).
