# ADR 0027: Opening terrain creates only visible residency

## Status

Accepted — 2026-08-26

## Context

Streamed battlefields built all three terrain geometries for every chunk within
430 metres. Two buffers were invisible, and mid-distance chunks were briefly
assigned the finest level before the first live update corrected them. This
front-loaded CPU and allocation work into the opaque battle loader.

## Decision

Near chunks create their exact visible fine geometry plus a coarse fallback.
Mid chunks create their exact visible medium geometry plus the same fallback.
Far chunks remain coarse-only. The existing deterministic look-ahead builder
creates missing levels one at a time during the frozen deployment countdown
and, if still needed later, before camera approach.

## Consequences

- The opening frame uses the same LOD selected by the live distance policy.
- No terrain shader, height, normal, material, collision, or eventual geometry
  changes; only buffer residency time changes.
- Steppe initial terrain geometries fell from 108 to 86 in the mobile battle
  probe. Thirteen look-ahead jobs completed before rollout.
- The standalone streamed terrain benchmark fell from 820.8 ms to 579.0 ms on
  the same host class, while its maximum individual stream job stayed bounded
  below 8.3 ms.

## Verification

- `node src/world/terrainLodPolicy.selftest.mjs`
- `npm run perf:terrain-stream`
- `node tools/loading-budget-probe.mjs --mode battle --maps steppe --tier mobile`
- `npm run typecheck`
- `npm run build`
