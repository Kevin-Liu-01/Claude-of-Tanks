# ADR 0094: Durable browser signaling has one strict typed owner

- Status: accepted
- Date: 2026-08-28

## Context

The browser signaling client preserves a room seat across WebSocket loss,
retries transient distributed-store failures, polls durable mailboxes when
pub/sub is unavailable, buffers bounded RTC rendezvous traffic, and rotates the
page-session epoch after terminal ICE failure. It remained a 557-line
JavaScript state machine while typed room acquisition treated its constructor
as an unverified port.

## Decision

Move `src/net/signalingClient.js` to strict `src/net/signalingClient.ts`. Model
socket, request, event, room-identity, timer, reconnect, and queued-signal state
explicitly. Treat parsed JSON and server responses as `unknown`; require a
canonical six-character room code, peer identity, and host identity before
installing a created, joined, or resumed room.

Preserve the existing bounded retry schedules, 64-event and 256-signal queues,
request timeouts, durable polling fallback, stale-session filtering, explicit
leave behavior, and RTC epoch rotation. Expose a read-only queued-signal count
for regression tests instead of coupling tests to a mutable private array.

## Consequences

- Cold clients cannot publish partial room responses into session state.
- Reconnect and resume transitions are compile-time explicit.
- Private-room acquisition no longer casts the signaling constructor.
- Gameplay still never traverses the signaling socket.

## Verification

    npm run typecheck
    node src/net/net.selftest.mjs
    node server/signaling.selftest.mjs
    node src/net/privateRoomConnectionRuntime.selftest.mjs
    node src/net/privateMatchHandoff.selftest.mjs
    npm run test:net:entry
    npm run build
