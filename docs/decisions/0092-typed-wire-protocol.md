# ADR 0092: The multiplayer wire protocol is strict TypeScript

- Status: accepted
- Date: 2026-08-28

## Context

Every local, private, LAN, and dedicated match uses the same envelope and input
normalization module. It was still JavaScript, leaving message types, sequence
numbers, envelope payloads, and normalized controls implicit at the most
security-sensitive multiplayer boundary. Typed runtime owners had to cast its
otherwise validated return values.

## Decision

Move `src/net/protocol.js` to strict `src/net/protocol.ts`. Export literal
message types plus explicit envelope, options, and normalized-player-input
contracts. Accept external values as `unknown`, narrow them at runtime, and
preserve protocol version 7, wire fields, range limits, sequence rollover, room
code normalization, and action-bit behavior exactly.

Use the strict protocol directly from lobby, prediction, browser input,
authority, signaling, UI, and server room-store consumers. Remove the local
envelope and sequence casts from `lobbyRuntime.ts`.

## Consequences

- Invalid transport values cannot be treated as envelopes without validation.
- Player controls have one shared normalized shape across authority and clients.
- Lobby transport code no longer duplicates protocol contracts.
- Type information erases at build time and does not change packet size or rate.

## Verification

    npm run typecheck
    node src/net/net.selftest.mjs
    node src/net/browserInputRuntime.selftest.mjs
    node src/net/matchRuntime.deadPeer.selftest.mjs
    node server/signaling.selftest.mjs
    node src/sim/authoritativeMatch.selftest.mjs
    node src/sim/specialActions.selftest.mjs
    npm run test:net:entry
    npm run build
