---
name: server-skill
description: Implement and operate the match actor, the LAN room helper, collision manifests, ICE and telemetry services.
---

# claude-of-tanks / server

## Purpose

Provide the renderer-free match authority (`server/match`), the room service
the LAN helper and every headless proof run (`server/rooms`), and the small
HTTP services the site deploys. The signaling server, the Redis room store, the
dedicated match server and the ranked service of the first multiplayer left the
tree with the cutover of 2026-09-29 (`docs/MULTIPLAYER-V2.md` §13.10).

## Mental model and invariants

- `match/` is the Multiplayer v2 match service (`docs/MULTIPLAYER-V2.md` §11 and
  §13): `MatchActor` (one room: roster, the authority, the loop, seat admission,
  lag compensation, interest-tiered snapshots), the binary wire in `src/mp/wire`,
  seat tokens (`seatToken.ts`) the room service signs, `service.ts` +
  `localRoomService.ts` (the in-process match the LAN helper and the receipts
  use), `server/match/README.md`. The same actor runs in the host commander's
  browser (`src/mp/host`).
- `rooms/` is the LAN / offline helper (`npm run server:mp`, port 8792): the
  shared room actor (`src/mp/room/roomActor.ts`) over real sockets, the match
  in-process or in the admin's browser (`COT_ROOMS_MATCH_TRANSPORT`).
- `dedicatedWorldCollision.ts` inflates match-local state from generated
  per-map collision shards (`collisionManifestCodec.ts`, `collisionManifestLoader.ts`,
  `mapResourceCache.ts`); do not hand-edit their records or checksum index. Keep
  idle map retention bounded and release active terrain leases on teardown.
  `dedicatedWorldCollisionBrowser.ts` is the browser-side loader the manifest
  receipt compares against.
- `pacingRoster.test-support.ts` is the battle-pacing gate's roster fixture
  (`battlePacing.selftest.mjs`, `tools/pacing-trace.mjs`): the seeded
  era-matched bot fill the gate's bands were measured over.
- `ice.ts` (`api/ice.ts`) issues short-lived TURN credentials from deployment
  secrets; credentials are never committed.
- `telemetryRecord.ts` is the shared entry-telemetry schema; `jev/main.ts` is the
  local HTTP wrapper around `api/jev.ts` for the Vite dev server (`npm run jev:dev`,
  port 8794; docs/JEV-COMMANDER.md).
- Never make a client authoritative for hits, damage, reloads or the match
  result; a room migrates its host, it never hands a client the verdict.
- Keep payloads, queues, rooms, rates, and lifetimes bounded.

## Verification

Run `node server/match/matchActor.selftest.mjs`, `node server/match/service.selftest.mjs`,
`node server/dedicatedWorldCollision.selftest.mjs` and `node server/battlePacing.selftest.mjs`.
Regenerate world manifests with `tools/capture-world-collision-manifests.mjs` after
authored map collision changes. Any gameplay authority added here must also run the
deterministic match tests, abuse cases, and the headless peer-to-peer proofs
(`npm run test:net:v2:p2p:headless`, `npm run test:net:v2:p2p`).
