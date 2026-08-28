# 0124 — World frame presentation has one typed owner

## Context

The central render loop directly configured scoped foliage suppression,
selected the player or spectated vehicle, derived a chase-camera occlusion
focus, and advanced the active world's retained presentation. This mixed
terrain presentation policy into `main.js` and exposed optional entity shape
assumptions in a hot path.

## Decision

`worldFramePresentationRuntime.ts` owns the scoped corridor and occlusion-focus
policy behind injected active-world and camera-focus ports. It retains its
direction and focus vectors, and returns immediately for absent or dormant
worlds.

## Consequences

- Garage worlds continue to perform zero LOD, vegetation, or prop frame work.
- Scope distance, arcade chase fade, external-capture exclusion, spectator
  focus, and terrain appearance remain unchanged.
- The frame path allocates no vectors or records.
- `main.js` no longer knows vegetation occlusion geometry.

## Verification

- `npm run typecheck`
- `node src/world/worldFramePresentationRuntime.selftest.mjs`
- `node src/world/terrainLodPolicy.selftest.mjs`
- `node tools/render-stability-audit.mjs`
- `npm run build`
