# Decision 0077: cull invisible display work, not visual quality

## Status

Accepted on 2026-08-27.

## Context

The phase resource probe showed that the settled Garage was already sleeping,
but a pinned fourteen-vehicle battle still occupied 0.474 CPU core-equivalents
and submitted about 3.60 million triangles per complete frame. The dominant
live costs were scene projection/traversal, static midfield grass outside the
camera, vehicle hierarchy/running-gear presentation, and first-touch terrain
height tiles. Lowering texture resolution, shadow resolution, vehicle detail,
vegetation density, or post-processing would have changed the authored image
and was therefore outside the optimization contract.

## Decision

1. Compute one conservative bounding sphere after each static midfield grass
   chunk is populated and leave Three.js frustum rejection enabled. The
   existing radial density and geometry LOD rules remain authoritative.
2. Keep authoritative tank state and effects at their existing cadence. For a
   non-player tank wholly outside a generous presentation-camera guard band,
   accumulate elapsed time and synchronize its articulated visual at 30 Hz.
   The player and all on-screen actors remain display-rate. Crossing back into
   the guard band forces an exact synchronization on that first frame.
3. Warm the player's deployment disc plus a narrow 80/112/144 m corridor along
   its spawn heading, and the first 120 m of each bot opening route, behind the
   loading/countdown veil. This relocates deterministic cache work; it does not
   expand terrain geometry or change height results.

## Consequences

The identical production resource scenario reduced task CPU from 0.474 to
0.334 core-equivalents, forced-GC heap from 268.7 to 264.6 MB, median complete
frame calls from 586 to 573, and median complete-frame triangles from
3,599,773 to 3,485,145. Garage CPU/heap and renderer program, geometry, texture,
object, and shadow ownership remained within their prior envelopes. Two fresh
cache-disabled constrained sessions reached the Garage in 6.18–6.25 seconds
wall time and 1.73–1.75 seconds of application work, so terrain relocation did
not regress first-visit boot.

The off-screen cadence is presentation-only. It must not become a simulation,
network, collision, spotting, damage, or FX cadence. Frustum bounds remain
conservative; density-prefix and far-geometry swaps must stay inside the
original instance extent.

## Verification

```sh
node src/game/battlePresentationRuntime.selftest.mjs
node src/game/battleWarmRuntime.selftest.mjs
node src/world/terrainFastGrid.selftest.mjs
npm run typecheck
npm run build
npm run perf:resources:gate
npm run perf:cold -- --url http://127.0.0.1:5180/ --sessions 2 --summary 1
```

The deterministic `battlefield` capture remains the visual review receipt for
vegetation coverage and the complete staged world.
