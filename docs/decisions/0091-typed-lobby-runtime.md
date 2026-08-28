# ADR 0091: Lobby transport ownership is strict TypeScript

- Status: accepted
- Date: 2026-08-28

## Context

The canonical lobby policy was typed, but its host/client transport runtime was
still JavaScript. Private-room composition consequently erased the lobby model
behind local constructor and port casts. Clients also accepted any envelope
payload carrying a numeric `revision` as room UI state.

## Decision

Move `src/net/lobbyRuntime.js` to strict `src/net/lobbyRuntime.ts`. Export the
transport, handoff, error, host, and client contracts. Validate every received
serialized lobby field—including player identity, phase, team, game mode, and
revision—before publishing it to client listeners.

Use the runtime directly from `privateRoomSession.ts` and remove its duplicate
lobby constructor, state, and host-port casts. Give WebRTC's shared transport
contract the reliable message methods already implemented by every channel.
Preserve sequence handling, canonical command policy, broadcast order, and the
bounded lossless lobby-to-authority handoff.

## Consequences

- Room sessions and lobby authority compile against one canonical model.
- Malformed remote lobby state fails closed with `invalid_lobby_state`.
- Match handoff ownership remains explicit and limited to 64 pending packets.
- Type contracts erase from production and add no frame or loading work.

## Verification

    npm run typecheck
    node src/net/net.selftest.mjs
    node src/net/privateMatchHandoff.selftest.mjs
    node src/net/privateRoomConnectionRuntime.selftest.mjs
    npm run test:net:entry
    npm run build
