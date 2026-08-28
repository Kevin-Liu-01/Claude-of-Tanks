# ADR 0090: Canonical lobby policy is strict TypeScript

- Status: accepted
- Date: 2026-08-28

## Context

Private, LAN, retained-room, and rematch flows all depend on one lobby policy
module. It accepts untrusted commands, assigns seats and teams, locks ready
players, migrates host ownership, advances round phases, and serializes state
for every peer. The implementation was still JavaScript, so its central player,
command, guard, phase, and snapshot contracts were repeated as casts in typed
callers.

## Decision

Move `src/net/lobby.js` to strict `src/net/lobby.ts`. Keep command payloads and
external identifiers `unknown` until runtime validation narrows them, while
making the canonical lobby, player, team, phase, result, guard, and serialized
snapshot shapes explicit exports.

Use the typed lobby contract directly from private-room acquisition and
private-match handoff. Remove their local lobby function casts. Preserve the
existing policy, mutation order, wire shape, revision semantics, room capacity,
and rematch behavior exactly.

## Consequences

- All room modes compile against one lobby state and snapshot contract.
- Untrusted commands still fail with the same stable `LobbyError` codes.
- Match handoff no longer re-declares or casts the persistent-room policy.
- The migration adds no Garage import or runtime work; TypeScript types erase
  from the production bundle.

## Verification

    npm run typecheck
    node src/net/net.selftest.mjs
    node src/net/privateMatchHandoff.selftest.mjs
    node src/net/privateRoomConnectionRuntime.selftest.mjs
    node server/signaling.selftest.mjs
    npm run test:net:entry
    npm run build
