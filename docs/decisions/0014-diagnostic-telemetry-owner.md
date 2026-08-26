# ADR 0014: Engineering telemetry has a typed read-only owner

- Status: accepted
- Date: 2026-08-26

## Context

Renderer, world, network, and shadow diagnostics were implemented as a large
block near the end of `src/main.js`. That made the composition root own GPU
readback state, scene counting, cache policy, and report formatting even though
none of those concerns participate in gameplay.

## Decision

`src/dev/debugTelemetry.ts` owns low-frequency telemetry collection and the
explicit shadow A/B probe. `main.js` injects current subsystem references and
publishes the resulting functions to the existing debug HUD/API. Collection is
read-only. The shadow probe is opt-in and restores render target, viewport,
scissor, shadow, material-program, and auto-clear state in a `finally` path.

## Consequences

- Gameplay and visuals retain the existing code paths and telemetry schema.
- The composition root loses renderer-diagnostic implementation detail.
- Strict TypeScript documents the cross-subsystem diagnostic boundary.
- Future diagnostics extend one owner rather than adding more globals to
  `main.js`.

## Verification

    node src/dev/debugTelemetry.selftest.mjs
    npm run typecheck
    npm test
    npm run build
