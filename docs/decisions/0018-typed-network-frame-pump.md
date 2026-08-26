# ADR 0018: Browser network frames have one typed pump

- Status: accepted
- Date: 2026-08-26

## Context

Network input cadence, host/client advancement, prediction receipts, reliable
event draining, latest-snapshot waits, diagnostics, and round cleanup were
implemented as separate globals and helpers in the integration entry point.
These operations are order-sensitive and execute in a hot loop.

## Decision

`src/net/networkFramePump.ts` owns the reusable network input runtime, pending
event buffer, latest snapshot, host/client frame order, diagnostics, and
snapshot loading barrier. Integration supplies stable accessors for the live
match, bridge, status surface, and player. The pump allocates no per-frame
control objects and retains the existing host/client call order.

## Consequences

- Network frame state leaves `src/main.js` as one coherent unit.
- Lobby UI can queue actions without reaching into the input runtime.
- Rematch/disposal clear all frame-owned state through one boundary.
- Host and client cadence are Node-testable without WebRTC, DOM, or WebGL.

## Verification

    node src/net/networkFramePump.selftest.mjs
    npm run typecheck
    npm run test:net:render
