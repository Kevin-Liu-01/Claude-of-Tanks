---
name: src-net-skill
description: Implement the transport-independent multiplayer protocol, lobby, authority, snapshots, and network adapters.
---

# claude-of-tanks / src/net

## Purpose

Provide one authoritative match path for campaign, LAN, private, and ranked
play without importing Three.js rendering or DOM state.

## Mental model & key files

- `protocol.js` owns wire vocabulary and untrusted input validation.
- `lobby.js` owns teams, team size, readiness, permissions, and start policy.
- `matchRuntime.js` owns fixed ticks, input ordering, snapshots, and client time.
- `inputCadence.ts` bounds replaceable input uploads independently from display
  refresh while preserving immediate control edges.
- `browserInputRuntime.ts` composes finite-point aim, action edges, and cadence
  behind explicit multiplayer intent; solo boot must not import it.
- `snapshot.js` owns quantization, visibility filtering, and interpolation.
- `snapshotWireCodec.js` owns compact binary snapshot rows; protocol v2 uses
  explicit snapshot acknowledgements, per-peer deltas, and periodic keyframes.
- `loopbackTransport.js`, `channelTransport.js`, and `webrtcPeer.ts` implement
  the same bounded transport contract.
- `localSession.js` proves solo play traverses the real host/client path.
- `rankedServiceClient.js` owns service-scoped ladder identity and queue polling;
  `dedicatedClient.js` owns authenticated WebSocket handoff and reconnect.
- `privateRoomSession.js` owns lobby WebRTC composition;
  `privateMatchHandoff.js` deterministically fills open team slots with bots
  and releases those same channels to match authority.
- `browserBattleBridge.js` is presentation-only and must stay lazy from main.

## Patterns and invariants

- Player/entity identity is independent from `specId`.
- Authority accepts controls only; it computes every gameplay result.
- Spotting filters data before serialization.
- Queues, extrapolation, catch-up, sequences, and payload sizes are bounded.
- WebRTC control/events stay reliable and ordered; replaceable snapshots and
  live input use the unordered zero-retransmit state lane. Fire/consumable
  edges repeat until acknowledged and authority deduplicates them. WebSocket
  snapshots and input coalesce under backpressure so stale state cannot
  consume control headroom.
- Initial RTC recovery replays pending SDP before creating a new ICE
  generation. Duplicate descriptions must be idempotent; never overlap offers
  merely because a fresh browser is slow.
- Local prediction replays the exact shared movement path. Reconciliation error
  is presentation-only: horizontal hull motion, terrain support/tilt, and live
  turret aim use separate bounded decay channels. Contacts may extend smoothing
  but must never change authority, collision, or ballistic state.
- Modules remain Node-runnable with no DOM/WebGL dependency.
- Tests exercise the public host/client interface, not private internals.

## Verification

Run `node src/net/browserInputRuntime.selftest.mjs`, `node src/net/net.selftest.mjs`,
`node src/net/privateMatchHandoff.selftest.mjs`, then `npm test` and
`npm run build`. Network adapters additionally require browser-pair proof.
