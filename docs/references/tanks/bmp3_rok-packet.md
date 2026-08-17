# bmp3_rok — §5.349 residue packet (UNCOMMITTED-UNSTAGED, 2026-08-17)

ORDERS (handoff §5): (a) floating "cross-antenna" island at yaw 45 (718px
pre-landing), (b) 112px bow-fitting float every side view. Law: §5.265
orphan-flap — chain to real mounts. Ungated id (no-gate FALSE-0 law):
verified by sweep x2 + envelope/track gates instead.

## Baseline verification (task said 7456de28-class, verify live)
- Live @ 6e27a4c8: 27afd3ec (equipment landing had moved it, as anticipated).
- §5.356 hover was live (turret min 1.779 vs hull 1.736 = 4.3 cm real ring
  air, probe receipt); §5.361 landed mid-lane and re-seated it.
- Working PRE baseline @ 896384ed (edits reverted): b29a8f74 (64/82048).

## Attribution (rebuilt instrument, world-rect island scan)
The single pre-landing "cross-antenna" island resolves into THREE real
chained-air defects, all turret-local (seat-independent):
1. WHIPS: radioPair pots stood on 28 cm of air — pot base local 0.63 vs
   turntable top 0.35, outboard of the dome wall (r 1.147 vs 1.02 top) —
   686px y45 island.
2. PINTLE MG: real air at BOTH chain ends — ring bottom 0.7625 vs crown slab
   ~0.71 (5 cm) AND pintle foot 0.87 vs ring cap 0.857 (1.3 cm): the
   floating-cross read (520px y45 + 1745px front-low; this IS the handoff's
   "cross-dipole" shape — a pintle MG seen head-on).
3. PANO DRUM: 1.5 cm air over its base box (533px y45 once resolved).
Plus (b): bow light clusters hovering over the glacis (98px + 26px guard-bar
islands per side view).

## Fixes (addBMP3Turret / buildBMP3ROK only)
- Whip wing shelves box(0.43, 0.055, 0.34) @ (+-0.575, 0.6325, -0.74):
  inner chord buried in the dome upper wall (r 0.67 vs 0.86), outer end
  under the pot bases (bmpt wing-shelf precedent, §B5).
- MG pintle column cylY(0.13, 0.15, 0.19, 14) @ (0.40, 0.795, -0.30):
  chains slab -> ring bore -> fitting foot (0.70..0.89); the MG itself does
  not move (§B3 proud + readable).
- Pano pedestal collar cylY(0.145, 0.155, 0.10, 14) @ (-0.40, 0.80, -0.18).
- Bow light platforms KIT.box(0.24, 0.145, 0.18) @ (+-1.14, 1.3575, 2.87):
  bottoms sunk 2.5 cm into the upper-glacis plate, tops welded to the drum
  bases; §B4-clear 29 cm over the covered-run line, forward of the z 2.52
  sprocket-wrap reach.

## Receipts (tree c13e67c3; after/ + after-run2/ identical view-for-view)
- Islands: y45-side 1340 -> 0 listed (whips+MG+pano+lights ALL seated);
  y0-side 192-class -> 39px sliver; front-low 1745 -> 0.
- Enclosed side totals 2000/1976 = wheel-daylight rows only (unchanged, §B9).
- Track-clip STRICT: 0/0 band, 0/0 shoe.
- §B5: all pieces P.add('turret')/P.add('hull') buckets; y45 receipts show
  seated kit riding the rotated turret.
- Hash: b29a8f74 -> 496f3528 (64 meshes, verts 82048 -> 83086).

## Residuals / not-mine (left, banked)
- y0-top 7830px skirt-bin dash islands: donor buildBMP2 plan-view class
  (byte-held donor; bmp2 guard shows the family class) — foreign surface.
- 620px front-low enclosed bar under the gun saddle between the station
  rings: PRE-EXISTING (identical px in PRE run), not in the orders.
- y45-fql 125px (MG barrel tip / whip fragments at the diagonal) + 39px
  y0 sliver: cm-class, MINOR charter.
