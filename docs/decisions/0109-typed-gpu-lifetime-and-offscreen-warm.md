# 0109 — GPU lifetime and offscreen warming are strict TypeScript

## Context

Hidden scenes still retain uploaded geometry, texture, material, and private
batch allocations. Combat also needs bounded real renders to compile the exact
production shader variants that `compileAsync()` cannot completely exercise.
Those two lifecycle owners must preserve shared roots, render targets, object
layers, LOD state, and reusable CPU-side scene graphs across Garage and battle
transitions.

## Decision

`offscreenWarm.ts` and `resourceLifetime.ts` are strict TypeScript owners with
explicit batch, renderer, retained-resource, disposal, and receipt contracts.
The warmer continues to use the existing private render target and restores the
prior target, cube face, mip level, layers, and LOD update state. Disposal
continues to protect resources reachable from preserved roots and includes
explicitly registered off-tree resources such as terrain LOD alternatives.

## Consequences

- Phase-exclusive scenes retain deterministic GPU release and restoration.
- Shared resources cannot be disposed accidentally through an implicit input
  shape.
- Exact production shader variants still warm through bounded covered renders.
- No new frame work, geometry reduction, texture reduction, or visual-quality
  change is introduced.

## Verification

- `npm run typecheck`
- `node src/engine/offscreenWarm.selftest.mjs`
- `node src/engine/garageGpuWarmRuntime.selftest.mjs`
- `node src/engine/deploymentShadowWarm.selftest.mjs`
- `node src/engine/resourceLifetime.selftest.mjs`
- `node src/engine/phaseGpuResidency.selftest.mjs`
- `node src/world/worldBuildCoordinator.selftest.mjs`
- `npm run build`
