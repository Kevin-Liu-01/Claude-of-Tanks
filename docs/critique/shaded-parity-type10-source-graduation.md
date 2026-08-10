# Type 10 owner-source graduation — independent §B8 verdict

Date: 2026-08-10
Vehicle: `type10`
Verdict: **PASS / KEEP**

## Frozen receipts

- Geometry freeze: `84f5d108` / 25 meshes / 184,760 vertices.
- Gate JSON SHA-256:
  `9cfc8bc9b296119d52e46fbfed027ce19541102d518c9b354ff80b41dfecece9`.
- Gate: **94.6** | hull 94.6 / whole 95.1 / turret 96.6 / stations 99.9 /
  dims 96.7 / floaters 100.
- Direct fidelity: **97.4** | hull 97 / turret 100 / gun 100 / gear 91.

## Fourteen-view scorecard

Standard order is front, front-left, left, rear-left, rear, rear-right, right,
front-right, top, hero front-left, hero rear-right, hero top-tilt, close front,
close roof.

`[9.6, 9.5, 9.2, 9.3, 9.6, 9.3, 9.2, 9.4, 9.8, 9.4, 9.4, 9.8, 9.4, 9.8]`

Floor **9.2**; mean **9.48**. Every required view clears the 9.0 law.

## Geometry and attachment verdict

The source upper is coherent in every view. The turret, gun, bustle, roof
weapon, sights, cupola and antenna courses rotate together and remain visibly
seated at yaw 0 and yaw 90. There are no unsupported fittings, empty-air
seams, turret/hull collisions or stationary duplicate turret masses.

The playable correctly uses five Type 10 road-wheel stations per side plus a
front idler and rear sprocket. One game-native linked-shoe belt has a grounded
contact run and continuous terminal wraps. The donor track and donor
wheel/end-drum sets are absent, and the source guards do not intersect the
native belt.

Winding mode 2's `rig_hull/mesh#17` candidate is an adjudicated false
positive: it is the source-exact engine-deck/stern service course behind the
ring, continuous with the fixed stern grilles and deck. It correctly stays
with the hull while the turret rotates and has no detached island or floater.

All fourteen current live pairs and both yaw sittings were inspected from the
frozen root server. Browser console health: zero warnings/errors. **Keep the
complete source rebuild and native-track replacement.**
