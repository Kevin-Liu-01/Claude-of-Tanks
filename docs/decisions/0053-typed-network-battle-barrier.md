# ADR 0053: Network battle barriers own their retry lease

- Status: accepted
- Date: 2026-08-27

## Context

Network battle presentation waited for two authoritative facts: the viewer's
first entity-bearing snapshot and the room's transition from loading into
countdown or play. The snapshot pump owned polling, but `src/main.js` separately
created a repeating READY timer. That split allowed disposal, rematch, and
replacement-match identity to race a timer owned by the previous entry.

Slow first-visit clients make READY repetition necessary. The message is
idempotent and covers signaling-to-match listener handoff, but its lifetime must
never exceed the exact match and barrier that created it.

## Decision

`src/net/networkBattleBarrier.ts` is the strict TypeScript owner of both network
loading predicates and the READY retry lease. It announces readiness
immediately, repeats only while the same open match remains current, and clears
the lease on acknowledgement, timeout, connection failure, replacement,
explicit disposal, or rematch cancellation.

The frame pump remains the sole owner of snapshot delivery. The barrier depends
only on its `waitForSnapshot` port, a current-match accessor, and timer ports;
it has no DOM, WebGL, transport, or gameplay authority dependency.

## Consequences

- A cold guest may take longer than the host without losing its READY edge.
- A stale room cannot announce readiness into a replacement match.
- Entry failures and retained-room rematches leave no repeating browser timer.
- `src/main.js` composes the barrier but no longer implements its state machine.

## Verification

    node src/net/networkBattleBarrier.selftest.mjs
    node src/net/networkFramePump.selftest.mjs
    npm run typecheck
    npm test
    npm run build
