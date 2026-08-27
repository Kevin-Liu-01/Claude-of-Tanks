# ADR 0045: Combat effects have one retryable runtime owner

- Status: accepted
- Date: 2026-08-26

## Context

Combat effects are absent from the garage boot graph, but their module promise,
runtime promise, singleton publication, and retry policy lived directly in
`src/main.js`. Battle hover, solo entry, multiplayer entry, Studio, and capture
all share this lifecycle. A transient chunk or WebGL allocation failure must
not require a page refresh, and intent must not allocate effects that the
garage cannot display.

## Decision

`src/fx/fxRuntimeAccess.ts` owns effects module preload and singleton runtime
construction. The composition root supplies two ports: load the module, and
initialize/install the live runtime into the scene, bus, and late-composite
post pass.

The owner preserves these invariants:

- module intent coalesces without constructing GPU state;
- concurrent runtime consumers share one initializer;
- the runtime is published only after installation succeeds;
- a failed module request is retried by the next intent or entry;
- a failed initializer is retried without downloading the successful module
  again;
- ordinary garage boot still excludes `effects.js`.

## Consequences

- `src/main.js` no longer implements effects loading state or promise races.
- Consumers read the published runtime or cross the explicit async acquisition
  gate; optional event reactions remain safe while no runtime exists.
- Effect geometry, materials, timing, warm order, render output, and gameplay
  authority are unchanged.

## Verification

    node src/fx/fxRuntimeAccess.selftest.mjs
    node src/fx/lazyRuntime.selftest.mjs
    npm run typecheck
    npm test
    npm run build
