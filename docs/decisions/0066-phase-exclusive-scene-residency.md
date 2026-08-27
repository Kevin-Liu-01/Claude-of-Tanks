# 0066 — Garage and battle roots have exclusive scene residency

Status: accepted

## Context

Setting a large Three.js subtree to `visible = false` prevents its draws but
does not express lifecycle ownership. Retained Garage and battlefield roots
could remain reachable from the active scene, inflating object cardinality and
making it easy for traversal, matrix, lighting, or diagnostic work to regress
without lowering the displayed frame rate.

Rebuilding either phase on every transition would release residency but add a
large entry or rematch stall and risk changing generated visual state.

## Decision

`engine/phaseSceneResidency.ts` is the typed owner for the mutually exclusive
Garage and battlefield roots. Entering battle detaches the exact Garage stage,
workshop, light, and light-target roots before mounting the selected world.
Returning to Garage detaches the battlefield and remounts the retained Garage
objects. Detachment never disposes phase resources or reconstructs content.

The production phase-resource gate verifies both the ownership state and
independent CPU, forced-GC heap, scene-object, program, geometry, texture,
draw-call, triangle, cache, and paint-cadence limits for initial Garage, live
battle, and returned Garage.

## Consequences

- Inactive phase descendants cannot participate in active renderer projection
  or matrix traversal.
- Garage return and rematch reuse the exact objects, shaders, textures, and
  generated world state; there is no rebuild penalty.
- Scene residency becomes observable and testable instead of an incidental
  collection of visibility flags.
- GPU program and texture caches remain intentionally warm and are bounded by
  separate returned-Garage limits.

## Verification

```sh
node src/engine/phaseSceneResidency.selftest.mjs
node src/game/garageDressingOptimization.selftest.mjs
npm run typecheck
npm run build
npm run perf:resources:gate
```
