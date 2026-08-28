# ADR 0102: Match authority and clients share one strict typed runtime

- Status: accepted
- Date: 2026-08-28

## Context

Solo battles, browser-hosted rooms, and dedicated matches all traverse the same
fixed-step authority and client sampler. That runtime still depended on a large
JavaScript object graph plus constructor casts in the private-room and dedicated
adapters. Untrusted transport payloads therefore reached handshake, room,
snapshot, chat, and clock-sync logic without a compiler-enforced boundary.

## Decision

Move `src/net/matchRuntime.js` and the loopback `src/net/localSession.js` adapter
to strict TypeScript. Define the authority simulation, room controller, peer,
transport, client, chat, event, and diagnostics contracts. Validate transport
payload shapes before reading them, let snapshot assembly own its untrusted
packet boundary, and instantiate the shared runtime directly from private-room
and dedicated adapters instead of casting its constructors.

Preserve the 60 Hz fixed-step simulation, acknowledged delta snapshots,
reliable one-shot event lane, edge-triggered input retransmission, adaptive
interpolation, bounded catch-up, persistent-room rematches, and reconnect
generation behavior.

## Consequences

- Solo, private, and dedicated matches now depend on the same explicit runtime
  contract without constructor escape casts.
- Malformed room, chat, welcome, ping, and snapshot payloads fail at their wire
  boundary instead of leaking partial shapes into match state.
- Fixed-step pacing, visuals, gameplay, and network packet semantics are
  unchanged.

## Verification

    npm run typecheck
    node src/net/net.selftest.mjs
    node src/net/matchRuntime.deadPeer.selftest.mjs
    node src/net/privateMatchHandoff.selftest.mjs
    node src/net/privateRoomConnectionRuntime.selftest.mjs
    node server/dedicatedMatch.selftest.mjs
    node server/battlePacing.selftest.mjs
    node tools/multiplayer-browser-soak.mjs
    npm run test:net:entry
    npm run build
