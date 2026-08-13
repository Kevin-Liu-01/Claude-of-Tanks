# Challenger 3 strict-clearance re-certification — 2026-08-12

## Disposition

KEEP the fully repository-authored Challenger 3 and its existing connected
forward-turret correction. This pass changes only hull-owned geometry that
entered the native linked-track corridor. No comparison mesh, source vertex,
converted payload, material, texture, rig or animation is used at runtime.

## Retained turret correction

The standardized elevated-left profile confirms that the broad crown, outer
wall and lower cheeks continue forward to the mantlet instead of ending in a
paper-thin brow behind the gun. At yaw 0 and 90 degrees the complete shell,
gun, bustle, Protector station, sights, smoke/APS equipment and antennas remain
one seated turret-owned assembly. The forward silhouette therefore needs no
second extension or detached applique in this clearance-only round.

## Strict native-course closure

- The rear final-drive sprocket is re-seated below the 1.475 m sponson floor.
- The low inner spine is narrowed inside both shoe lanes.
- The joined upper-hull shoulder keeps its deck contact while its lower return
  is pulled inboard of the linked shoes.
- The forward tow-cable endpoint is moved onto the upper glacis, away from the
  left idler sweep.
- The former 0.30 m fake-AO strip inside each track lane is replaced by a thin
  outboard seam behind the skirt face.

Exact containment is now band front/rear **0/0**, shoes **0/0**, and full
strict sweep **0/0**. Six primary road wheels remain separately readable
between a distinct forward idler and rear drive sprocket in one continuous
native linked course.

## Evidence and audits

- Deterministic freeze: **`564057a4`**, reproduced twice at 62 meshes / 72,471
  vertices.
- Fresh elevated-profile packet: 15 paired + 15 yaw0 + 15 yaw90 frames, **45
  PNGs / 45 distinct hashes**.
- Fresh visual vector:
  `[9.1,9.1,9.0,9.0,9.0,9.0,9.0,9.1,9.2,9.1,9.0,9.2,9.1,9.1]`, floor
  **9.0**, mean **9.07**.
- Quantitative shaded fidelity: **93.02**; every whole direction at least
  **92.17**.
- Turret parent: 0 stranded / 0 abutting / 0 dangling.
- Winding: 0 reversed / 0 mixed; 25 px / 0.04% front-left raster difference,
  with no visible wound or disappearing face; mode 2 clean.
- Rig 10/10, bore, targeted presentation assets and asset binding pass.

The retained legacy curve/component diagnostic is **83.3** (hull 90.6 / whole
90.1 / turret 83.3 / stations 88.6 / dimensions 100 / floaters 100). It is
kept honestly because its old plan masks grade a different aft/edge
registration. The current owner-standard elevated profile, every machine
whole-view score, physical-clearance tests and fresh yaw evidence are the
acceptance authority for this targeted authored correction.
