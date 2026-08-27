# ADR 0055: Authored proxy casters use a shadow-only render layer

- Status: accepted
- Date: 2026-08-27

## Context

Tank hulls, vegetation canopies, and wrecks have low-polygon meshes authored to
cast stable shadows at a fraction of the visible geometry cost. Their materials
disable color and depth writes, but Three.js still traverses and submits those
meshes in the presentation pass. They therefore consumed draw calls and vertex
work without changing a pixel.

Three.js filters native shadow casters against the presentation camera's layer
mask. Enabling a layer only on each light's internal shadow camera does not make
those casters visible to `WebGLShadowMap`.

## Decision

`src/engine/renderLayers.ts` reserves layer 29 for authored shadow-only proxy
geometry. `markShadowOnly()` moves a proxy to that layer and retains the
semantic `userData.shadowOnly` marker used by diagnostics. The renderer wraps
the native shadow-map traversal once, temporarily exposing layer 29 on the
presentation camera and restoring its exact mask in a `finally` block before
the forward render begins.

Visible geometry and ordinary shadow casters stay on their existing layers.
This owner does not replace the native CSM scheduler or change cascade sizes,
materials, caster geometry, or shadow cadence.

## Consequences

- Proxy casters contribute to the same native shadow maps as before.
- Presentation passes no longer submit geometry that cannot change color or
  depth.
- Adding a new proxy requires an explicit `markShadowOnly()` call and focused
  shadow-routing coverage.
- Layer 30 remains available to the existing late-FX path.

## Verification

    node src/engine/renderLayers.selftest.mjs
    node src/engine/shadowRefresh.selftest.mjs
    npm run perf:resources:gate
    npm run typecheck
    npm run build
