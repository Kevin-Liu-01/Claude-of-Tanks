# ADR 0016: Network recovery presentation has one typed owner

- Status: accepted
- Date: 2026-08-26

## Context

The integration entry point separately stored a connection subscription,
disconnect timestamp, reconnect attempt, grace timeout, and banner mutations.
Repeated transport-close events could advance presentation state more than
once, while the policy itself could only be exercised through the complete
browser battle loop.

## Decision

`src/net/connectionRecovery.ts` is the sole owner of network-recovery
presentation state. It subscribes to one match client, coalesces repeated
disconnect edges, advances the reconnect label on a fixed cadence, and emits
one failure edge after the configured grace period. The WebRTC/session layer
continues to own transport replacement; the integration layer only consumes
the typed expiry edge and ends the rendered match once.

## Consequences

- Repeated close notifications cannot pulse multiple status owners or reopen
  the disconnect result every frame.
- Subscription lifetime and recovery state leave `src/main.js` together.
- Timing policy is deterministic and Node-testable without DOM or WebGL.
- A successful reconnect clears the failed latch and preserves the existing
  match presentation.

## Verification

    node src/net/connectionRecovery.selftest.mjs
    npm run typecheck
    npm run test:net:render
