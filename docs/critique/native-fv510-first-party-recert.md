# FV510 Warrior first-party re-certification

Date: 2026-08-12

Active build: `fv510PhotoBuild`

Freeze: `61023726` (70 meshes / 59,949 vertices)

Disposition: **PASS / KEEP**

## Provenance

The active FV510 is authored entirely from repository primitives, fittings and
the native running-gear generator. The comparison GLB is an isolated visual
and measurement oracle only. Historical source-baked freezes `7884762a` and
`927beeb2` are retired as playables.

## Quantitative and render evidence

- Procedural fidelity **90.84**, minimum whole view **90.12**.
- Components: overall 90.54, hull 91.04, turret 84.45, gun 100.0, tracks
  93.73. The direct-turret deduction follows the fused oracle component split;
  it does not contradict the passing whole views.
- Exact native track: band 0/0 and shoes 0/0.
- Plan holes 0; muzzle bore PASS; decoration `mg1+15d`.
- Final packet: `/tmp/critic-fv510-native-final-r9/fv510`, 42 PNGs / 42
  distinct hashes.
- Fixed vector:
  `[9.1,9.2,9.1,9.0,9.0,9.0,9.1,9.2,9.2,9.2,9.1,9.2,9.1,9.2]`;
  floor **9.0**, mean **9.11**.

## Ownership and load paths

All yaw pairs show a genuine quarter-turn. The RARDEN gun/mantlet, full
turret, roof sights, hatches, smoke, MG, antennae and turret service fittings
rotate together. The prow, driver deck, engine deck, side slat package, rear
door/service field and complete six-wheel linked course remain fixed. The
parent nominee `hullGlass` is a legitimate fixed driver/periscope strip seated
directly on the hull deck; it is not stranded turret equipment.

All visible equipment terminates in an armor face, pad, collar, bracket, slat
return or deck seat. No fused duplicate turret, empty-air decoration, stranded
fitting, donor running gear or visible collision remains.

## Render truth and legacy gate

Winding census is 0 reversed / 0 mixed. The 655-pixel/0.61% rear-quarter
FrontSide difference is confined to thin slat/rail regions, remains stable
through yaw and creates no disappearing face, open sheet, background wound or
silhouette tear.

The legacy geometry gate is incompatible with this independent authored
builder and remains honestly red: hull 18.3 / whole 9.0 / turret 42.7 /
stations 68.8 / dimensions 0 / floaters 0. It is committed as evidence of the
retired source-component registration, not used to reshape the playable toward
copied topology.

**Final verdict: KEEP `61023726`.**
