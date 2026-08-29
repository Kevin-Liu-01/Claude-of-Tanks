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
SECTIONS in src/vehicles/profiles/patton.ts) — A1-family curveHull/usKit/
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

## PUSH ROUND — patton family (2026-08-05, patton-family builder)
80.3 -> 86.3 PASS-of-round (x2 stable, runs identical): hull 88.1 / whole
86.3 / turret 91.2 / stations 89.6 / dims 97.9 / floaters 100. Target was
>=88 x2 or the measured ceiling; the ceiling is now MEASURED (below) —
whole saturates at ~87.5 on three certified mechanisms. Track clip 0/0,
contiguity 0, mg1+3d census, turret-parent stranded/dangling 0 (one
REVIEW-tier abutting = the towCable on the hull fender line: deck gear,
correctly hull-parented — leave). npm test clean (265 checks). Frozen
marks byte-identical at every batch: m60a1 81e69e34, m60a3 efcde5c4,
m47_patton 70941de0, m46_patton dfacd57c. New m60a2 hash e0ba7b37
(45 meshes / 71716 verts). Shots: shots/patton-push-a2/m60a2-board.png.

ORDERS DELIVERED (fresh in-page probes, PROBE-FRAME law):
1. Shield/mantlet re-author (§B1 slope-motivates-the-mass): raked mass —
   2.82 top plane to z 2.356, vertical upper face, forward-raked lower lip
   to the plan's 2.56, asymmetric wings (-0.585/+0.570), co-planar dark
   launcher door; SEGMENTED at z 2.10 (§C end-caps, see law d). Killed the
   1.87-2.47 side band (+2.6 turret) and stations i10/i11/i12 tops
   (i11 3.76 -> 0.32, i12 12.4 -> 1.67).
2. Crest §B1 de-staircase: the right shoulder steps + proud loader drum
   replaced by ONE rake (0.42,3.132)->(0.6135,2.99) with a vertical cast
   end-face; plateau left edge to the ref's -0.89 crest corner; rear slope
   ends (-1.16, 2.79). Sight head re-seated on the fresh spike read
   (x -0.27..+0.13, z -0.14..+0.12, 4 side cols = ref parity, heightM p95
   safe at 3.13). Loader hatch is now a flush plateau ring.
3. Basket to the ref's z 1.39/y 1.15 floor (worst turret column 0.366->0.02).
4. Plan nose ARROWHEAD via opt-in loftBody hwL (left cheek rakes (x -0.64,
   z 1.56)->(-1.27, 0.83); right cheek short per ref) + bin re-shape
   (x 1.09..1.385, plan-raked rear, front 1.31) + tube re-seat (center
   x +0.045, near-round plan 0.165, muzzle to the ref's own 3.712 end) —
   plan_turret 84.1 -> 94.6.
5. Width system: fenders to outer 1.760 (curveHull outer = fenderHW+0.005),
   lip 1.782 @ y 1.805, low rear mud boards at 1.8165 (z -2.68..-3.19),
   tapered rear flap bottoms (0.75 @ -3.36 -> 0.93 @ -3.64), front flaps to
   x 1.8155 — widthM 3.64 (+0.18%, was -1.12%), stations widths kept-mean
   ~0.51, front cols +-1.74/1.78/1.81 all on the ref line.
6. Deck-tail notch: deck band ends -3.47 (ref corner), centre carried to
   -3.60 on the widened rear plate — plan_hull tail cols dead (87.1->88.1).
7. Housekeeping: flush driver hatch (opt-in usKit hatchFlush), splash to
   1.801, tow cable to 1.955, lift eye under the crest, louver lift -6mm,
   idler 2.895 (wrap clear of the 3.375 dims-anchor column), contactZF 2.20,
   right decal onto the bin face (was floating 0.115 off the wall).

DIMS TRADES (documented, dims 97.9): muzzle 3.712 => overall 7.36 (+1.22%,
-1.8 dims) buys +1.9 curve pts of muzzle cover; heightM 3.13 (+0.55%, in
grace) with the ref-parity 4-col spike.

MEASURED CEILING (certified-cap candidates, all mechanisms re-verified
this round):
1. BOW TIP (side_whole ~3.9 pts + side_hull cover 2 cols + plan front ring
   ~1.3/plan row): ref tip/flap-front runs to z 3.52-3.54; hullLengthM's
   12%-band filter reads ANY tip column FAT because the launcher tube
   overlaps it (col band = extremes) — front body anchor pinned at 3.375
   (len 7.02, +1.04%; the ref's own body span measures the same 7.02).
   Re-measured dead ends: thin tips, sub-band y-splits, rear-anchor
   retreat (sprocket wrap keeps the rear body col at -3.647).
2. CREST HEIGHT CAP (side_whole ~3.5 incl the p95 term + front_whole ~1.5
   + stations i5 4.3 now riding a trim slot): ref crest 3.24-3.31 over
   x -0.89..+0.20 / z -0.21..-0.80 vs the published-3.11 cap (grace edge
   3.141, plateau authored 3.135).
3. STERN TIP (cover ~0.85/side row): ref flap tips -3.71..-3.73 vs the
   overallLengthM pixel-span cap.
4. STATIONS i13 24.2 (trim slot): ref-side artifact — the fused TurretMesh
   paints NO tube pixels in its own clipped bow slice (probe: window
   [3.0,3.52] refTop 1.64 while [3.52,3.8] shows 2.42) + the certified
   window skew; i12 residual 1.67 is the skew alone.

LAW BANK (this round):
(a) vertex-workorder's plan mode heuristic MIS-PICKS on stub-gun tanks
    (muzzle overhang < the 0.4 thin-end band => both ends read fat): its
    plan rows come out MIRRORED (z_true = K - z_printed). Confirmed against
    landmark meshes; use gate-identical in-page instruments for plan work
    on short-gun vehicles.
(b) The gate's station windows come from 96-COLUMN CENTERS of the side
    hull trace, not pixel extents — each end sits ~half a column (0.04)
    inside the mask. Window-edge margins (2px rule) must be computed
    against the col-center range (the shield face at 2.39 still fed i12,
    whose true window starts 2.372).
(c) §C STATION END-CAPS applies to gunMount slabs too: the 0.66 m shield
    plate painted only its end caps and VANISHED from i11's window (top
    fell to the wing line). Segment <=0.48 m; a z-split of the same plane
    is co-planar and §B1-clean.
(d) curveHull's fender plate outer edge lands at fenderHW + 0.005 (box
    centered (bhw+fhw)/2, width fhw-bhw+0.01) — author boundary columns
    against fenderHW+0.005, not fenderHW.
(e) renderMask-based probes: SIZE is 384 — always derive S from
    sqrt(mask.length); a hardcoded 512 scrambles the buffer into full-lit
    garbage (looks like a posed/rotated model).
(f) heightM p95 re-verified: 4 side spike columns at 3.39 leave heightM at
    the plateau (5th-from-top); the flip threshold is ~4.8 columns.
Worst remaining rows: side_whole 86.3 (mechanisms above), plan_hull 88.1
(bow/stern flap ring), front_whole ~88 (crest band). Everything else >=89.

## FULL-LENGTH FENDER REPAIR (OWNER order, 2026-08-17)

The live Starship only retained the elevated rear engine-deck fender from
`z=-0.60` aft, leaving the idler and six road-wheel stations without a visible
horizontal shelf above the track. The hull now carries a segmented fender run
from the glacis shoulder (`z=+3.30`) through the mid deck and into the existing
high rear course at `z=-0.92`. Each side is buried into the hull band, finished
with a raised outer rail, and backed by short hangers; no plate is turret-owned.

Browser proof covers hero, direct-left, direct-right and top views. The original
single suspension-driven course is preserved. Exact strict track auditing is
byte-identical to the baseline (`front 6`, `rear 0`, sweep `736/580`): the new
fender geometry adds no track or shoe overlap, while the pre-existing low hull
sweep debt remains unchanged.
