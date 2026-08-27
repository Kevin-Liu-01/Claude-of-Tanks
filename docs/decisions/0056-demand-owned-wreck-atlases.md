# ADR 0056: Destroyed vehicle atlases are demand-owned

- Status: accepted
- Date: 2026-08-27

## Context

Every procedural tank material set includes a shared fallback for rare meshes
that cannot accept the continuous burn shader. Material construction eagerly
baked a char atlas and an ember atlas for that fallback. Showroom tanks never
use either map, while battle tanks already pass through an explicit covered
destruction warm before rollout.

This made the map comments and warm API misleading: `prebakeBurntSteps()` was
nominally the owner, but ordinary construction had already paid and retained
the work.

## Decision

The fallback material begins without char or ember maps. Its idempotent
`prepareBurnt()` owner creates or reuses the shared atlases, attaches both maps,
and invalidates the material once so Three.js compiles the mapped variant.

Battle destruction warming remains the normal owner: it prebakes the roster's
maps, patches normal-bearing materials directly, uploads the textures, and
draws one isolated production-light fallback probe only when an exact
non-patchable source exists. It must not build and render a complete destroyed
copy of every fielded tank. `setDestroyed()` calls `prepareBurnt()` as a
synchronous correctness fallback for Studio, screenshot, and recovery paths
that intentionally omit battle warming.

## Consequences

- Ordinary tank and Garage construction does not create destroyed-only canvas
  assets.
- Battle and returned-Garage renderer residency drops without lowering map
  resolution or changing the burn effect.
- First destruction remains stall-free on the production battle path.
- Covered entry avoids a redundant destroyed-roster scene and its shader work.
- Bypassing the warm owner remains correct, at the explicit cost of a one-time
  synchronous preparation.

## Verification

    node src/vehicles/materialQuality.selftest.mjs
    node src/game/battleWarmRuntime.selftest.mjs
    node src/vehicles/tankFactoryCore.selftest.mjs
    node tools/screenshot.mjs --views explosion
    npm run perf:resources:gate
    npm run typecheck
    npm run build
