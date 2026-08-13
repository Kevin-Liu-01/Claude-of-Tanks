# AMX-40 owner-height and strict-clearance re-certification

Date: 2026-08-12
Frozen candidate: `3d312bde` (62 meshes / 98,642 vertices)

## Verdict

**PASS / KEEP.** The active AMX-40 remains entirely repository-authored in
`src/vehicles/france.js`; its local comparison GLB is a read-only measurement
and render oracle. No source mesh, converted vertex/index payload, material,
texture, rig, animation or source-backed runtime wrapper enters the playable
or public build.

Fresh standard-order vector:

`[9.1,9.1,9.0,9.0,9.0,9.0,9.0,9.1,9.2,9.1,9.0,9.2,9.1,9.1]`

Order: front, front-left, left, rear-left, rear, rear-right, right,
front-right, top, hero front-left, hero rear-right, hero top-tilt, close
front, close roof. Floor **9.0**, mean **9.07**.

## Owner corrections

- The connected fighting compartment retains the earlier measured forward
  extension: lower shoulders, cheeks, crown, welds and forward cassettes all
  reach the gun seat together. It is not a barrel translation or detached
  nose plate.
- The complete turret section is now exactly **20% taller** in local Y. The
  shell, cheek/stowage courses, bustle, roof suite and articulated mantlet are
  scaled as one connected authored package. The hull and gun run are not
  stretched.
- Direct smoke banks and the roof MG are re-seated at the same 1.20 datum.
  Elevated profile and yaw evidence show them remaining in contact with their
  cheek/cupola foundations.
- Lower belly shoulders stop inside the shoe inner edge, and concentric
  painted wheel-face/rim/hub courses now carry explicit running-gear
  ownership. Strict track containment improves from band/shoe sweep
  **318/128** to **0/0**, with front and rear also 0/0.

## Evidence and mechanics

Machine fidelity is **92.94** with every whole view at least **91.90**;
components are overall 93.43 / hull 96.39 / turret 85.53 / gun 94.11 /
tracks 96.80. The direct turret component is lower because the oracle mask
encodes the old low section, while the complete owner-ordered silhouette
passes every view.

The final packet at `/tmp/critic-amx40-owner-height-final/amx40` contains 15
paired, 15 yaw0 and 15 yaw90 frames including the standard elevated-left
profile: 45 PNGs / 45 distinct hashes. The shell, mantlet/gun, roof stations,
smoke, MG, optics, antennas, flank modules and rear turret service package
make a genuine quarter-turn. Hull deck, transom, wheels and linked course
remain fixed. The parent nominees `fitting_towCable`,
`fitting_spareTrackLinks` and `hullGlass` are visibly seated hull-owned cable,
deck stowage and driver/periscope geometry, not stranded turret fittings.

Winding is 0 reversed / 0 mixed / 0 deficit pixels. Its mode-2 fixed-deck
candidate is the continuous hull rear/deck field correctly exposed by turret
departure. Rig is 10/10, muzzle bore passes, and all eight presentation assets
are current. The legacy component gate is retained honestly at **51.3**
(hull 90.4 / whole 68.3 / turret 61.9 / stations 51.3 / dimensions 63.5 /
floaters 100) rather than used to undo the explicit owner correction.

No donor running gear, duplicate turret mass, stranded turret fitting,
empty-air decoration, track penetration, open sheet or yaw-dependent wound
is visible. Deterministic freeze `3d312bde` reproduces twice.
