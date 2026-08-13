# Base T-90 first-party re-certification

The active `t90` playable is entirely repository-authored procedural geometry.
The comparison model is isolated to measurement and visual review; no
comparison vertices, converted arrays, materials, textures, rig, animation or
runtime wrapper enter the playable.

## Frozen candidate

- Geometry hash: `35a932c0`
- Meshes / vertices: 68 / 120,828
- Fidelity: 90.47 aggregate, every required silhouette at least 90.29
- Components: whole 91.77, hull 92.12, turret 82.55, gun 93.27, tracks 95.21
- Exact terminal containment: 0 / 0 smooth-band and 0 / 0 individual-shoe
  intersections, front and rear
- Winding: 0 reversed, 0 mixed and zero render-deficit pixels
- Evidence: `/tmp/critic-t90-native-final-r3` contains 42 PNGs with 42
  distinct hashes

## Geometry and pixel review

The previous under-wheeled, high-sided presentation is retired. The authored
hull now has a narrowed pressure-tub corridor, lifted sponson undersides, a
closed tapered center glacis, restrained mudflaps and supported stern service
reach. Six full-size native road wheels fill one continuous linked-shoe course
without touching the bow, stern, belly or sponson. The low cast turret is
seated on the deck datum and carries irregular planted protection, buried
Shtora, a corrected full-length gun, commander/NSVT/night-sight station,
smoke banks, roof equipment and a supported rear rack.

All fourteen paired directions and all twenty-eight yaw frames were inspected.
They show a genuine quarter-turn: gun and mantlet, complete cast shell,
protection, sights, cupola/NSVT, smoke, antennas and rear turret rack rotate as
one supported package. Glacis, lamps, deck, skirts, service field, wheels and
tracks remain fixed. The parent-audit `fitting_spareTrackLinks` nominee is
legitimate fixed forward-deck stowage revealed when the turret turns.

No fused duplicate turret, stranded turret fitting, empty-air decoration,
donor running gear, open sheet, sky-through wound or yaw-dependent backface
pop is visible. Keep `35a932c0` as the first-party base T-90 and make future
surface or station improvements in place.
