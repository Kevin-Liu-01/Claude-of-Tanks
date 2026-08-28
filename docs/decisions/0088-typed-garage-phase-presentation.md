# ADR 0088: Garage phase presentation has one typed owner

- Status: accepted
- Date: 2026-08-27

## Context

`src/main.js` still constructed the Garage key lights and separately owned
their phase membership, neutral showroom sun, dressing GPU suspension, world
root swaps, and terrain-relative stage placement. Those operations act on the
same five scene roots and must change together across boot, battle entry,
Studio capture, world activation, and covered Garage return.

## Decision

`src/game/garagePhasePresentationRuntime.ts` owns the Garage phase presentation
transaction. It creates the existing two authored spotlights, composes the
existing scene- and GPU-residency owners, applies the existing neutral sun
preset, and re-seats the stage, dressing, lights, target, pedestal, and camera
from one shared Garage anchor.

The runtime receives lighting, terrain, camera, pedestal, render, and frame
ports. Camera framing and pedestal pose math remain with their existing
owners. World construction remains with `worldActivationRuntime.ts`; it calls
this owner only to swap or detach presentation roots.

## Consequences

- The composition root no longer implements Garage lighting or placement
  policy and falls below 3,000 lines.
- Battle entry, Studio staging, deterministic shots, and Garage return use the
  same typed phase operations.
- Spotlight colors, intensities, ranges, placement, sun trim, shadow policy,
  and covered GPU restore order are unchanged.
- The owner is directly tested with real Three.js scene membership and fake
  lifecycle ports, without creating WebGL.

## Verification

    node src/game/garagePhasePresentationRuntime.selftest.mjs
    npm run typecheck
    npm test
    npm run perf:resources:gate
    npm run build
