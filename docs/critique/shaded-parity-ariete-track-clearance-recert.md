# C1 Ariete strict-track and yaw-envelope re-certification

## Scope and provenance

The runtime remains the preferred repository-authored `buildAriete` profile.
All playable geometry is assembled from our procedural primitives and fittings.
The local comparison model is a read-only visual oracle; no source vertices,
indices, textures, materials, nodes, animation or converted payload ships.

## Mechanical closure

- Retired the ten static front-wrap hull wedges that duplicated and crossed
  the moving linked shoes.
- Preserved the front idler, seven large road wheels, support rollers,
  suspension, rear final-drive sprocket and single continuous native course.
- Assigned wheel faces, dish recesses, hubs and torsion arms to explicit
  running-gear ownership; ordinary hull armor remains fully linted.
- Raised the two bow lights and aft exhaust stain clear of the terminal wraps.
- Moved the hull deck roll and spare links outside the turret/basket yaw sweep.

Exact strict containment is band front/rear **0/0**, shoes front/rear **0/0**,
and full sweep band/shoes **0/0**. Parent audit is 0/0/0, contiguity is zero,
model-rig is 10/10 and winding has no visible wound.

## Evidence and disposition

Freeze `a7b1fd05` reproduces twice at 51 meshes / 100,011 vertices. Evidence
in `/private/tmp/ariete-clearance-final-r2/ariete` contains 15 paired, 15 yaw0
and 15 yaw90 views including the elevated-left profile: 45 PNGs / 45 distinct
hashes. The mandatory semantic vector is
`[9.2,9.2,9.1,9.0,9.0,9.0,9.1,9.2,9.2,9.3,9.1,9.3,9.2,9.2]`, floor 9.0,
mean 9.14. Quantitative fidelity is 94.0 and every available view is >=90.

Yaw proves the gun/mantlet, complete turret shell, roof stations, GALIX banks,
antennas and supported rear basket rotate together. Hull deck stowage, the
cleared seven-wheel course and the rear service field remain fixed. No fused
duplicate, stranded fitting, empty-air decoration, open sheet or sky hole is
visible.

## 2026-08-13 terminal-identity supersession

The strict course remained mechanically correct, but the high terminal faces
could disappear into the dark linked-shoe wraps at ordinary side scale. The
repository-authored profile now adds concentric painted/dark front-idler and
rear-final-drive faces at the established carrier centers. The seven road
wheels, their cadence, the linked course and all hull armor remain unchanged.

Freeze `c0aa8658` reproduces twice at 51 meshes / 104,955 vertices. Fresh
evidence in `/private/tmp/modern-drift-final-r3/ariete` contains 15 paired,
15 yaw0 and 15 yaw90 frames: 45 PNGs / 45 distinct hashes, no identical yaw
pair. Exact band, shoe and full sweep clearance remains 0/0, parent audit is
0/0/0, winding is visually clean and the muzzle passes. Elevated profile and
close views now show the required front idler, seven road wheels and rear
final drive as separate assemblies. All remain fixed while the complete gun,
turret, roof suite and basket execute a genuine quarter-turn with no stranded
or floating equipment.

PASS / KEEP `c0aa8658`; retire `a7b1fd05`.
