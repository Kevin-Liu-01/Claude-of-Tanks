# Multiplayer v2 — the redesign charter

Owner's brief (2026-09-24): redesign multiplayer from first principles — up to 14v14, rooms that
never close, first-time entry that does not fail, no lag, the cleanest code, built from scratch.

This document is the program's charter: what the current design cannot do, the target
architecture, the numbers it is sized to, the phases with their acceptance gates, and the
decisions that are the owner's. `docs/MULTIPLAYER-ARCHITECTURE.md` describes the v1 stack that
this program replaces; it stays accurate for v1 until each of its sections is retired here.

## 1. Requirements

| # | Requirement | Acceptance (measured, not claimed) |
|---|---|---|
| R1 | Up to 14v14 (28 commanders) plus spectators in one room, any battle rule | a 28-client headless soak and a rendered 14v14 live-combat certification pass (`test:net:v2:*`) |
| R2 | A room never closes because a player, including its creator, leaves; a match never ends because one client stalls | room admin migrates; the authority is a server; a killed creator tab leaves the match running for everyone else |
| R3 | First-time entry succeeds on an ordinary laptop or phone on a home connection, and when it cannot, the player sees why in one sentence and one action | telemetry-backed entry funnel; a pristine-profile entry soak on the production build; every boot failure surface has a receipt |
| R4 | No perceptible lag: local movement has zero input latency, remote tanks move smoothly, shots land where the reticle was | server tick 60 Hz, snapshots 30 Hz with interest management, client prediction with ≤ 1 frame reconciliation, lag-compensated hit registration, adaptive interpolation buffer; the soak's pose-step, correction and hit-registration gates |
| R5 | Clean code: one strict layered module tree per side, typed wire schema from one source, no browser-host authority, no duplicate paths | `src/mp/` + `server/match/` + `cloudflare/rooms/`; v1 `src/net` retired after cutover; receipts per module |

## 2. Why v1 cannot get there (first-principles reading)

The v1 stack (`docs/MULTIPLAYER-ARCHITECTURE.md`) runs the match authority in one player's
browser and fans out over WebRTC data channels; a Cloudflare Durable Object relays signaling;
TURN credentials come from `/api/ice`. It was built for 2v2 to 7v7 between friends and is
verified to 14 players. Its limits follow from where the authority lives, not from bugs:

- **The host's laptop is the server.** A 60 Hz simulation of 28 tanks with world collision, plus
  28 outgoing viewer-specific snapshot streams, plus rendering its own game, on a machine with a
  home upload link. 14v14 cannot be served from a browser; a stalled host stalls everyone.
- **The room is the host.** "A v1 browser-hosted room closes if its host leaves" is the documented
  contract, and there is no host migration. R2 is impossible by construction.
- **Every pair of friends must traverse NAT.** WebRTC peer paths need ICE, STUN and a TURN relay;
  a friend behind a strict NAT or a blocked UDP path fails at the last step of entry, after the
  whole game has loaded. A server with a public endpoint removes this class entirely.
- **The start barrier.** The match starts when every peer reports READY; a slow or failing cold
  client holds or breaks the start for all. R3 needs a start that no single client can block.
- **No field telemetry.** Nothing reports why a friend's entry failed; every report is anecdotal.

### 2.1 What the code says (audit of 2026-09-24)

- **Production topology.** Only solo, private and LAN exist (`src/net/playMode.ts`); "ranked" is
  remapped to private. Private rooms: browser host authority, WebRTC (`cot-match-v1` reliable,
  `cot-state-v1` unreliable), TURN from `/api/ice`. Signaling is the Cloudflare Durable Object
  (`cloudflare/signaling/src/privateRoom.ts`, cut over 2026-09-05); `api/signal.ts` now answers
  410 `signaling_moved` and the Redis room store is dead code. The dedicated match server
  (`server/dedicatedMatchServer.ts`: one process, many matches on an 8 ms global interval, ranked
  HTTP only, no rooms/lobby/spectators/rematch/chat) is not deployed for players.
- **Caps.** `MAX_PLAYERS = 14` is hardcoded independently in `src/net/protocol.ts:13`,
  `server/roomStore.ts:330`, `server/distributedRoomStore.ts:615` and
  `cloudflare/signaling/src/privateRoom.ts:308`; team size 7 in `src/net/lobby.ts`;
  `MAX_ENTITIES = 32` in the codec — 14v14 has no headroom for bots.
- **The bandwidth wall.** `snapshotWireCodec.ts` is JSON text, deltas are whole rows (any changed
  entity ships all 30 columns), entity ids are 32-hex UUIDs, and `destroyedObstacleIndices` is
  re-sent in full every snapshot: ≈ 200 B per row, ≈ 6.6 KB per snapshot late in a match,
  × 20 Hz × 27 peers ≈ 28 Mbit/s upstream from one browser tab for 28 players (4–8 Mbit/s even at
  today's 14). `simulation.snapshot()` is re-captured per viewer every 50 ms and 80 full
  snapshots are retained per peer.
- **Netcode.** Prediction/reconciliation (`localTankPrediction.ts`, 250 ms replay horizon,
  bounded correction envelopes, hard snap above 7 m), an adaptive jitter buffer (85 → 220 ms on
  private rooms), and RTT-driven clock slew exist and are receipted — keep their design. There is
  **no lag compensation**: hits resolve in the host's present tick; a shooter's ping is paid as
  aim lead.
- **Rooms.** A host Leave or lease expiry deletes the room and broadcasts `host_left`; there is
  no migration (`lobby.ts` reassigns a lobby `hostId`, but the authority object lives in the
  departed tab). Seats are durable 24 h in the DO with a 90 s disconnect grace and 180 s idle
  lease; reconnect goes ICE-restart → signaling epoch rotation → new peer connection, 60 s window.
- **Failures on record.** Thirteen normalized room failure codes (`src/net/roomFailure.ts`);
  three scripted guest scenarios (cold entry, host-left, host-stall); one production outage
  (two players could not create a room — the Redis command quota, which drove the Cloudflare
  cutover). TURN failure degrades silently to "direct-only", which cannot traverse symmetric NAT.
  No Safari/iOS-specific handling anywhere in `src/net`.
- **Telemetry.** `@vercel/analytics` page views only, injected 3.8 s after boot; no `onerror`,
  no beacon, no custom events. A friend's failed join is rendered on their screen and transmitted
  nowhere.
- **Tests.** 59 receipts under `src/net`, 21 under `server`; soaks at 2, 4 and 14 pages; the
  "28 participants" figure in the docs is two separate 14-player runs. Nothing has ever exercised
  more than 14 seats in one room.
- **Keep:** `src/sim/authoritativeMatch.ts` (the renderer-free authority), the controls-only
  client contract and `protocol.ts` validation style, the per-viewer visibility filter as a
  security primitive, the prediction and jitter-buffer designs, `lobby.ts` as a pure policy model.
  **Replace:** the authority location, the codec, the per-viewer re-capture and snapshot history,
  the four seat caps, the host-tied room. **Add:** server-side rewind, client error reporting.

## 3. Target architecture

```
browser (src/mp/)                 Cloudflare Worker + Durable Object (cloudflare/rooms/)         Container (server/match/)
┌──────────────────────┐   wss   ┌──────────────────────────────┐   proxied ws   ┌──────────────────────────┐
│ RoomClient  ─────────┼────────►│ Room DO: code, seats, teams, │◄──────────────►│ MatchServer (Node)       │
│ MatchClient ─────────┼────────►│ readiness, chat, admin,      │  start/stop    │ authoritativeMatch.ts    │
│  prediction/interp   │         │ invites, 24 h persistence,   │  results       │ 60 Hz sim, 30 Hz snaps   │
│ EntryRuntime + beacon│  https  │ match handle, telemetry sink │                │ world collision shards   │
└──────────────────────┘         └──────────────────────────────┘                └──────────────────────────┘
        LAN / offline: the same MatchServer + an in-memory Room service run as one local Node helper.
```

**Room = Durable Object.** The room is a durable actor keyed by its code. It owns the lobby state
machine (seats, teams, readiness, settings, chat, invites, spectators, rematch), the admin role
(creator first, then the most senior connected seat — never a player's browser as authority),
reconnect leases, and the handle of the running match. It hibernates between messages, so an
idle room costs nothing and lives for 24 h after its last activity. This is the evolution of the
existing `PrivateRoom` DO (`cloudflare/signaling`), which already proves hibernation, SQLite
seat persistence, alarms and resume capabilities in production.

**Match = Container.** When the admin starts a match, the Room DO starts its container instance
(one per room, `@cloudflare/containers`, WebSocket proxied through the DO) and hands it the
ruleset, map, roster and seeds. The container runs the renderer-free authority the game already
has — `src/sim/authoritativeMatch.ts` with `server/dedicatedWorldCollision.ts` and the generated
per-map collision shards — at 60 Hz, publishes 30 Hz interest-managed snapshots, resolves hits
with lag compensation, fills empty seats with bots, and reports the verdict back to the DO. It
sleeps after the match; a rematch starts it again in the same room. Players, the creator
included, may come and go freely: the match is not theirs to keep alive.

**Client = `src/mp/`.** A new module tree with one contract per layer: `transport/` (WebSocket
frames, backpressure, reconnect), `wire/` (the binary schema and codecs), `room/` (RoomClient
state machine and UI adapter), `match/` (MatchClient: clock sync, input stream, snapshot buffer,
prediction and reconciliation, interpolation, event delivery), `entry/` (EntryRuntime: capability
gate, staged loading with timeouts and retries, version/reload handling, the telemetry beacon),
and `presentation/` (the bridge into the existing battle renderer, HUD and FX). Solo play keeps
its in-page composition; LAN uses the same client against a local helper.

**Server = `server/match/`.** One Node process per container: HTTP health + a WebSocket endpoint,
a `MatchActor` per room (only one per process on Cloudflare; N on a self-hosted VPS), fixed-step
loop with drift correction, the authority, the snapshot publisher, the lag-compensation history,
the bot controller, admission (seat tokens issued by the Room DO), and structured logs. The same
binary runs in Docker on Cloudflare, on a VPS behind Caddy (the existing `compose.multiplayer.yaml`
shape), and as the LAN helper.

## 4. Transport and netcode

**Transport.** WebSocket over TLS (binary frames), the only ingress Cloudflare Containers accept
and the path every browser, network and corporate proxy allows. Head-of-line blocking is
mitigated, not ignored: snapshots are small deltas, input frames are tiny and coalesced, the
server never queues more than one unsent snapshot per client (backpressure drops the stale one),
and the client's interpolation buffer absorbs a lost-then-retransmitted frame. The transport
layer is a contract (`open/send/close/onFrame/onState` with buffered-byte accounting), so a
WebTransport or WebRTC-to-server implementation can be added behind it without touching the
match code when a host that admits UDP is chosen.

**Clock.** The server stamps every snapshot with its tick and time; the client keeps a filtered
offset (median of the last 16 samples, outlier-rejected) and a measured RTT; both drive the
interpolation delay and the prediction horizon. No wall-clock time enters the simulation.

**Input.** The client samples controls every simulation tick (60 Hz), sends them in frames that
carry the last 3 ticks of controls (redundancy against loss), acknowledged by the tick echoed in
the next snapshot. The server applies inputs on their tick, tolerates ≤ 2 ticks of jitter with a
small adaptive input buffer, and treats stale, far-ahead or malformed frames as v1 did: rejected
without poisoning the stream. Fire and action edges repeat until acknowledged.

**Prediction.** The local tank runs the shared movement module ahead of the server; on each
snapshot the client rewinds to the acknowledged tick, re-applies unacknowledged inputs, and
corrects presentation with the bounded smoothing v1's `localTankPrediction.ts` established
(sub-0.25 m release, no hard snaps in the soak's gates). Own shots get immediate feedback under
the same "recent authority says ready" rule.

**Interpolation.** Remote entities render at `now − delay`, where `delay` adapts between 2 and 4
snapshot intervals from measured jitter and loss (67–133 ms at 30 Hz); extrapolation is capped
at one interval. Turret/gun angles interpolate on the shortest arc; velocities from the row give
hermite blending for the hull.

**Lag compensation.** The server keeps 400 ms of pose history per entity; a shot is resolved
against the world as the shooter saw it at `clientTime − interpolationDelay` (bounded to 250 ms of
rewind), so the reticle is truthful for both sides. Shell flight and armor stay authoritative.

**Interest management.** A viewer receives full-rate rows for entities it can see (spotting), its
own team at full rate, and nothing for hidden enemies (as v1: hidden coordinates never leave the
server). Rows are delta-coded against the last acknowledged snapshot; a keyframe goes every 2 s
or on a missing baseline.

**Budget (28 players, 30 Hz).** Full row ≈ 44 B (quantized: position 3×i32 mm, velocity 3×i16
cm/s, five angles u16, hp u16, reload/magazine/ammo u8–u16, flags u8, sparse ERA list); typical
delta row ≈ 12–20 B. Per client: keyframe ≈ 1.3 KB, delta snapshot ≈ 0.4–0.6 KB → 12–18 KB/s down,
< 3 KB/s up. Server egress for a full room ≈ 0.4–0.5 MB/s. Authority CPU: measured in phase 1
with 28 bots on the heaviest maps; the target is ≤ 6 ms per 60 Hz tick on one vCPU (a
`standard-2` instance) with headroom for shells and events.

## 5. Room lifecycle and persistence (R2)

- A room is created by any player; the creator holds **admin** (start, settings, kick, teams).
- Admin migrates automatically to the most senior connected seat when the admin disconnects
  for longer than the reconnect grace (30 s) and immediately on an explicit leave.
- Seats are durable for 24 h: a player who drops keeps the seat for 120 s of match time (the
  tank goes neutral, then is bot-driven until they return or the grace ends), and keeps the lobby
  seat until the room expires. Reconnect resumes with the private capability the v1 stores prove.
- A match runs to its verdict regardless of departures; if every human leaves, the container
  finishes the round against bots only if a spectator is present, else ends the match cleanly and
  records no result.
- Rematch reuses the room; the container restarts with the new seeds. The room expires 24 h
  after its last message. Nothing in the browser holds the room open.

## 6. Entry resilience (R3)

### 6.1 Why first entry fails today (audit of 2026-09-24)

Boot is one top-level-await module (`src/main.ts`, 3279 lines) behind an inline splash and an
inline chunk-recovery watchdog in `index.html`; 2.57 MB of eager JS (0.73 MB brotli) plus 103
module preloads; the world, fleet builders and combat shaders are paid on the first battle.
Ranked causes, with the evidence:

1. **No WebGL2 gate.** `engine/renderer.ts:61` constructs the renderer unguarded; three throws
   out of module evaluation, `index.html:602` spends two silent reloads and ends on "A game file
   did not load" — the same words as a missing chunk or a merely slow device.
2. **Boot watchdogs fire on healthy work.** `index.html:654/:658` show a retry at 30 s and force a
   reload at 60 s, including during the download/parse window where no stage heartbeat can run.
3. **Assets are not immutable.** `index.html` and `/assets/*.js` both ship
   `public, max-age=0, must-revalidate` (verified live); 104 blocking revalidations precede boot.
4. **The reveal budget throws.** `game/battleEntryLifecycle.ts:100-107` (1.5 s + 120 ms per
   vehicle) and `engine/frameScheduler.ts:68-77` (1000 ms paint) are wall-clock assertions about
   the user's GPU; on the network path `networkBattlePresentationRuntime.ts:655` turns them into
   a failed join while the peer keeps waiting.
5. **The ready barrier is all-or-nothing.** `matchRuntime.ts:981-996` needs every peer welcomed
   and ready; the waiting client gives up at 60 s with "Another player did not finish loading".
6. **Solo battle entry fails silently.** `soloBattleEntryRuntime.ts:83-89` logs and returns to
   the garage with no message.
7. **Texture-unit ceiling unverified.** The terrain material sits at 16 samplers and nothing
   reads `MAX_TEXTURE_IMAGE_UNITS`; a link failure on a 16-unit GL is unrecoverable by the
   black-scene watchdog (to be measured with a device-limit probe, not assumed).
8. **WebRTC blocked degrades silently.** `iceConfig.ts:56-64` falls back to an empty server list
   and the join dies 60 s later as a generic timeout.
9. **No production error signal** — `@vercel/analytics` page views only, injected 3.8 s in.
10. **Invite overhead.** The invite link pays a middleware shell fetch, the whole boot and the
    press-any-key gate before `autoJoin` starts; the host is already waiting.

Phase 0 fixes 1, 2, 3, 6, 8 and 9 on the v1 product now and softens 4; v2's entry runtime removes
5 and 10 by design (the server starts the match; a client joins the room while it loads).

The program's rules, independent of the audit's specifics:

1. **Telemetry first.** A tiny same-origin beacon (`/api/telemetry`, then a Worker sink) reports
   boot stages, timings, capability probes and the first error of a session — anonymous, no
   credentials, rate-limited, opt-out honoured. Without it every friend's failure is a rumour.
2. **A capability gate with words.** Before the heavy path: WebGL2, required extensions, texture
   units, memory class, storage availability, worker creation. Each failure maps to one sentence
   and one action ("Your browser blocks WebGL — enable hardware acceleration" / "Open in Chrome
   or Safari 17+"). A reduced tier is chosen up front for weak GPUs rather than measured mid-load.
3. **No client can block a start.** The admin starts the match; each client joins when it is
   ready (a protected spawn state on arrival, the same as a reconnect); a client whose load fails
   sees the reason and a retry while the match continues for everyone else.
4. **Every awaited stage has a timeout and a retry.** Chunk imports, world builds, texture
   sources, ICE/room requests; a hashed-chunk 404 after a redeploy triggers a one-time reload of
   the new build instead of a broken screen.
5. **The first error is the message.** A global error/unhandled-rejection boundary renders the
   entry error surface with the stage that failed; nothing ever stays a spinner.

## 7. Hosting and deployment

**Recommended: Cloudflare Containers behind the Room DO,** in the account that already runs the
production room Worker (`cot-private-rooms`, Workers Paid). Per the platform's published terms
(read 2026-09-24): a `standard-2` instance is 1 vCPU / 6 GiB; billing is per active 10 ms with
375 vCPU-minutes and 25 GiB-hours a month included, then $0.000020 per vCPU-second — a 15-minute
14v14 match on one vCPU costs about two cents beyond the included minutes; a sleeping container
costs nothing. WebSockets are forwarded to the container by the `Container` class; raw UDP/TCP
ingress is not offered, which fixes the transport at WebSocket. Regions: the DO and its container
are placed near the room's creator; one location per room.

**Alternatives kept working by design:** the same image on a VPS behind Caddy (the repo's
`compose.multiplayer.yaml` shape; adds UDP for a future WebRTC/WebTransport transport), and
the LAN helper (one local Node process, no cloud).

**Deploy discipline:** the Worker and the image ship only after the v2 receipts and the soak are
green, with a dated row in `docs/DEPLOYS.md` like the site; `net:prod:check` grows a v2 mode that
creates a room, starts a match against bots and reads a snapshot from production. Secrets stay
in Wrangler/Vercel configuration; nothing is committed.

## 8. Migration

1. v2 ships behind `?mp=v2` (and a Play-menu toggle) on the same site; v1 rooms keep working.
2. When the v2 soak, live-combat certification and a week of friend sessions are clean, v2
   becomes the default; v1 stays selectable for one release.
3. Then `src/net`, the browser-host path, the P2P WebRTC transport, `api/signal.ts` and the Redis
   room store are deleted; `cloudflare/signaling` becomes `cloudflare/rooms`; the docs are
   rewritten. The deterministic sim (`src/sim`) and the collision shards are untouched throughout.

## 9. Phases, lanes and gates

| Phase | Lane | Deliverable | Gate |
|---|---|---|---|
| 0 | entry-telemetry | `/api/telemetry` beacon + Worker sink, boot-stage instrumentation, capability gate with messages, chunk-404 reload, global error surface | receipts; production build entry soak with a pristine profile; a telemetry dashboard query that lists failures by stage |
| 1 | match-server | `server/match/`: MatchActor, 60 Hz loop, admission, wire codec v2, snapshots with interest management + deltas + keyframes, lag-compensation history, bots, health; Dockerfile | 28-bot headless tick-cost receipt on the six heaviest maps (≤ 6 ms/tick); codec round-trip receipts; a 28-client Node soak (loss/jitter injected) |
| 1 | client-match | `src/mp/match` + `wire` + `transport`: clock, input stream, prediction/reconciliation, interpolation, events, presentation bridge | loopback receipts against the real server in-process; the soak's pose/correction/hit gates |
| 2 | rooms | `cloudflare/rooms/` Room DO (seats, admin migration, invites, reconnect leases, match start/stop via Container), `src/mp/room` client, Play-menu integration behind `?mp=v2` | Workers vitest suite; `wrangler dev` + Docker local end-to-end: create, invite, 28 join, admin leaves mid-match, match continues, rematch |
| 3 | certify | `test:net:v2:soak` (28 headless), `test:net:v2:live` (rendered 14v14 with real hits, both teams), entry soak, `net:prod:check --v2` | all green on the deployed Worker + image; a week of friend sessions with the telemetry funnel clean |
| 4 | cutover | v2 default; v1 removal; docs | receipts; hygiene; the removal lands as its own deploy |

Every lane commits after each verified step, keeps the sim modules untouched, adds receipts to
`tools/selftest-suites.mjs`, and reports exit codes. No lane deploys; the integrator deploys.

## 11. Server (phase 1, lane `match-server`, 2026-09-25)

What landed on `mp/match-server`, measured rather than claimed.

### Module layout

```
src/mp/wire/            the binary schema both sides share (pure TS; README.md is the client's contract)
  constants.ts          message types, close reasons, teams/phases/verdicts, flags, row groups, limits, scales
  messages.ts           the TypeScript shape of every message, row, patch and frame
  bytes.ts              ByteWriter / ByteReader (LE, varint, bounded strings), WireError
  quantize.ts           mm / cm/s / u16-turn / 2 ms conversions
  rows.ts               entity row groups, delta vs baseline, ERA and destroyed index lists
  codec.ts              encodeMessage / decodeMessage (never throws), buildSnapshotPacket / applySnapshotPacket
  era.ts                ERA cassette index <-> plate name from the spec's plate order
src/sim/poseHistory.ts  400 ms pose ring per entity slot (new); authoritativeMatch.ts: `shellRewind` seam, cap 14 -> 64
server/match/           main.ts (env, drain) · service.ts (/healthz, /metrics, /match upgrade, admission, registry)
                        matchActor.ts (one room) · loop.ts · inputBuffer.ts · lagCompensation.ts · publisher.ts
                        entityRows.ts · seatToken.ts · localRoomService.ts · link.ts · chat.ts · log.ts · metrics.ts
                        Dockerfile (+ Dockerfile.dockerignore), README.md
tools/mp-soak.mjs       the headless wire soak (npm run test:net:v2:soak; --short is the core receipt)
src/mp/transport/       Transport contract · WebSocketTransport (backoff, resume token, backpressure) · LoopbackTransport pair
src/mp/match/           MatchClient · clock · inputStream · snapshotStream · interpolation · prediction (+ movementCheckpoint)
                        events · recovery · headlessDriver · scriptedServer.test-support (README: src/mp/README.md)
src/mp/presentation/    PresentationAdapter + bindMatchPresentation · RecordingPresentation · createBattlePresentation · createPredictionWorld
tools/mp-client-soak.mjs  headless MatchClients against the MatchActor on a virtual clock (the client gates; --server=fixture)
```

### Wire schema summary

One binary WebSocket frame per message: `u8 wireVersion`, `u8 type`, fixed layout, little-endian,
varint lengths, bounded strings, a finite `CLOSE_REASON` enum. Client → server: HELLO (protocol
version, capabilities, seat token), INPUT (the last three ticks of controls: `i8` throttle/steer,
flags, `u16` aim yaw, `i16` aim pitch, `u16` aim distance in 5 cm, shell slot, `u16` fireSeq,
`u16` actionSeq, action bits; plus client tick, snapshot ack, interpolation delay), SNAPSHOT_ACK,
PING, CHAT, LEAVE. Server → client: WELCOME (rates, seat, entity id, team, tick/time, seed,
map, mode, ruleset JSON, roster), SNAPSHOT (tick, time, keyframe flag, base tick, acked input
tick / fireSeq / actionSeq, input margin, phase / countdown / battle time / verdict /
destructible revision, destroyed index list, entity rows, removed ids, shells, the viewer's
prediction section, mode state JSON), EVENT (kind byte + bounded JSON payload), PONG, CLOSE,
ERROR. Rows: `u8` entity id, a varint group mask, then only the present groups — position
`3 × i32` mm (or `3 × i16` relative), speed + vertical speed `i16` cm/s, five angles `u16` turns
(tilt also as `i8` deltas), hp/maxHp `u16`, reload channels `u16` in 2 ms steps, magazine
`u8 × 2`, ammo varints, a `u16` status word (reload kinds, slot, gun-reload mirror bit, nine
flags), ERA cassettes as gap-coded spec-order plate indices. Entity ids are 1..64, seats 0..63.

### Lag-compensation rule

Every sweep of a shell fired by a seated player tests every other tank at the pose it had
`R` ticks earlier, `R = round((owd + interp) / tickMs)` clamped to `[0, 15]` (250 ms): `owd`
is the server's own measurement (half the median of the last eight round trips, each from a
snapshot's send time to the first acknowledgement of its tick), `interp` the interpolation delay
the client reports in every INPUT. `R` holds for the shell's whole flight, so the reticle is
truthful at any range and a victim is hit at most 250 ms "in the past". The rewind wraps the
whole sweep (trace, damage localization, exit trace, HE bursts) through one additive seam in
`authoritativeMatch.ts` and restores the live poses before the next shell; bots and spectators
never rewind. `src/sim/poseHistory.selftest`: a target displaced 6 m after the shooter looked is
missed live and hit rewound.

### Measured

| What | Number |
|---|---|
| Full entity row (keyframe, typical tank) | 44 B mean; worst distinct gun channel + 3 ERA cassettes 53 B |
| Typical moving delta row (pos rel, velocity, yaw, tilt rel, turret) | 16 B |
| 28-entity keyframe incl. viewer section | 1473 B; delta snapshot 489 B; snapshot header 41 B |
| Input frame (3 controls) | 57 B (1.7 KB/s at 30 frames/s, 3.4 KB/s at 60) |
| Tick p95, 28 bots, dedicated shards, headless | winter 1.53 · mars 1.82 · alpine 3.99 · badlands 2.03 · delta 3.11 · steppe 2.79 · monsoon 2.68 ms |
| Tick p95, 28 bots + 28 acknowledging viewers | 3.79 · 2.48 · 3.76 · 3.79 · 3.70 · 2.27 · 4.17 ms (budget 6) |
| Egress per spectator viewer (all 28 rows, deltas) | 26–29 KB/s |
| Short soak (4 clients, 40 ± 10 ms, 2 % loss) | ack lag p50 67 / p95 88 ms (RTT p95 97), max pose step 0.34 m, tick p95 0.64 ms, 4.9 KB/s down / 1.8 KB/s up per client, lag comp removed 0.45 m mean reticle mismatch |
| Container | three stages (`node:24-alpine` deps, pruned sources, plain Alpine + stripped node binary): 291 MB in `docker image ls` (Docker 29 containerd store counts compressed + unpacked), 216 MB unpacked layers, 75 MB compressed content; `/healthz` ready ≈ 3 s after start |

### Open

- The client lane's real prediction/interpolation against this server (the soak's sampler is a
  stand-in): the pose-step gate is measured with linear interpolation and one interval of
  extrapolation, not with `localTankPrediction`.
- The full 28-client, 5-minute soak (`npm run test:net:v2:soak`, memory drift gate) was run
  short; the long run is the integrator's certification step.
- Phase changes reach seated viewers only through snapshot meta (the authority's reveal rule
  hides `match_started` from entities); `roster` / `chat` / `admin` events are server-originated.
- Mode presentation state and events travel as bounded JSON inside the binary frames; a
  fixed-layout mode state can replace it when a mode's HUD contract is final.
- One additive seam and the roster cap (14 → 64) touched `src/sim/authoritativeMatch.ts`; the
  Room Durable Object (phase 2) replaces `LocalRoomService` and drives `createActor` / verdicts.
- The image runs Node 24's native type stripping (no enums, namespaces or parameter properties
  in the closure); the legacy Docker builder ignores `Dockerfile.dockerignore`, so the Dockerfile
  prunes in a `sources` stage instead.

## 10. Decisions for the owner

1. **Hosting account.** Run the match containers in the existing Cloudflare account (Workers
   Paid; cost as above)? The alternative is a small VPS the owner provisions.
2. **Retire browser-host P2P.** v2 has no browser authority; LAN moves to the local helper.
3. **One location per room** near its creator (friends across continents accept one RTT).
4. **Telemetry.** Anonymous boot/error beacons on by default with an opt-out in settings.
