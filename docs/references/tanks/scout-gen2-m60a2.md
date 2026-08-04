# M60A2 Starship — scout-gen2 reference packet (stub, 2026-07-31)

Scout status: MODEL FOUND: Captain_Ahab_62 m60a2 starship (CC BY) in candidates-gen2/m60a2/

## Published dimensions
| dimension | value |
|---|---|
| overall | ~7.27 m (152 mm gun fwd) |
| hull | 6.95 m |
| width | 3.63 m |
| height | 3.11 m |
| weight | 52.0 t |

> NOTE: overall length verify — figures from secondary references, re-verify against a primary source before the geometry gate.

Dimension sources (secondary military references — cite the specific page at integration):
- https://tank-afv.com/coldwar/US/M60A2.php
- https://www.militaryfactory.com/armor/detail.php?armor_id=805

## Orthographic / blueprint references
- https://www.the-blueprints.com/blueprints/tanks/tanks-m/
(the-blueprints.com links are letter-index pages — pick the exact sheet at integration; most of these tanks have a dedicated sheet there)

## Photo references
- https://commons.wikimedia.org/wiki/Category:M60A2

## Integration checklist (for the fleet program, NOT this scout round)
- [x] geometry gate: model scaled to overall/hull length, width, height above
- [ ] verify overall length against a primary source (7.27 held: dims 98.6-99.6)
- [ ] dual-gate render judgment vs the photo references

## FIRST BUILD — patton r2 (2026-08-04, patton-family builder)
0 -> 80.3 first-light-to-close (hull 87.3 / whole 80.5 / turret 80.3 /
stations 83.1 / dims 98.6 / floaters 100), gate x2 stable. Track clip 0/0,
contiguity 0, mg1+3d fittings census (pintleMG m2 stowed in the open
bustle rack, jerryCans, antennaWhip, towCable — §B3 from birth). Target
was >=75. Profile: `PATTON_PROFILES.m60a2` (buildM60A2 + M60A2_HULL/FIT/
SECTIONS in src/vehicles/profiles/patton.js) — A1-family curveHull/usKit/
loftBody reuse, re-authored in this print's own extract frame (ring py
1.90 pz +0.38; gun axis 2.27 rootZ 1.55).
MEASURED BUILD FRAME (live gate pair, world):
- hull: toe tip +3.415 (thin plates; fat glacis ends +3.31), rear plate
  -3.60, thin flaps to -3.6575, muzzle +3.68 => hullLengthM 7.02 (+1.0%),
  overall 7.34 (+1.0%); deck: bow band 1.66 flat +2.33..+2.95, splash
  1.816@+1.81, 1.787 strip, mid flat 1.863 to -0.62, cambered crown
  2.005@-0.92 -> 2.18@-2.20 -> 1.96@-3.60 (full height |x|<=0.45, wings
  to 1.97@0.95); fenders 2.005 aft at 1.19..1.70 + 1.822 lip + ONE rear
  flap panel pair (x 1.806, z -3.36..-3.64 — mid-hull panels clip the
  climbing top run); track band x 1.2655..1.7655 (trackW 0.50! the print
  reads much narrower than the A1's 0.69), belly 0.58 centre with 0.40
  sponson skids at x 0.98..1.19; gear: idler (2.92, 0.90, 0.26) — ALSO
  the dims front-body anchor via its fat wrap band — sprocket (-3.19,
  1.03, 0.29).
- turret: slab-sided tower xL -1.29 / xR +1.075 (shiftX -0.11) z +1.78..
  -2.04, shoulder roof 2.79-2.80, forehead cliff 2.79 -> 3.115 at z
  +0.60..+0.578, crest plateau 3.135 (x -0.87..+0.30 with bevels + right
  2.99/2.90 steps), sight head 3.357 (z -0.14..+0.02, x +-0.15) = the
  ref's 3.379/-0.125 spike; right bin x 1.08..1.36 z +1.23..-0.20; deep
  basket floor 1.18 z -0.60..+1.30; stepped shield (inner +-0.36 face
  z 2.55, wings +-0.66 z 2.12) pitching with the elliptical 152 sleeve
  (side r 0.148 / plan 0.20), muzzle +3.68.
CERTIFIED-CAP CANDIDATES (report for critic/orchestrator — builder lane):
1. HEIGHT (stylization heightPct +6): ref tower top 3.25-3.39 vs published
  3.11 — proc plateau capped at 3.135 (heightM p95 grace); the residual
  -0.16 on ~8 side + ~10 front columns is the dominant curve tax
  (side_whole/front_whole ~-4 each). A p95-flip hazard is BANKED: >~2.6
  side columns above 3.26 flips heightM to the spike level (a 1-col
  3.29 mast + the head measured heightM 3.29, dims 60.9 — reverted).
2. HULL MASK (+4%): ref toe tip runs to +3.518 and its tail flap to
  -3.708; the launcher tube overlaps every tip column, so the 12%-band
  filter reads them FAT and the body anchor FOLLOWS THE TIP END exactly
  (tip 3.505 measured 7.13/-2.2%) — proc holds 3.415/-3.6575 and eats
  ~2 ref-only side cols per end (side_hull cover 1.16).
3. FUSED-TUBE STATION SKEW (m46-certified class): the oracle's gun is
  fused in its turret node; the two bow slices read its tube while the
  proc gun rig is excluded (i12/i13 topPct 12.5/24.2, both eaten by the
  station trim). Measured decisively: a turret-bucket tube fixes neither
  (hullLengthM's mask INCLUDES turretG -> body 7.13) — the launcher
  stays in the gun rig per §H.
LAW BANK: (a) hullLengthM body mask includes turretG, excludes gunG;
(b) overallLengthM includes EVERY mask pixel (a 0.20-long tow pintle at
-3.80 read overall 7.44); (c) station slab boundaries need the same 15mm
clearance as trace columns (flap panels at -3.52 fed i0 but read the
body); (d) the raw vertex-extract's turret curves can be STALE vs the
live registered pair (extract said cupola-left x -0.39..-0.89; live reads
a centred crest x -0.87..+0.30 — always re-derive from vertex-workorder).
Worst remaining: turret_side/plan ~80 (crest-cap columns + nose/shield
fine shape), stations 83 (i5 4.4 crest-cap slice uncovered once the trim
is spent). Shots: shots/patton-r2/m60a2-*.png; §D evaluator clean
(yawProxy 0.1-2.4°, no RIG MISMATCH).
