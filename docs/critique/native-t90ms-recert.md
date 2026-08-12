# T-90MS first-party re-certification

The active `t90ms` playable is entirely repository-authored procedural
geometry. The comparison model is isolated to measurement and visual review;
no comparison vertices, converted arrays, materials, textures, rig, animation,
or runtime wrapper enter the playable.

## Frozen candidate

- Geometry hash: `59de23ce`
- Meshes / vertices: 53 / 107,956
- Fidelity: 90.91 aggregate, every required silhouette at least 90.34
- Components: whole 91.79, hull 93.77, turret 83.91, gun 92.25, tracks 93.67
- Exact terminal containment: 0 / 0 smooth-band and 0 / 0 individual-shoe
  intersections, front and rear
- Winding: 0 reversed, 0 mixed, one visually null rear-left deficit pixel
- Evidence: `/tmp/critic-t90ms-native-final-r3` contains 42 PNGs with 42
  distinct hashes

## Pixel and ownership review

All fourteen paired directions were inspected. The authored build preserves
the low clipped-diamond fighting compartment, planted cheek and roof-edge
Relikt, compact mantlet and corrected gun run, six large native road wheels,
raised short side cover, tapered bustle, commander panoramic/Kord station,
supported rear cage and backed hull-service field. Procedural simplification
is most visible at the rear and in small roof hardware, but no required view
falls below the native 90 gate.

All twenty-eight yaw frames were inspected. They show a genuine quarter-turn:
gun and mantlet, the connected core and outer skin, every turret protection
course, optics, smoke banks, bustle/lids, panoramic sight, Kord, antenna and
rear cage rotate as one supported package. Glacis, deck, skirts, six-wheel
course, transom and engine-service field remain fixed. The parent-audit
`fitting_spareTrackLinks` nominee is legitimate fixed forward-deck stowage.
The winding audit's rear-deck nominees at z approximately -3.2 are supported
engine/service covers that correctly remain hull-owned when the turret moves.

No fused duplicate turret, stranded turret fitting, empty-air decoration,
donor running gear, open sheet, sky-through wound, or yaw-dependent backface
pop is visible. Keep `59de23ce` as the first-party T-90MS basis and refine its
surface/station density in place; do not restore the superseded comparison-
geometry implementation.
