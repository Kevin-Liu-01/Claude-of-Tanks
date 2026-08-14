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
- `lobby.js` owns teams, readiness, permissions, and start policy.
- `matchRuntime.js` owns fixed ticks, input ordering, snapshots, and client time.
- `snapshot.js` owns quantization, visibility filtering, and interpolation.
- `loopbackTransport.js` and future adapters implement the same small transport.
- `localSession.js` proves solo play traverses the real host/client path.

## Patterns and invariants

- Player/entity identity is independent from `specId`.
- Authority accepts controls only; it computes every gameplay result.
- Spotting filters data before serialization.
- Queues, extrapolation, catch-up, sequences, and payload sizes are bounded.
- Modules remain Node-runnable with no DOM/WebGL dependency.
- Tests exercise the public host/client interface, not private internals.

## Verification

Run `node src/net/net.selftest.mjs`, then `npm test` and `npm run build`. Network
adapters additionally require loss/jitter/backpressure and browser-pair tests.
