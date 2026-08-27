# ADR 0049: Viewport synchronization has one typed engine owner

- Status: accepted
- Date: 2026-08-27

## Context

`src/main.js` directly synchronized renderer, camera, post targets, and shadow
frustums on resize. It also owned a special first-layout recovery loop for
embedded and mobile hosts that can report a 0x0 viewport during module boot.
That recovery is part of the black-screen contract but had no direct unit test
and no disposal boundary.

## Decision

`src/engine/viewportRuntime.ts` owns viewport application, the window resize
listener, and temporary first-layout recovery. A zero-size boot observes the
container and document root while retaining a 250 ms compatibility fallback.
The first positive layout applies the single shared resize seam and immediately
disconnects both recovery mechanisms. Normal boots allocate no observer or
interval.

The runtime accepts an explicit environment and renderer resize port for
Node-runnable verification. Production uses the browser and the existing
`renderer.js/onResize` policy.

## Consequences

- renderer, camera, post targets, and CSM frustums cannot drift across separate
  resize handlers;
- zero-size recovery is armed earlier, immediately after post construction;
- recovery timers and observers have one idempotent disposal path;
- `src/main.js` invokes only `viewport.apply()` after context restoration.

## Verification

    node src/engine/viewportRuntime.selftest.mjs
    npm run typecheck
    node tools/garage-switch-probe.mjs
    npm test
    npm run build
