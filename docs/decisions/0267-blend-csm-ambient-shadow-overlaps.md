# 0267 — Ambient shadow density follows the CSM overlap blend

Status: accepted

## Context

Three.js CSM fade regions can evaluate two adjacent cascades for one fragment.
The direct-light path blends those contributions sequentially. Claude of Tanks
also captures the sun visibility to dim ambient and image-based lighting inside
cast shadows, but that custom capture previously chose the darkest evaluated
cascade. A low-weight stale or low-resolution sample could therefore darken the
entire ambient term while the direct shadow was almost entirely owned by the
other cascade. Camera motion made the mismatch look like flashing shadows around
trees, structures, and other overlapping casters.

## Decision

`src/engine/lighting.ts` resolves captured sun visibility with the same
`blendRatio` and sequential `mix` operation used by Three.js CSM direct lighting.
The non-faded path keeps its single-owner behavior. The correction adds no
texture reads, render targets, shadow submissions, allocations, or cascade
refreshes.

Forcing every cascade to redraw every frame is not an acceptable substitute.
Projection and depth coherence remain owned by the existing shadow scheduler;
the shader must represent overlap ownership correctly even when distant
cascades update at a lower rate.

## Consequences

- A cascade contributing five percent can change ambient shadow density by at
  most five percent instead of owning the complete result.
- Fully owned cast shadows retain their established density and appearance.
- Direct, ambient, and image-based shadow transitions now agree through CSM
  overlap bands.
- The existing four-cascade quality profile and bounded refresh schedule remain
  unchanged.

## Verification

    npm run typecheck
    node src/engine/shadowStability.selftest.mjs
    node src/engine/shadowRefresh.selftest.mjs
    node src/engine/renderLayers.selftest.mjs
    node src/engine/temporalAoPolicy.selftest.mjs
    node src/engine/deploymentShadowWarm.selftest.mjs
    node src/world/treeGrounding.selftest.mjs
    node src/world/destructibleRenderPolicy.selftest.mjs
    node tools/map-shadow-audit.mjs <browser-session> .qa-dev/shadow-weighted.json --maps=verdant,urban
    npm test
    npm run build
