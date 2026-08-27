# ADR 0046: Killcam has one retryable runtime owner

- Status: accepted
- Date: 2026-08-26

## Context

Killcam code is intentionally absent from ordinary garage boot. Its module
promise, runtime promise, inactive placeholder, live publication, and retry
policy nevertheless lived in `src/main.js`. Solo, multiplayer, Studio-adjacent
capture, and deterministic shots all cross the same replay acquisition edge.

## Decision

`src/game/killcamAccess.ts` owns module preload and singleton runtime creation.
It exposes one stable presentation facade whose getters and calls forward after
installation and are complete no-ops beforehand. The composition root supplies
the concrete replay constructor, bus binding, scene dependencies, and direct
fixed-step capture handoff.

The owner preserves these invariants:

- replay intent transfers code without creating DOM, Three.js, or timer state;
- concurrent entry consumers share one initializer;
- module and initializer failures clear only their matching in-flight receipt;
- the presentation identity does not change when the implementation arrives;
- inactive spectate, replay, and capture calls are safe;
- fixed-step solo capture calls the live implementation directly after entry.

## Consequences

- `src/main.js` no longer owns killcam promise races or a partial placeholder.
- Replay cinematography, x-ray state, audio/FX wiring, spectator behavior, and
  authoritative combat results are unchanged.
- A transient replay failure can recover on the next entry without a page
  refresh or a second successful chunk transfer.

## Verification

    node src/game/killcamAccess.selftest.mjs
    node src/game/killcamPresentation.selftest.mjs
    node src/fx/lazyRuntime.selftest.mjs
    npm run typecheck
    npm test
    npm run build
