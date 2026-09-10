# Ironworks service court

This is a limited layout/contact improvement, not completion of Ironworks or
the thirty-map environment pass. The wider scene still needs denser, better
composed activity areas. The new ground treatment reads as lightly worn turf,
not a gravel hardstand; storage containers still need richer surface detail.

## Runtime change

Six existing accepted plan entries (2/3/4/5/7/9: container row, gantry, stack,
shed, factory, warehouse) form a rail-side service court. Their original
geometry, UVs, vertex colors, emission masks and collision profiles are reused.
The operation runs once, after seeded dressing and before geometry merging
and spatial indexing. No building is rebuilt and no random draw is added.

Placement is atomic. Actual plinths, crane feet, dock and entry thresholds
are sampled at at most one-metre spacing. Supports must retain 3 cm of ground
embed and exposed top; containers have a separate 12 cm maximum burial limit.
These are authored contact tolerances, not a claim of continuous collision
proof between samples. Existing terrain is not flattened or stretched.
Roads, water, vegetation, spawns, existing props and rail ballast are checked.

The same movement/shell records and minimap feature references move with each
donor. Only six original foundation-decal vertex windows are reconformed to
their new ground; normals and bounds refresh, replacement geometry is disposed.
Night apertures use transformed vertices and preserve their existing masks.
Unrelated old-site clutter stays where it was; no props are deleted to make room.

Three bounded irregular polygons add wear through the existing terrain mask
alpha channel. Road/rut/water RGB and existing road/water alpha remain exact.
No terrain heights, roads, water physics, spawn layout, material families,
textures, per-frame work or draw owners are added by this court.

## Verification

- The complete producer retains all 42 original accepted plan geometries,
  original poses, random streams and storage before relocation. Only the six
  donors change, through exact rigid transforms, alongside their collision
  bands and six 55-vertex/90-triangle foundation windows.
- Actual donor geometry: 365 parts, 9,454 vertices, 14,484 indices, 334,088
  attribute/index bytes, unchanged. All non-donor bucket geometry, instance
  matrices/colors, material/texture descriptors and disposal-owner counts match.
- Original and current terrain agree at 2,048 physical-query sample locations.
  Actual desktop/mobile 512/256 masks change only 562/143 alpha texels within
  the authored wear footprints; storage and protected channels match.
- Missing/duplicate donors, invalid or wet ground, occupied sites, tree/crown,
  spawn, road and rail conflicts fail without partially mutating the scene.
- Nine focused tests, TypeScript/core-unused checks, strict new-helper metrics
  and public build pass. Two pre-existing Autumn palette tests were repaired
  to explicitly guard the already-published birch/aspen atlas flags while
  retaining the original color/config/pixel reference hashes.
- The final test-only cleanup reran the complete producer and explicit scoped
  Doctor: both pass, with zero test-file warnings. Runtime source pins, donor
  budgets, mask results and owner counts remain unchanged. The earlier broader
  Doctor inventory also reported an existing non-null assertion in `props.ts`;
  this court does not change or suppress it.

## Native evidence and cost limits

Six original 1440x900 Chrome images compare three identical cameras against
`d46da09ea`: establishing, court-ground and reverse. Both sources use their
ordinary production builds, normal map/texture/grass readiness, matching
quality/GPU settings and no geometry injection. Root and independent review
accepted the narrower grouping/contact improvement. No WebGL errors or lost
contexts were recorded. Some feet are occluded in the images; the sampled
geometry test covers those contacts.

Across all three views, props geometry/material/texture/mesh owners, instances,
logical triangles and observed typed backing bytes have zero A/B deltas.
Whole-renderer geometry/texture/program residency also matches per view.
These are resource observations, not heap/GPU-byte or FPS certification.
The postprocessing tail's `renderer.info.render` counter is not a whole-frame
draw-call measurement. A single headless composition sample took about 5 ms
at construction; that is not a timing regression gate. Small construction
bookkeeping and diagnostic receipts are not represented by geometry-byte counts.

The accepted native baseline exactly matches the checked-in decoded Foundry
collision shard. The candidate changes only six movement obstacles and 53
shell bands, all through the corresponding donor transform. Concealment and
all 921 destructible records stay exact. The Foundry shard and index are
regenerated from those same native records; the other 29 shards are unchanged.
The maintained signaling, dedicated-world-collision and collision-memory
selftests all pass against this generated shard with stable source inputs.
That covers headless census/cache/lifecycle behavior, not deployed multiplayer
latency, browser driving or whole-game memory use.

Local evidence root:
`/Users/kevinliu/.codex/visualizations/2026/environment-recovery-20260907/`

- `foundry-service-inventory-r1.jmdtB3`: actual original donor inventory.
- `foundry-support-sites-r1.g7QkQ7`: current-ground support-site evaluation.
- `foundry-service-focused-r2.cJn9XZ`: complete producer/contact proof.
- `foundry-service-court-checks-r3.QAjY89`: all checks and public build.
- `foundry-service-test-cleanup-r1.NJWiqo`: final focused test and clean scoped
  Doctor, with unchanged runtime pins.
- `foundry-service-court-native-r1.IpZnSK`: six originals, source/build pins,
  native resource/collision records and exact Foundry-only manifest write.
- `foundry-service-court-server-r1.pryyEl`: three maintained server tests on
  the generated shard; all pass without source or shard changes.

Earlier failed check packets are retained. They caught an ambiguous test
instrumentation anchor, a TypeScript closure-narrowing issue, excessive helper
nesting and stale historical test guards; none is waived by the passing packet.
