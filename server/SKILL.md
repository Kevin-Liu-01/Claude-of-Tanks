---
name: server-skill
description: Implement and operate Claude of Tanks signaling and dedicated authoritative multiplayer servers.
---

# claude-of-tanks / server

## Purpose

Provide bounded network coordination and dedicated ranked authority.
The signaling server relays WebRTC descriptions/ICE only and never gameplay.

## Mental model and invariants

- `roomStore.js` owns private-room rendezvous membership.
- `signalingServer.js` owns HTTP upgrade, origin/rate/payload gates, and relay.
- `dedicatedMatchRegistry.js` owns authenticated match lifecycle and reconnects.
- `dedicatedMatchServer.js` owns the authoritative WebSocket service boundary.
- `rankedMatchmaker.js` owns bounded queues, team balance, and match-ticket handoff;
  `ratingStore.js` owns bearer identities, persistent Elo, and idempotent results.
- `dedicatedWorldCollision.js` inflates match-local state from the generated
  twenty-map collision manifest; do not hand-edit that manifest.
- A v1 browser-hosted room closes if its host leaves; never silently migrate a
  ranked authority to a player.
- Production signaling must run behind TLS with an explicit origin allowlist.
- TURN credentials come from deployment configuration and are never committed.
- Keep payloads, queues, rooms, rates, and lifetimes bounded.

## Verification

Run `node server/signaling.selftest.mjs` and
`node server/dedicatedWorldCollision.selftest.mjs`. Ranked changes additionally
run the rating, matchmaker, HTTP, and real-WebSocket tests. Regenerate world manifests
with `tools/capture-world-collision-manifests.mjs` after authored map collision
changes. Any gameplay authority added here must also run the shared `src/net`
tests, deterministic match tests, abuse cases, and real WebSocket soak/load tests.
