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

### 6.2 Phase 0 — what landed (2026-09-25, branch `mp/entry-resilience`, deploy 89)

Documented in `docs/ENTRY-RESILIENCE.md`; the summary:

- **Telemetry.** `api/telemetry.ts` (POST, same-origin allowlist, 4 KB cap, salted-hash token
  bucket, bounded schema, PII field names refused, one JSON log line per event, and an LPUSH /
  LTRIM 5000 / 30-day EXPIRE window on the Upstash REST store when its variables are configured
  — production has them) and `src/entry/telemetry.ts` (no game imports, batched `sendBeacon`,
  per-session caps; off with `?telemetry=off`, the Settings › Graphics › Diagnostics toggle,
  Do-Not-Track / GPC, webdriver and self-hosted builds). Events: 20 boot stages, capability,
  boot ready, boot error, halted, slow reveal, entry result, ICE degraded, room failure.
  `tools/telemetry-report.mjs` prints the funnel and the failure table by stage and build.
- **Capability gate** (`src/engine/capabilityGate.ts`, before the renderer): three stops with a
  sentence and an action (no WebGL2, refused context, too few texture units) that hold the page
  instead of spending the silent reloads; notices for software rendering, disabled storage and
  worker creation. The terrain material's need was measured with a `getActiveUniform` census:
  16 samplers on desktop (10 declared + envMap + DFG LUT + 4 cascades), 15 on mobile.
- **Download-aware watchdogs** (`index.html` r4): Resource Timing and stage heartbeats re-arm
  the 30 / 60 s timers, a connectivity probe precedes any silent-minute reload, terminal messages
  name the class and the file ("A game file failed to download (i18n-….js)", driver, slow,
  offline, stalled). Proven at 200 kbps (ready at 84 s, no reload), with an eager-chunk 404 and
  with the network cut mid-download.
- **Immutable hashed assets**: `/assets/(.*)` → `public, max-age=31536000, immutable`
  (837 of 837 files hashed; plates and other public files keep must-revalidate).
- **Reveal and paint budgets** extend once and then wait or continue, with a `slow_reveal` beacon;
  the black-frame verdict still fails a truly black scene.
- **A failed solo entry shows a modal** (en / zh) and beacons an `entry_result`.
- **ICE degradation is visible**: "Direct connections only — a friend behind a strict network may
  not connect", an `ice_degraded` beacon, and the 60 s RTC timeout names the degraded state.

Bundle: `main-*.js` +1,938 B brotli plus a 1,823 B shared telemetry chunk. Open: the Redis path is
fake-store tested only until the first production events arrive; the inline watchdog strings are
English only.

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
| Short soak (4 clients in-process, 40 ± 10 ms, 2 % loss, 20 s) | ack lag p50 67 / p95 88 ms (RTT p95 96), sampler excess 0.000 m (raw step max 0.56 m from the wire's own motion), tick p95 0.5 ms, 4.9 KB/s down / 1.8 KB/s up per client, lag comp removed 0.45–0.51 m mean reticle mismatch |
| Full soak (28 clients, server in a child process, winter, 60 ± 20 ms, 3 % loss, 300 s; host load 8–13 with two foreign gate suites running) | 28/28 welcomed; cadence gap p95 1 interval, 0 missing baselines; ack lag p50 95 / p95 122 ms (RTT p95 150); events + chat to every client; 0 dropped snapshots, 0 backpressure closes; server tick p95 2.75 ms (p50 1.05, max 14.6); server RSS 549 → 549 MB after forced GC (0.0 %); 14 departures without a stall; killed creator, match on; tick rate p05 59.7 Hz (2 stalls, late wake max 126 ms under the load); egress 14.6 KB/s down / 2.3 KB/s up per client; lag comp: 588 rewound shots, 1.73 m mean / 3.9 m max reticle mismatch removed, rewind 12 ticks median. Pose-continuity gate: FAIL on this host — sampler excess 1.66 m from 403 deep underruns (frames processed in bursts while the 28-client process and the server child were starved), beside the simulation's own wire motion of up to 1.1 m/tick (69 ram-push frames); the gate needs a quiet host to be read |
| Container | three stages (`node:24-alpine` deps, pruned sources, plain Alpine + stripped node binary): 291 MB in `docker image ls` (Docker 29 containerd store counts compressed + unpacked), 216 MB unpacked layers, 75 MB compressed content; `/healthz` ready ≈ 3 s after start |

### Landed after the client lane's loopback soak (2026-09-25)

- A `NO_TICK` acknowledgement (INPUT, PING or `SNAPSHOT_ACK`) drops the viewer's baseline and
  latches a keyframe for the next snapshot when the viewer held one; a viewer that never
  acknowledged is already on keyframes until it does.
- The first control applied after admission or a seat replacement seeds `fireSeq` /
  `actionSeq` without an edge — no stray shot on reconnect.
- A new `actionSeq` skips bits the previous sequence applied within 500 ms, so a union of two
  un-acknowledged presses applies each action once.
- The service's admin API (`POST /rooms`, `GET /rooms/:id`, `DELETE /rooms/:id`, bearer = seat
  secret) is the hook the Room DO will call; the soak uses it to run the server as a child.

### Open

- The client lane's real prediction/interpolation against this server (the soak's sampler is a
  stand-in): the pose-step gate is measured with linear interpolation, an adaptive 2–4 interval
  delay and one interval of extrapolation, not with `localTankPrediction`; on a loaded host the
  28-client soak process itself starves and the gate reads its own catch-ups (see the table).
- The simulation moves a pushed hull up to 1.1 m in one tick (tank–tank separation); the wire
  carries it faithfully and a client will show it as a jolt — a sim question, not netcode.
- The full soak's tick-cost child (`npm run test:net:v2:soak` without `--no-tick-cost`) and a
  quiet-host run of the five-minute soak are the integrator's certification steps.
- Phase changes reach seated viewers only through snapshot meta (the authority's reveal rule
  hides `match_started` from entities); `roster` / `chat` / `admin` events are server-originated.
- The client lane measured tick p95 0.17 ms with 4 clients + 4 bots on verdant against this
  actor; the 28-bot heavy-map figures are the table above.
- Mode presentation state and events travel as bounded JSON inside the binary frames; a
  fixed-layout mode state can replace it when a mode's HUD contract is final.
- One additive seam and the roster cap (14 → 64) touched `src/sim/authoritativeMatch.ts`; the
  Room Durable Object (phase 2) replaces `LocalRoomService` and drives `createActor` / verdicts.
- The image runs Node 24's native type stripping (no enums, namespaces or parameter properties
  in the closure); the legacy Docker builder ignores `Dockerfile.dockerignore`, so the Dockerfile
  prunes in a `sources` stage instead.

## 12. Network status surface and the exit flow (2026-09-26, lane `mp/v2-status-surface`)

What the player sees of the link in a v2 battle, how a battle is left, and what the record keeps.
Everything below is measured by a receipt named in §12.6.

### 12.1 The status model (`src/mp/session/networkStatus.ts`)

One mutable snapshot, written in place (never copied) at a 4 Hz cadence from three sources through
their existing hooks — the match transport's `onState` (state, close reason, reconnect attempt and
the delay before the next attempt, which both transports now name on every `reconnecting` change),
the match client's clock / snapshot stream / predictor / byte rates (allocation-free getters added
for the purpose), and the room client's phase, snapshot, seat, region and round trip. The room
client measures its round trip on the admission request and on every keepalive pong; the host
names its region in the admission reply (`region`, optional, ≤ 32 chars: the actor fills it from a
host port; the local service says `lan`, the Worker does not name one yet).

| Field | Source | Note |
|---|---|---|
| `transport`, `transportReason`, `reconnectAttempt`, `retryAtMs` / `nextRetryMs`, `reconnects` | transport state changes | the banner's "attempt 2 · next try in 3 s" |
| `link` | the recovery phase (`connecting` → `handshaking` → `live` → `stalled` → `reconnecting` → `failed` / `closed` / `left`) | |
| `rttMs`, `rttMedianMs`, `rttJitterMs` | `ServerClock.minRttMs` / `medianRttMs` / `rttSpreadMs` (the 16-sample window) | **stall-immune**: a busy main thread timestamps a pong late and can only inflate a sample, so the window minimum is the path's floor, the median its typical value, the median absolute deviation its spread; the smoothed EMA and the jitter EMA stay for the netcode and the F3 panel of v1 |
| `snapshotHz` vs `expectedSnapshotHz` (30) | accepted snapshots over a 1 s window | |
| `snapshotAgeMs` | now − the last accepted snapshot | 0 before the first |
| `interpolationDelayMs`, `bufferedFrames` | the interpolator | |
| `lossRate` | sequence gaps over a 4 s window (a lost snapshot in a 1 s window is already 3 %) | 0 before the first window closes |
| `correctionsPerS` | predictor reconciliations that staged more than one frame of release (`maxHorizontalStepM`, 0.2 m) — the corrections a player can see | a new `visibleCorrections` counter |
| `localStallMs` | the largest gap between two of the client's own `update()` calls in the window | a self-stalled window (≥ 250 ms: a shader compile, a GC pause) judges neither cadence nor freshness |
| `closeReason`, `seatDropped` | the wire CLOSE the server sent | `seatDropped` for the reasons that end a seat (replaced, idle timeout, drain, capacity, bad/expired token, rate limit, protocol…), never `match_ended` or `client_leave` |
| `room`, `roomReconnectAttempt`, `roomRttMs`, `roomRegion`, `seat`, `rosterCount` / `rosterCapacity` (28), `roomPhase`, `matchStatus` | the room client | seated commanders exclude spectators |
| `health`, `healthReason` | the table below | |

**The verdict** (`resolveNetworkHealth`, pure, one table): the transport and link states decide
first — `left` / `closed` / `failed` → `offline` (reason `left`, `dropped` or `closed`, `failed`);
`reconnecting` (transport or link) → `bad · reconnecting`; `stalled` → `bad · stalled`; anything
before `live` → `unknown · connecting` (the strip says "Connecting", no banner). Live, the metrics
are tried against the `bad` limits in this order, then against the `degraded` limits: stale, loss,
rtt, jitter, cadence, corrections; a room link reconnecting under a live match reads `degraded`.
Without a match the room decides: joined → `good · room` (a room round trip above the bad limit
reads degraded), reconnecting → `bad`, closed → `offline`.

| Limit | degraded | bad | Why |
|---|---|---|---|
| round trip (window minimum) | ≥ 160 ms | ≥ 300 ms | the HUD's ping colours turn at 80 / 160 ms; 300 ms is beyond the lag-compensation rewind cap (250 ms) |
| spread (MAD) | ≥ 40 ms | ≥ 100 ms | the interpolation buffer adds 2 × arrival jitter; 100 ms of spread is a full buffer of doubt |
| loss (4 s window) | ≥ 6 % | ≥ 15 % | the soak certifies 3 % as playable; degraded starts at twice that |
| snapshot age | ≥ 250 ms | ≥ 1000 ms | the buffer is 67–133 ms and extrapolates one interval: past 250 ms the world is invented; the stall watchdog fires at 5 s |
| cadence | < 80 % of 30 Hz | < 50 % | 24 Hz is where the buffer stops absorbing the gaps |
| visible corrections | ≥ 2 / s | ≥ 6 / s | one correction a second is the wire's own motion; six is a fight with the authority |

The banner fact (`networkBannerFor`, pure): `reconnecting` (scope, attempt, seconds to the next
attempt), `stalled`, `dropped` (the wire reason), `failed`, `degraded` (the reason) or nothing.
Events for telemetry: `reconnect` / `recovered` (match or room), `dropped` (the reason), `health`
(every change). `summary()` is what leaves at exit: health, the worst health seen, reconnects,
room reconnects, drops, the last drop, the milliseconds spent below `good`.

### 12.2 The surface (`src/ui/multiplayerStatus.ts`)

- **The strip** (health glyph · ping · `SEAT n` · seated/28) mounts with every activated v2 round,
  top-right under the fps/ping plate, and follows the touch lanes `.cot-net` uses through the
  responsive body attributes (no width media queries; `body.cot-touch-layout` gives it a 44 px
  target). Its ping is the window-minimum round trip; the HUD's own ping cell reads the same number
  through a new HUD-frame port. The strip lives outside the HUD root and asks the HUD's measured
  lanes (`battleHudLayout.ts`) for a relayout when it mounts: while it sits in the right roster's
  column the enemies roster takes the lane below it (`--hud-roster-top-right`) and the side lane
  under the roster follows — no fixed offset was added to either component.
- **The panel** opens on a tap of the strip or the new rebindable `networkPanel` action (F3, v1's
  diagnostics key): link, round trip (floor, median, spread), updates (measured of 30 Hz), last
  update, buffer, loss, corrections, traffic, reconnects, room (phase and round trip), region,
  seat, seated. Its open state is remembered (`cot.mp.netpanel`).
- **The banner** (top-centre, `role=status`, pointer-transparent) names the fact: "Reconnecting ·
  attempt 2 · next try in 3 s", "Room link lost · reconnecting (…)", "Server not responding ·
  waiting for updates", "Removed from the battle · idle too long", "Connection lost · the battle
  continues without you", "Unstable connection · high latency". Once the link is bad or offline
  the banner carries the Leave battle control.
- **The lobby**: the same surface has a `lobby` host (inline, no leave) for the Play menu; the
  room-only model reads the room link, seat, seated count and region while the room waits for its
  match. The menu slot for it is open work (§12.7).
- Every string is a catalog key in both locales (`mpStatus.*`, `action.networkPanel`,
  `action.leaveBattle`, `playMenu.rejoin`); the typed `signal` glyph joined `uiIcons.ts`.

### 12.3 Leave battle

The control lives in the panel, in the banner once the link is bad, in the settings overlay's
LEAVE BATTLE row (Esc), and behind the new rebindable `leaveBattle` action (F4): the first press
arms the banner ("Leave the battle? Press again to confirm"), a second inside 2.5 s leaves;
outside a v2 battle the key opens the settings overlay, whose row is the same exit. Leaving is the
existing lifecycle owner's Garage return (`garageReturn.leave` → the network port's
`disposePresentation`), which is, in order and receipted: the wire `LEAVE` (the actor detaches the
client at once — `onPeerLeave` brakes the hull, the others get a `roster` event), the match socket
closed (`client`, never reconnected), the presentation released, the session back in the lobby, no
timer or listener left behind. **The room seat stays** with its `match_start`, so the player is
back in the Garage with the lobby attached to the Play menu and may:

- **rejoin the running match**: the lobby shows *Rejoin battle* while the room's match runs and
  this seat holds a `match_start`; it hands the composition-held room session back through
  `onNetworkStart`, and `beginRoom` re-enters through `MatchSession.enterMatch` — a fresh socket,
  the same token, the same entity (the actor welcomes the seat again); the room protocol needs no
  new message for this (the seat was never released from the room);
- **leave the room** (the lobby's control, `room_leave`): the seat goes, the admin migrates at
  once, the capability is forgotten. A fresh join by code into a room whose match plays answers
  `room_locked` (the roster is frozen for the round — the existing policy); after the verdict the
  room unlocks and the same player joins again as a new seat and is welcomed by the rematch.

### 12.4 The reverse: the server ends the seat

- A wire `CLOSE` with a seat-drop reason (the actor's `REPLACED` when a second tab takes the seat,
  an idle timeout, a drain, capacity, a bad or expired token…) reaches the session as `lost` with
  the reason readable while the client is still attached; the composition clears input, paints
  the banner with the reason at once ("Removed from the battle · your seat reconnected from
  elsewhere"), keeps it readable for 3 s (`dropNoticeMs`) and then takes the same clean return to
  the Garage with the room kept (the room, not the match, decides the seat).
- A lost link (the transport's 60 s window exhausted) keeps the v1 rule: the round ends once as a
  `network_disconnect` result (the end overlay offers the Garage).
- A room-level kick (`room_closed kicked`) tears the match link down through the same leave, clears
  input, returns to the Garage and opens the menu's room failure panel, as before.

### 12.5 Telemetry (`src/entry/telemetry.ts`)

Three kinds, folded, never per tick: `mp_reconnect` (`reason` `match` | `room`) and `mp_drop`
(`code` the wire reason) only count; `mp_exit` (`code` `left` | `verdict` | `dropped` | `lost` |
`failed`, `reason` the health, `link` the summary) folds a played round into one note —
`mp:<exit>:<health>:r<reconnects>:d<drops>:<lastDrop>:i<impaired s>` (≈ 30 bytes) — and, once the
session record has left, posts one `entry` follow-up (`code` `mp_<exit>`, `failed` for a drop or a
lost link) inside the session's three-request budget. The composition reports each played round
once when its presentation goes; the reveal's `entry_result` now says `network` for a v2 round.

### 12.6 Receipts and proofs

- `src/mp/session/networkStatus.selftest.mjs` — the model over scripted sources (every limit
  crossed both ways, the reconnect countdown, self-stalls, drops, the leave, the summary) and over
  a real `MatchClient` on the 100 ± 30 ms / 3 % loopback against the scripted server: live → good
  (floor 60–130 ms, 26–31 Hz), a frozen server → reconnecting, the recovery → good, `REPLACED` →
  dropped.
- `src/ui/multiplayerStatus.selftest.mjs` — the strip cells, every banner sentence, the panel
  rows, the two-press arming, the style contract (no breakpoints, the touch lanes, 44 px, a
  pointer-transparent root) and the real surface driven on a stub document.
- `src/mp/match/clock.selftest.mjs` — the window minimum, median and spread survive a 900 ms
  stall sample that inflates the EMA.
- `src/mp/session/exitFlow.selftest.mjs` — the dispose order on stub sockets and injected timers,
  re-entry with the retained `match_start` and token, the room leave forgetting the capability,
  the `REPLACED` drop, the kick.
- `src/mp/session/browserComposition.selftest.mjs` — the status port (mount after activation,
  paint per pump, the actions, unmount on the Garage return), the drop's banner-then-return, the
  re-entry through `beginRoom`, no re-entry once the room says the match ended, one link summary
  per played round; `src/ui/playMenu.selftest.mjs` pins the Rejoin control and the v2 handoff
  guard; `src/entry/telemetry.selftest.mjs` the kinds, the note, the follow-up and the budget.
- `tools/mp-exit-e2e.mjs` (+ its core receipt, ~20 s wall): four headless sessions against the
  local rooms server — leave (the actor drops to 3 clients, the hull moved 0 m in 2 s, the seat and
  its `match_start` kept), re-entry (same token, same entity, live), a second tab (the room's `resume_denied`
  to the first tab, which never resumes — §13.11, 2026-09-30),
  `room_locked` for a fresh join mid-match, the kick (room and match together), the verdict, the
  fresh join after it and the rematch welcoming it.
- `tools/mp-browser-e2e.mjs` — the strip on both battles, the F3 panel with its 13 rows
  (screenshot `a-network-panel.png`), and B's *Rejoin battle* from the lobby into the match the
  room still runs (screenshot `b-rejoined.png`). Measured 2026-09-26 (headless Chromium, 2 humans
  + 2 bots, 89 s wall, 0 browser errors): both strips `good` — `1 MS · SEAT 0 · 2/28` and
  `1 MS · SEAT 1 · 2/28`, no banner; A's panel: Live · 1 ms (median 3) ± 2 · 30.3 of 30 Hz · last
  update 11 ms ago · buffer 85 ms / 16 frames · loss 0.0 % · corrections 0.0 per s · 7.3 KB/s
  down / 2.4 KB/s up · 0 reconnects · room Joined · In battle · 7 ms · region `lan` · seat 0 ·
  2 / 28; after A closed its tab and B returned to the Garage, B rejoined the same match
  (`m1-914447ea`, the room's) live and revealed in its second round with the strip back at
  `1 MS · SEAT 1 · 2/28`, then left; the explicit room leave left A's disconnected seat alone in a
  `playing` room.

The first browser run had read B's link as `bad · rtt · 385 ms` right after the reveal: the
smoothed RTT and the 1 s cadence window were inflated by B's own warm-up stalls (pongs are
timestamped when the busy page finally processes them). The stall-immune estimators and the
self-stall rule above are the fix; the run above followed.

### 12.7 Open

- The lobby slot for the room-only strip in the Play menu (the surface's `lobby` host exists and
  is receipted; the menu needs a mount point fed by the connection's `RoomClient`).
- The rooms Worker does not name its region; `request.cf.colo` names the edge, not the object's
  location — the field waits for a truthful source.
- The lost-link ending (a `network_disconnect` result after 60 s) could take the drop's
  banner-then-return path instead; the owner's call.
- F3 in a v1 battle still toggles v1's diagnostics; the two surfaces never coexist.

## 13. Re-scope 2026-09-28 — peer-to-peer over WebRTC (owner decision)

**The decision.** Cloudflare Containers are sold only on the Workers Paid plan; the account is on Free, and the owner's
answer to that was the question the program had left open since section 2: "can't our game just be peer to peer? …
this can be done with WebRTC" — then "completely do this then and make it properly done." So the authority moves back
into a player's browser, where v1 has run it since the beginning, and the Room Durable Object — which deploys on Free —
carries everything peer-to-peer cannot: rooms that outlive their host, one WebSocket for entry, signaling, host
election and host migration. The match container stays in the tree as an optional `MatchHost` backend for anyone who
ever pays for a dedicated server; it leaves `wrangler.jsonc`. The client, prediction, snapshot stream, status model,
exit flow and presentation of v2 carry over unchanged: they speak the same wire over a different transport.

### 13.1 Architecture

| Piece | Where it runs | What it does |
|---|---|---|
| Room Durable Object (`cloudflare/rooms`, Free plan) | Cloudflare | seats, roster, settings, chat, phase, seat tokens, resume leases (as today); **plus** the WebRTC signaling relay, host election and host migration, keyframe bookkeeping |
| Local room service (`server/rooms`) | the LAN helper / tests | the same actor with the same relay — LAN rooms and every headless proof |
| Host authority (`server/match/matchActor.ts`) | the host commander's browser, in a Worker thread | the v2 authority unchanged: 60 Hz sim, viewer-specific snapshots, seat tokens verified with the room's secret handed to the host at `match_start` |
| Host's own client | the host browser | `loopbackTransport` into the actor (the host plays on its own authority, as in v1) |
| Peers | every other browser | `webRtcTransport` (RTCDataChannel) into the host's actor through an `rtcClientLink` |
| ICE | `api/ice.ts` (Vercel) | STUN + TURN credentials as v1 uses them; a strict NAT relays through TURN |
| Match container (`cloudflare/rooms/src/matchContainer.ts`, `server/match/main.ts`) | parked | an optional `MatchHost` implementation for a paid account; not deployed |

The Room DO never carries game traffic: on the Free plan every WebSocket message is billed as a request and 28 clients
at 20 Hz would exhaust a day's allowance in minutes. It relays a few dozen signaling messages per join and nothing else.

### 13.2 The contract (in `src/mp/room/protocol.ts`, landed with this section)

- `RoomSnapshot.host: RoomHostInfo { transport: 'p2p' | 'service'; hostId; generation; since }` — optional in this
  commit, required once the rooms lane lands. `generation` increments on every election.
- `match_start` for a p2p match: `matchUrl = "rtc://<roomId>/<generation>"`, `hostId` = the hosting seat. The host
  receives its own id and boots the authority; peers open a data channel to `hostId`.
- `room_signal` (client → room): `{ to, generation, kind: offer | answer | candidate, sdp?, candidate? }`, ≤ 8 KB
  (`ROOM_SIGNAL_MAX_BYTES`); relayed verbatim as `room_signal` with `from`. The room checks: both seats are in the
  room, one of them is the current host, the match is starting or playing, the generation is current, the rate window
  holds. The room never parses SDP.
- `host_changed` (room → all): `{ hostId, generation, resumeTick, reason: left | timeout | declined | start }`.
- Election: the admin hosts by default; if the admin declines (mobile tier, or the settings' "never host" switch) the
  room picks the lowest `joinedAt` connected commander that has not declined. When the host's room socket is absent
  for `ROOM_HOST_DISCONNECT_GRACE_MS` (8 s) the room elects the next host and broadcasts `host_changed`.
- Keyframes: the authority emits a keyframe at least every `ROOM_MATCH_KEYFRAME_INTERVAL_MS` (2 s); every peer keeps
  the last keyframe and the deltas since it. The elected host boots the actor from that state (`resumeTick`), the
  peers reconnect their channels, the entities hold still for the migration window, the match continues. The old host
  returning joins as a peer. A match that loses every commander ends as `lost`, as today.
- The wire (`src/mp/wire`) is unchanged: HELLO / INPUT / SNAPSHOT_ACK / PING / CHAT / LEAVE up, WELCOME / SNAPSHOT /
  EVENT / PONG / CLOSE / ERROR down, one reliable ordered data channel `match` first; an unreliable unordered channel for
  snapshots is a measured follow-up, never the default until it beats the reliable one on the soak.

#### 13.2.1 Addendum — what the rooms lane implemented (P1, `mp/p2p-rooms`, 2026-09-28)

The exact shapes below are what the room hosts send and accept; the client lane builds against them. Everything is in
`src/mp/room/protocol.ts` (the block `// ---- P1 rooms lane (2026-09-28)`) and enforced by `src/mp/room/roomActor.ts`
with `src/mp/room/p2pMatchHost.ts`, shared by the Durable Object and the local room service.

- **The per-match host secret.** The browser host verifies its peers' seat tokens without ever holding the room's
  `MATCH_SEAT_SECRET`. For each match the room derives `hostSecret = sha256Hex(MATCH_SEAT_SECRET + ':' + matchId)`
  (64 hex characters; the room's `sha256Hex` port), signs **that match's** seat tokens with it
  (`server/match/seatToken.ts`, `signSeatToken(hostSecret, claims)` — a token from an earlier match of the same room does
  not verify), and sends it only on the host's own copies: `RoomMatchStartPayload.hostSecret?: string` in the host's
  `match_start` (again on every resume while it hosts) and `RoomHostChangedPayload.hostSecret?: string` on the host's
  own copy of every `host_changed` (the start included). Never in `room_state`, never to a peer, never stored: the
  actor's persisted state holds no secret (it re-derives). The parked `service` backend keeps signing with the room's
  secret, which the container holds.
- **Match reports** replace the status polls: `room_command { command: { type: 'match_report', matchId, generation,
  phase: 'loading' | 'countdown' | 'playing' | 'ended', tick?, verdict?: { result, reason } } }`, accepted only from the
  host of the current generation (`host_only` otherwise — a stale generation is the old host talking; an unknown or
  finished match is `invalid_command`; a malformed report `invalid_payload`). `playing` moves the room to `playing`;
  `ended` with a verdict records it (`match_status ended`, the room back to `waiting`); `ended` without a verdict records
  the match as lost with reason `host_ended`. `tick` (default 0) is the authority tick the host has reached: the last
  reported one is the `resumeTick` a successor receives. The host reports every `ROOM_MATCH_REPORT_INTERVAL_MS` (10 s)
  and on every phase change; silence for `ROOM_MATCH_REPORT_STALE_AFTER_MS` (3 × the poll interval, 30 s — counted from
  the election until the first report) is a dropped host. The ack is `room_ack { revision }`; a report that changes
  nothing broadcasts nothing.
- **`host_decline`**: `room_command { command: { type: 'host_decline', declined: boolean } }` from any seat in any
  phase sets `RoomPlayer.hostDeclined` (a new required boolean on every player; `room_state` carries it). The election
  (`electHost`): connected commanders only (spectators never host, disconnected seats never host); the admin first
  unless it declined; else the lowest `joinedAt` that has not declined; **declined commanders host only when no other
  connected commander exists** (the last commander hosts, declined or not — §13.3's mobile rule). **A running host's
  decline is its departure from hosting (P1b, 2026-09-28)** — the client declines while hosting only when its actor is
  gone or never came (a Garage return, a re-entry without state, an elected seat that cannot host) — so the room treats
  it as a leave for the election: the next candidate takes over at once, `reason: 'declined'`, by the same ladder
  (willing first, a declined commander as the last resort; P1's first rule moved the match only to a WILLING successor
  and otherwise kept the departed host, which stalled its peers for the 30 s report budget). The one exclusion: a seat
  that already stepped down by declining while it hosted this match is never handed the match back by a decline
  (`RoomActorState.steppedDown`, durable, cleared at every start and end — two seats that cannot host would otherwise
  elect each other without end); a drop or a leave still elects by the full ladder. With no candidate left the host
  keeps hosting (its seat is still in the room, unlike a leave) and its own client boots afresh when no election
  follows.
- **The keepalive frame and the coalesced broadcasts (P1b, 2026-09-28).** The room socket's keepalive is one exact
  TEXT frame each way — `ROOM_KEEPALIVE_REQUEST` = `ping`, `ROOM_KEEPALIVE_RESPONSE` = `pong`, never an envelope. The
  Durable Object sets `setWebSocketAutoResponse(ping → pong)` in its constructor, so the runtime answers on every
  accepted socket without waking the object: the frame is never a handled message, never a billed request, never
  duration. The LAN service and the proofs' double answer the frame outside the actor; the actor's 24 h idle expiry
  reads the host's record of the newest frame per socket (`keepaliveAt` — the Worker's
  `getWebSocketAutoResponseTimestamp`), so a room whose seats only keep alive stays open as before. The `room_ping` /
  `room_pong` envelope stays accepted (and billed) for clients deployed before the frame. `room_state` broadcasts are
  throttled to one per `ROOM_STATE_COALESCE_MS` (300 ms) per room: the first change of a burst goes out at once, the
  rest ride one trailing broadcast carrying the newest revision (the host's own timer — the `defer` port — never the
  alarm); joins, leaves, disconnects, phase changes and elections broadcast at once. `room_ack { revision }` still names
  the state a command produced and every seat converges to the newest revision within the window.
- **The relay (`room_signal`)**, checked in this order, each with its own code: a seated sender (`not_in_room`); a
  well-formed payload — `to` (a seat id), `generation` (an unsigned integer), `kind` in `offer | answer | candidate`, an
  optional `sdp` string, an optional `candidate` record `{ candidate, sdpMid: string | null, sdpMLineIndex: number |
  null }` (`invalid_payload`); a match starting or playing with an elected host (`signal_phase`); the current generation
  (`signal_generation`); a target that is another seat of this room, **connected**, and either the sender or the target
  is the host (`signal_target` — a spectator may signal the host like any peer, two spectators may not, a disconnected
  target is refused rather than dropped); the relayed payload within `ROOM_SIGNAL_MAX_BYTES` (8 KB of UTF-8, measured
  on the relayed JSON — `signal_size`). The target receives `room_signal { to, generation, kind, sdp?, candidate?,
  from }` — the validated fields and `from`, nothing else. A signal with a `requestId` is acknowledged
  `room_ack { relayed: true }`; the existing rate window (120 messages / 10 s per socket) is the only rate rule.
- **`host_changed`** goes to every seated socket: `{ hostId, generation, resumeTick, reason }` — plus `hostSecret` on
  the new host's copy. At start it follows the per-seat `match_start`s (`reason: 'start'`, `resumeTick: 0`, the same
  generation as the URL): a `host_changed` whose generation the seat already runs is a no-op. Migration reasons:
  `timeout` (the host's room socket absent for `ROOM_HOST_DISCONNECT_GRACE_MS` = 8 s, or its reports stale), `left` (the
  host left the room or was kicked — at once), `declined` (above). `resumeTick` is the departing host's last reported
  tick (0 if it never reported). No commander left to elect: the match ends `lost` (`reason: 'match_lost'`, `match_status
  lost`, the room `waiting`). The admin lease (30 s) and the host lease (8 s) are independent: the admin usually hosts,
  and its seat migrates as before while the match has moved on.
- **A returning seat** (`room_join` with its capability) receives its `match_start` again with the **current**
  generation's URL and `hostId` — the old host, back after a migration, is a peer with no secret; back inside the grace,
  it is still the host (the lease clears) and receives the secret again.
- **`RoomSnapshot.host` is required**; `createRoom` writes `{ transport, hostId: null, generation: 0, since }`; `start`
  writes the election; the match's end (verdict, lost) clears `hostId` and keeps `generation` monotonic (the next start
  elects at `generation + 1`, so a URL never repeats within a room). `readRoomSnapshot` normalizes a snapshot from an
  older host (or a fixture written before this lane) to the no-election record with `hostDeclined: false`, so the
  client's types stay required without a wire break.
- **Error codes added**: `signal_target`, `signal_generation`, `signal_size`, `signal_phase`, `host_only`.
- **Shared helpers for the client** (import, do not duplicate): `p2pMatchUrl(roomId, generation)` /
  `parseP2pMatchUrl(url)`, `isRoomHostInfo`, `isRelayedRoomSignal` (a received `room_signal`),
  `isRoomHostChangedPayload`, `readRoomSignalPayload`, `readRoomMatchReport`, `noElection`, `utf8ByteLength`, the
  constants `ROOM_MATCH_REPORT_INTERVAL_MS`, `ROOM_MATCH_REPORT_STALE_AFTER_MS`, `ROOM_MAX_VERDICT_REASON_CHARS`, and the
  types `RoomMatchReportCommand`, `RoomMatchReport`, `RoomHostDeclineCommand`, `RoomMatchReportPhase`.
- **Requests to the client lane (P2)** — nothing on the room side depends on them, they are what the room expects: the
  host sends `match_report` (`loading` as soon as it boots, `countdown`, `playing` with its tick, then every 10 s with the
  current tick, `ended` with the verdict); a `host_only` on a report means the seat is no longer the host and should
  keep the last keyframe as a peer; a `host_changed` with a new generation is the migration (compare the generation,
  never the reason); the mobile tier and the "never host" switch send `host_decline { declined: true }` before the start
  (and may at any time); `src/mp/session/exitFlow.selftest.mjs`'s snapshot fixture may add `host` (not required: the
  validator normalizes).
- **Lifecycle additions (2026-09-30, §13.11)**: `RoomHostDeclineCommand.unable?: boolean` — a running host's decline
  with it and no candidate left ends the match `lost` at once (without it the P1b rule keeps the host); the client sends it
  on every path that cannot host (the mobile tier's decline on join, a named or elected seat without a host thread, a boot
  that failed, a Garage return that stopped its actor) and keeps the re-entry decline a preference. `ROOM_SEAT_DISCONNECT_TTL_MS`
  (5 min): a seat whose socket is gone is reaped while the room waits — its slot, capability and token — and kept for a
  running match, its lease restarting at the match's end (`RoomActorState.seatLeases`, optional on restore). An emptied
  room keeps its code for the idle TTL and the next seat to join owns it (`joinRoom`). The admin lease is an alarm only
  while a connected seat exists to migrate to; a later admission runs a due lease at once.

### 13.3 Host capacity — the honest limit

One browser serves N−1 viewer-specific snapshot streams at 20 Hz. The soak measures bytes per viewer per second
(`tickCost.selftest` already prints egress per viewer); the host's status model shows its uplink. Rules: 7v7 is the
default room size; 14v14 is allowed and the room shows "host uplink: X of Y Mbit/s" from the first minute; the
authority lowers the snapshot rate of far entities by interest tier (20 → 15 → 10 Hz) before it ever drops a peer;
the mobile tier never hosts unless it is the only commander. The host is the authority and is, as in v1, a player:
non-host peers are never authoritative for hits, damage, reloads or the result (the invariant in AGENTS.md).

### 13.4 Phases and lanes

1. **P1 rooms (lane `mp/p2p-rooms`)**: the relay, election, migration and keyframe bookkeeping in `roomActor.ts`
   (shared by the DO and the local service); the `p2p` `MatchHost` implementation (`start()` names the host and the
   `rtc://` URL, `status()` reads the host's presence and its `match_status` reports, `stop()` clears the election);
   `wrangler.jsonc` loses the `containers` block and the `MATCH` namespace; receipts for every rule above; the Worker
   typecheck stays DOM-free; the integrator deploys the Worker on the Free plan and sets `VITE_ROOMS_URL`.
2. **P2 client (lane `mp/p2p-client`)**: `src/mp/transport/webRtcTransport.ts` (the `Transport` interface over an
   RTCDataChannel, ICE from `api/ice.ts`, signaling through the room client, reconnect = a new offer to the current
   host), `src/mp/match/rtcClientLink.ts` (the actor's `ClientLink` over a data channel), the host composition
   (boot the actor in a Worker thread with the host's own world collision, loopback client for the host, `match_start`
   with `hostId === me`), migration on both sides (keyframe retention, resume, reconnect), the status model's p2p
   fields (role, candidate pair type, TURN, uplink), the surface (host badge, "hosting for N", migration banner),
   `?mp=v2` unchanged as the opt-in; proofs: two- and three-browser headless matches over WebRTC through the local room
   service (join, play, host leaves, migration, the old host returns as a peer).
3. **P3 certify (after P1 + P2 merge)**: a 28-client soak over WebRTC (Node peers on `node-datachannel` in `tools/`
   only, or headless peers at nice 19, whichever the machine can carry), host egress at 14v14 with the interest tiers,
   entry soak through TURN, `net:prod:check --v2` against the deployed room Worker.
4. **P4 cutover**: `?mp=v2` becomes the default with v1 behind `?mp=v1` for two green weeks, then `src/net`'s
   browser-host stack and the Vercel signaling functions retire; LAN moves to the local room service.

### 13.5 Receipts that guard the re-scope

`roomActor.selftest` (relay rules, election, migration timing, generations), `roomWorkerProgram.selftest` (the
Worker's program stays DOM-free), a `webRtcTransport.selftest` on a scripted data-channel double, an
`rtcClientLink.selftest`, `matchClient` migration cases (keyframe retention, resume tick), the browser proofs above,
and the tickCost egress table extended with the per-viewer bytes the host-capacity rule reads.

### 13.6 P1 rooms — what landed, what stays open (2026-09-28, branch `mp/p2p-rooms`)

**Landed.** The relay, the election, the reports and the migration in `roomActor.ts`; the `p2p` `MatchHost`
(`src/mp/room/p2pMatchHost.ts`: `start()` elects and writes the room's `host`, `status()` reads the host's presence and
its last report, `migrate()` re-elects with `generation + 1`, `stop()` clears the election — bound by the actor to the
room it serves); the ports now take `seatSecret` and `signSeatToken(secret, claims)`; the persisted state gains the
host lease, the last report, its deadline and — a fix on the way — the match URL, which was never persisted (a seat
resuming after a Durable Object restart received `matchUrl: ''`). The Worker deploys on the Free plan: no `containers`
block, no `MATCH` namespace, `MatchContainer` no longer exported (`matchContainer.ts` and the service `MatchHost` stay in
the tree; `createMatchHost` selects them only when `MATCH_SHIM_URL` or a `MATCH` binding exists), `worker-configuration.d.ts`
regenerated, `wrangler deploy --dry-run` green (96 KiB, bindings ROOMS / ROOM_CONNECT_LIMITER / ALLOWED_ORIGINS /
MATCH_SHIM_URL). The local room service takes `matchTransport: 'service' | 'p2p'` (`COT_ROOMS_MATCH_TRANSPORT` on the
LAN helper; `service` stays its default — a Node process on the LAN is a better authority than a browser, and the
headless service receipts keep running on it). Receipts: `roomActor.selftest` (relay rules, election, decline,
migration timing on a fake clock, generations, secrets never in `room_state` or the state, hibernation with the host
state, legacy state), `p2pMatchHost.selftest`, `roomPolicy.selftest` (the host record, `host_decline`, normalization),
the Workers-runtime suite in two projects (`p2p` = the deployed shape, `service` = the parked backend with the container
stub; `npm run test:net:v2:rooms`), `tools/mp-rooms-p2p-e2e.mjs` with its receipt (five raw room sockets on the
in-process service: election, secret, relay, reports, an 8 s real-time migration, the old host as a peer, the verdict),
`roomWorkerProgram.selftest` still DOM-free.

**Found on the way.** The Workers runtime crashed (`kj/async.c++:2217: Promise callback destroyed itself`) on the
last commander's `room_leave` — bisected to one event that sends to the delivering socket (the ack), awaits storage
(the lost end re-arms the alarm from 30 s to 24 h) and closes that socket; any two of the three are fine. `Room.#close`
now detaches a retired socket at once and closes it from a zero-delay timer after the event (`cloudflare/rooms/README.md`
records it); the actor is unchanged.

**Open.** (1) The integrator deploys the Worker (`wrangler secret put MATCH_SEAT_SECRET`, `wrangler deploy`) and sets
`VITE_ROOMS_URL`; the room's `ALLOWED_ORIGINS` stays the site origin. (2) The client lane's items in §13.2.1's last
bullet. (3) The 28-peer soak and the host-capacity table (P3). (4) `RoomActorState` keeps `v: 1` with the new fields
optional on restore; a later schema bump can make them required once no pre-lane state can exist (the 24 h TTL).
(5) The LAN helper's default transport stays `service`; flipping it to `p2p` is a one-line decision for the owner once
the browser host (P2) lands.

**P1b — the cost pass (lane `mp/p2p-rooms-cost`, 2026-09-28, on the P3 certification tip).** Three changes, each
receipted, the contract in §13.2.1 and the measurements in §13.8 "room cost after P1b": (1) **the keepalive is not
billed** — the client's keepalive is the exact text frame `ping`, answered by the Durable Object's hibernation
auto-response (`setWebSocketAutoResponse` in the `Room` constructor) without waking the object; the actor's 24 h idle
expiry reads the runtime's per-socket timestamp through the new `keepaliveAt` port; the transport contract gained the
optional `sendKeepalive` / `onKeepalive` path (the configured response is the only text a transport ever surfaces) and
`RoomClient` keeps the `room_ping` envelope for a transport without it — the clients deployed on 114 / 115 / 121 keep
pinging envelopes every 15 s and are answered and billed exactly as before; (2) **coalesced `room_state`** — one fan-out
per `ROOM_STATE_COALESCE_MS` (300 ms) per room with a trailing broadcast on the host's own timer (the `defer` port),
joins / leaves / disconnects / phase changes / elections at once; (3) **a running host's decline is a departure** —
the next candidate at once with `reason: 'declined'`, a per-match `steppedDown` set so two seats that cannot host never
elect each other in a loop, the host kept only when nobody is left. Receipts: the Workers-runtime suite (the
auto-response answered in order and recorded by the runtime with the actor untouched, 130 raw pings under the rate
window while envelope pings still close the socket, the coalesced burst, the decline ladder), `roomActor.selftest`
(keepalive-driven expiry, the throttle on a captured timer, the re-arm after an instant broadcast, the stepped-down
round trip), `transport.selftest`, `roomClient.selftest` (the frame against the LAN service, the envelope fallback),
`tools/mp-p2p-decline.selftest` (p2 elected 1 ms after p1's Garage return on the real actor and on the double, against
P1's 30 s), the stepdown / session / headless / e2e receipts, `roomWorkerProgram` (DOM-free). The LAN service and
`tools/mp-p2p-room-double.ts` mirror all three (the double stays equivalent to the Worker). Never deployed by this lane.

### 13.7 The client (P2, lane `mp/p2p-client`, 2026-09-28) — what landed

Built against §13.2 and P1's §13.2.1 shapes (P1's `protocol.ts` and `roomPolicy.ts` adopted verbatim: the client
imports P1's helpers, defines none of its own). Every module is Node-runnable and receipted in the core group.

| Piece | Where | What it does |
|---|---|---|
| `WebRtcTransport` | `src/mp/transport/webRtcTransport.ts` | the Transport contract over one reliable ordered RTCDataChannel `match`: offers to the signaler's current host with its generation through the room relay, trickle ICE both ways, `bufferedAmount` as backpressure under the shared policy, `reconnect()` = a fresh offer with the shared backoff, `retarget()` = an immediate offer to a newly elected host, stale-generation / wrong-sender signals ignored, close reasons on `TRANSPORT_CLOSE`, the selected candidate pair's types (host / srflx / prflx / relay → TURN) from the stats, ICE from v1's `loadIceConfiguration` resolved per connection with a host-candidates fallback |
| `MigratingTransport` | `src/mp/transport/migratingTransport.ts` | swaps a running client's link (peer ↔ host loopback) as `reconnecting` → `open { resumed }`, so the MatchClient re-runs its handshake and keeps its prediction, events and retained state |
| `rtcClientLink` | `src/mp/match/rtcClientLink.ts` | the actor's `ClientLink` over a data channel (the wire CLOSE before the channel closes; `abandon()` drops a channel silently) and the host acceptor: one peer connection per offer of the current generation, answered through the room, the opened channel handed over labelled by ordinal; re-offers replace (REPLACED), stale / over-capacity offers refused, a channel that never opens dropped after 15 s |
| the browser host | `src/mp/host/` | `matchHost` (main thread: the Worker port and the acceptor up from construction, channels bridged as numbered links with transferred frames and pressure, the host's own seat through the loopback pair, reports forwarded, uplink and peers sampled), `matchHostCore` (in the Worker: the unchanged `server/match/matchActor.ts` on a manifest world, a HELLO gate verifying seat tokens with the per-match host secret through Web Crypto, `match_report` at `loading` / every phase / every `ROOM_MATCH_POLL_MS` and one `ended` report carrying the verdict, nothing after it (the room closes the match on that report and refuses anything later as `invalid_command`), a sealed keyframe of every entity every `ROOM_MATCH_KEYFRAME_INTERVAL_MS` and the boot configuration every 10 s, links opened before the boot held), `migrationState` (AES-GCM under SHA-256(hostSecret ':migration'); the keyframe codec + extras; chunking under the event limit; the actor restore), `hostPlan` (the roster as `planStart` froze it, the WELCOME roster as the migration fallback), `seatTokenWeb`, `worldCollision` (below), `browserHostPort` (the Worker chunk), `inProcessHost` (Node) |
| the session | `src/mp/session/matchSession.ts` | an `rtc://` `match_start` opens no socket: the named host boots the browser host and plays through its loopback, every other seat opens a `WebRtcTransport`, both behind a `MigratingTransport`; a `host_changed` with a NEWER generation is the migration (the start election and older ones are no-ops, the reason never decides); seats that cannot host (no Worker, the mobile tier, the never-host switch) send `host_decline` on join; a leaving host declines so the room elects the next; `host_only` on a report steps a stale host down to a peer; `ws(s)://` keeps the WebSocket path unchanged |
| status + surface | `networkStatus.ts`, `src/ui/multiplayerStatus.ts` | role, generation, host, candidate type, TURN, host uplink (kbit/s), peers served, migration in progress; the HOST badge, four rows behind the role, the migration banner ("New host: X · resuming…"); 18 keys in both catalogs; telemetry kinds `mp_host` / `mp_migrate` fold into the exit note as `:h<n>:m<n>` |

**Migration, both sides.** Keyframes are viewer-filtered (hidden enemy coordinates never reach a client — the AGENTS
invariant), so the plain snapshot stream cannot seed a new host. The host therefore broadcasts, inside wire EVENT
messages (`mp:keyframe`, `mp:config`, base64url chunks under `MAX_EVENT_JSON_BYTES`), a keyframe of EVERY entity
sealed with AES-GCM under a key derived from the per-match host secret: every peer keeps the newest blob without being
able to read it; only the seat the room elects — which receives `hostSecret` in its `host_changed` — opens it. The
elected seat overlays what it saw itself (its own newest assembled frame: exact for its allies and spotted enemies),
restores the actor (poses, health, ammo, reload, ERA, kills, damage, modules, crew, fires) and boots at
`max(resumeTick, keyframeTick + ticks elapsed since it arrived)`: the tick timeline stays continuous with the old host's,
so every client's server clock and input lead still fit; the actor skips the countdown and its battle clock and clock
limit continue (`MatchActorResume`). Entities hidden from the new host resume from the sealed keyframe, at most
`ROOM_MATCH_KEYFRAME_INTERVAL_MS` old. The old host's own leave drops its peers' channels without a wire CLOSE so their
clients read a lost link and wait for the election; a match that ended still closes with `MATCH_ENDED`.

**The collision source (decision).** The host fetches the same manifest the match container loads:
`vite.config.ts` emits `server/world-collision-manifests` under `/mp-collision` (`index.json` revalidated; every map
content-addressed as `<map>.<sha256[0..12]>.json`, cacheable; dev serves the source directory), and
`src/mp/host/worldCollision.ts` verifies the index's byte count and SHA-256 with Web Crypto, decodes with the server's
codec and builds `createHeadlessCollisionWorld` over the map's height field — the container's
`createDedicatedWorldCollision` step for step minus the disk. `worldCollision.selftest` proves the fetched world equals
the disk-loaded one (verdant: 6977 obstacles, the same concealers and heights). The alternative — the host's own
`WorldCollision` — was not taken: proving byte-identical simulation across the two collision structures would need a
soak of its own, while the manifest path is the one P3 certifies for the container. Cost: 56 MB of JSON in the build,
one map fetched per hosted match, nothing on the boot path.

**Bundle.** `vite build` at the base (a2b660786) and this tip: `main-*.js` 763,135 → 764,155 B raw (+1,020),
228,927 → 229,059 B brotli (+132). The host Worker chunk `matchHostWorker-*.js` is 10.4 MB raw / 2.1 MB brotli
(the actor, the simulation, the fleet builders) and loads only when a seat hosts.

**Receipts and proofs.** `roomClientSignals`, `webRtcTransport` (on the scripted WebRTC world
`rtcDouble.test-support.ts`), `rtcClientLink`, `matchActorResume`, `seatTokenWeb`, `hostPlan`, `migrationState`
(a real actor restored within 1 mm), `matchHost` (boot, loopback seat, WebRTC peer, bad token, reports, sealed
keyframes with the hidden enemy, migration to a second host at the continued tick, 0.00 m own-hull jump),
`worldCollision`, the extended `networkStatus` / `multiplayerStatus` / `telemetry` / `browserComposition` receipts,
and `tools/mp-p2p-headless.mjs` (core group): three real sessions with in-process hosts on the scripted WebRTC world
against `tools/mp-p2p-room-double.ts` (P1's relay order, election, secrets) — the rtc:// start, channels through
the relay, motion on every seat, sealed keyframes retained, the host's tab closing → the election after the grace →
the elected peer resumes at the continued tick (an ally's hull 0.38 m from where it was last seen, one tick of driving)
and the other peer follows, the old host back as a peer. `tools/mp-p2p-e2e.mjs` (`npm run test:net:v2:p2p`) is the
same flow in three headless Chromes with real WebRTC on localhost; `--rooms=wss://…` points it at the real room
service (no double: the election and the seats' ids come from the sessions' own facts, the host's reports are not
gated). While the old host re-enters, the two tabs still rendering draw at 320×200: two full battle frames starve the
shared headless GPU process during its program compile (four runs at host loads 19–40 lost that step to the
preparation budget before the law below and the shrink; the first entry passes because every tab compiles before any
renders). The existing `mp-exit-e2e` and `mp-browser-e2e` proofs keep the WebSocket path and stay green.
Runs 5–10 (2026-09-28 19:55–20:19, a foreign 700 % GPU load on the host, load 33–60): the start, the channels, the play
and the migration green every time steps A–C ran (B elected 3.4–3.8 s after A's tab closed, generation 2, C +120
snapshots in 4 s on B, B's hull 0.14–4.27 m from where C saw it, two reports from B, none refused); the old host's
return re-entered on its own 5.9 s after its page booted (the recorded timeline: runtime at 0.3 s, session `match` at
5.9 s) and its compile missed both windows — trace `compile` 5010 ms, `compileRetry` 5012 ms — the environment limit
the law is for, in `report.json`; one run lost even the first entry the same way (`compile` 5006 + `compileRetry`
5018 ms). Against the real service (`--rooms=wss://cot-rooms.kk23907751.workers.dev`) the Worker answers 403 to a
`http://127.0.0.1` page: its `ALLOWED_ORIGINS` is the site origin alone (cloudflare/rooms/wrangler.jsonc), so the
live run waits for a dev-origin allowance from P1 or a run from the site itself.

**Entry resilience (2026-09-28).** The strict shader preparation is a wall-clock-bounded operation
(`src/engine/programWarm.ts`, 5 s — unchanged). The v2 entry now treats a preparation that ran out of that budget the
way the reveal and paint budgets are treated (the 2026-09-25 law: extend once, then wait): `warm.compile` runs once
more with a fresh deadline before the entry fails with the same message; any other incomplete reason fails at once;
the extension is a `slow_reveal` beacon (`stage: compile`, `code: compile_extended`, the first attempt's ms, the
programs still pending — `src/main.ts` sends it) and a `compileRetry` stage in the load trace. On a real GPU with one
tab the compile takes 1–2 s; the second window covers a starved GPU process or a cold shader cache.
`browserComposition.selftest` proves budget → complete proceeds (two compiles, one beacon, the loader's "still
preparing"), budget twice fails with the message and no third attempt, invalidated never retries.

**Open.** (1) ~~Two of P1's requests are honoured by design but wait for the merge to be proven against the real
service: `host_only` step-down and the report cadence are exercised only against the double.~~ P3 (§13.8): the step-down
is proven on the real actor by `tools/mp-p2p-stepdown.selftest.mjs` — and found the room client reading a stale election
on a re-sent `match_start`, fixed. (2) ~~A host_decline from a
running host is honoured by the double as "elect the next willing seat"; P1 keeps a host without a willing successor,
the client then simply stays.~~ P3: the double now applies P1's rule and `tools/mp-p2p-decline.selftest.mjs` proves the
client under it on the real actor (the match resumes on the last resort after the 30 s report budget). P1b (2026-09-28):
the room now elects at once on the decline (§13.2.1) and the same receipt measures 1 ms. (3) Hidden entities resume up to one keyframe interval old; a cheaper sealed *delta*
stream is the follow-up if the soak shows it matters. (4) The Worker chunk is heavy (10.4 MB raw): the fleet builders
ride along because the actor imports `tankFactory`; a fleet-family split for the host is the P3 optimisation. (5) The
three-browser proof against the real room service needs the Worker to allow a development origin (`ALLOWED_ORIGINS`)
or a run from the site origin — done from the site origin (`--site`, §13.8). (6) The old host's return in the headless proof is at the mercy of the host's GPU: the
compile budget (5 s, extended once) is a production constant; a green rejoin needs a quiet host.
(5) The e2e's `--grace` is 3 s (the contract's 8 s makes the proof slower, not different). (6) The unreliable snapshot
channel of §13.2 stays a measured follow-up.

**Landing note (deploy 114 → 115, 2026-09-28).** Deploy 114's build inlined Vercel's sensitive placeholder for
`VITE_ROOMS_URL`, so the served client resolved no room host; `src/officialHost.ts` now names the Workers for the official
site (`resolveRoomsUrl` treats an unusable value as unset), and `tools/mp-p2p-e2e.mjs --site=https://cot.kevinliu.studio`
runs the three-browser proof against the deployed site — the only origin the Worker admits.

### 13.8 Certification of the peer-to-peer match (P3, lane `mp/p2p-cert`, 2026-09-28)

**What was measured, and how.** `tools/mp-p2p-peer/` is one seat of a match with no renderer in a real Chrome tab: the
real `RoomClient` / `MatchSession` / `MatchClient` through `createHeadlessSession`, the browser host runtime with its
Worker chunk and the `/mp-collision` manifest when the room elects the seat, the browser's own `RTCPeerConnection`
(real WebRTC; ICE injected by the runner — host candidates for the LAN case, or production's STUN + TURN from
`https://cot.kevinliu.studio/api/ice` fetched with the site origin, the credential never leaving memory), scripted
driving, prediction against the manifest world; `window.__peer` exposes the facts. A serve-only vite middleware serves it
at `/mp-p2p-peer/` — never in the build (`tools/mp-p2p-peer.selftest.mjs`). `tools/mp-p2p-soak.mjs`
(`npm run test:net:v2:p2p:soak`) opens N+1 such tabs in one headless Chrome on one room of `wrangler dev`
(`cloudflare/rooms` — the Room Durable Object's own code under miniflare, `ALLOWED_ORIGINS` = the dev origin, the seat
secret in the gitignored `.dev.vars`), plays, closes the host's tab every `--migrate-every` minutes, measures the migration
on every seat, re-opens the old host as a peer, and writes `soak-<N>.json` + `soak-<N>.md` with the verdicts below.
Every run: verdant, standard rules, no bots, every hull driving and firing on the scripted controls, one machine (an
18-core Mac under other sessions' load 7–15), Chrome at nice 19 under the probe mutex. Reports: the lane's scratchpad
`p3/soak-*/` (`soak-4.md`, `soak-14.md`, `soak-28.md`).

**Verdicts (host candidates only — the LAN shape; production ICE below).**

| Check (budget) | 2v2 (4 seats, 2 min, 1 migration) | 7v7 (14 seats, 5 min, 2 migrations) | 14v14 (28 seats, 6 min, 1 migration) |
|---|---|---|---|
| Entry: start → WELCOME on every seat | 1.17 s (all four) | 1.19–1.21 s | 2.02–2.07 s |
| Host tick cost, the Worker's actor loop (p95 ≤ 8 ms) | p50 0.2 / p95 0.4 / max 2.1 ms — PASS | p50 0.4 / p95 1.1 / max 50.7 ms (one late wake-up of 39.5 ms) — PASS | p50 1.1 / p95 2.3 (worst sample 3.0) / max 33.4 ms; 0 dropped ticks, 0 stalls — PASS |
| Snapshot rate per peer (≥ 24 Hz of 30) | 30.0 (min 29.5) — PASS | 30.0 (min 29.6) — PASS | 29.9 (min 29.5) — PASS |
| Host uplink, getStats bytes per data channel (report; > 4 Mbit/s names P3b) | 239 kbit/s median (max 273) | 1,712 kbit/s median (p95 2,088, max 2,753) | **4,853 kbit/s median (p95 7,113, max 8,758) — over the line: P3b** |
| Host downlink / peer downlink | 79 / – kbit/s | 342 / – kbit/s | 712 / 181 kbit/s (peer max 303) |
| RTT (wire pings, median) / candidate pair | 0.7 ms / host | 0.5 ms / host | 0.5–0.9 ms / host |
| Lost frames (loss rate, stale, missing baselines, backpressure drops, client stalls) | 0 / 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 / 0 |
| Migration: host loss → first snapshot from the new host on EVERY seat (≤ 12 s) | 9.20 s (host_changed 8.01 s, new host live 9.15 s) — PASS | 9.97 s and 10.18 s (host_changed 8.02 / 8.01 s, new host live 9.93 / 10.14 s) — PASS | **17.29 s on one seat (26 of 27 within 10.71 s; host_changed 8.02 s, new host live 10.66 s) — FAIL** |
| Migration: tick timeline continuous, every seat live, no reset | PASS (resume tick 4120 ≥ old host's 3603) | PASS | PASS (resume tick ≥ 10900) |
| Migration: own-hull jump on the presented pose (0.0 m) — allies of the new host / enemies / the new host itself | 3.5 / 28.4 / 4.9 m — FAIL | 5.8 and 4.8 / 28.0 and 6.4 / 0.8 and 0.3 m — FAIL | 5.5 / 5.0 / 0.5 m — FAIL; on the authority rows alone 1.0 / 6.1 / 0.07 m; the prediction's lead at the loss up to 4.0 m |
| Old host back as a peer of the new one | 709 ms | 763 / 763 ms | 762 ms |
| Peer desync at the end: the own predicted hull against the authority's newest row for it (≤ 0.5 m) | 0.026 m — PASS (run max free 1.0 m, contact 1.6 m) | 0.013 m — PASS (run max free 3.3 m; 9 of 13 predicting: the harness's `getSpec` lacked `leo2a7v`, fixed for the later runs) | 0.088 m — PASS (27 of 27 predicting; run max free 4.0 m, contact 6.2 m, 51 hard snaps over 6 min) |
| Peer tab RSS (≤ 150 MB) | 248 MB — FAIL in this harness (JS heap 31–48 MB) | 238 MB (median 185; heap 30–68 MB) — FAIL | 290 MB (median 228; heap ≤ 70 MB); the host's renderer 939 MB — FAIL |
| Console errors (0) | 1 (the harness page's missing favicon; fixed) | 0 — PASS | 0 — PASS |
| Room messages per match, client→room + room→client | 106 + 166 (start 21 + 37) | 672 + 1,235 (start 81 + 137) | 1,206 + 3,018 (start 165 + 277) |

**Production ICE (STUN + the six Cloudflare TURN transports from `/api/ice`; the pairs still select host candidates on
one machine).** 12–16 candidates gather per connection (median 12, relay 8) in 0.5–1 s. 7v7 start: 260 + 316 messages,
joins 1.15 s, migration 9.71 s, no socket closed. 14v14 start with trickle ICE: **611 + 732 messages in the burst**,
joins 1.67–1.72 s, one room socket closed by the service during the run (`1008 resume_denied`), migration 10.46 s.
The host's own socket answering 27 offers with a dozen trickled candidates each rides the room's rate window
(`ROOM_RATE_MAX_MESSAGES` = 120 per 10 s; past it the socket is closed as `rate_limit`, the host counted absent, the
match migrated at its own start) — 7v7 crossed it only by the window's phase. **Fix landed in this lane, client-only,
inside §13's contract:** both sides wait for ICE gathering to complete (`awaitIceGathering`, capped at
`ICE_GATHER_CAP_MS` = 2.5 s) and send the offer / the answer with every gathered candidate inside its SDP (the room never
parses SDP; a dozen candidates stay far under the 8 KB signal); only a candidate gathered after that trickles. The same
14v14 start on production ICE then costs **57 + 169 messages**, joins 1.88–2.73 s (gathering 0.84 s median, 2.64 s max — the cap
hit thrice), no socket closed, migration 10.73 s, 457 client→room messages for a 2-minute match. Receipts:
`webRtcTransport.selftest` (the wait, the embedded candidates, the late trickle, the cap), `rtcClientLink.selftest`,
`matchHost.selftest`, `matchSessionP2p.selftest`, `mp-p2p-headless.selftest`.

**Room-service cost (the Free plan bills each incoming message as a request; 100,000 a day).** With the batched
candidates a 14v14 match costs ≈ 230 messages to start (57 in, 169 out) and then, per minute of play, 28 seats × 4 keepalive
pings + 6 host reports ≈ 118 client→room messages (plus the same number of pongs out and a `room_state` to every seat on each
join / ready / decline / election — 1,728 of the 3,018 outgoing messages of the 6-minute 14v14). A 30-minute 14v14 therefore
costs ≈ 3,800 incoming messages: **≈ 26 matches a day of headroom counting client→room messages alone, ≈ 9 counting both
directions** — and the keepalive is 85 % of it. What P1 should add: a longer keepalive while a match plays (60 s: the Durable
Object's hibernation keeps the socket; the 15 s ping serves only the RTT readout — this alone quadruples the headroom), and
`room_state` diffs or a coalesced broadcast at the start (28 readies → 28 broadcasts of 28 seats each). Note: if Cloudflare bills
hibernated-socket messages at its documented 20:1 ratio the headroom is 20× the figures above; the certification counts every
message as one request as the brief instructed. **Done in P1b (2026-09-28):** the keepalive stays at 15 s but is the room's
text frame, answered by the Durable Object's auto-response without waking it (not a handled message at all), and `room_state`
is coalesced — the measurements are in "Room cost after P1b" below.

**Room cost after P1b (2026-09-29, lane `mp/p2p-rooms-cost` at `4902f2394` under `wrangler dev`, the same soak arguments
as the rows above — 7v7: 5 min, 2 migrations; 14v14: 6 min, 1 migration — Chrome at nice 19 under the probe mutex, machine
load 11–25 from other sessions; reports in the lane's scratchpad `p1b/soak-7v7/soak-14.md` and `p1b/soak-14v14/soak-28.md`).**
The peer harness now counts the keepalive frames apart (`keepalive:ping` / `keepalive:pong`): they are answered by the
runtime's auto-response and never reach the object, so the billed column excludes them; the "before" rows are the
certification's own runs on the P3 tip (whose 7v7 predates the ICE batching, hence its candidates and refusals).

| Run | client→room, total | of which keepalive frames (unbilled) | handled client→room (billed 1:1) | room→client | `room_state` | Headroom on 100,000 / day: handled 1:1 / both directions / Cloudflare's published rule (outgoing free, incoming 20:1, + 1 per socket) |
|---|---|---|---|---|---|---|
| 7v7 before (P3) | 672 | 0 — 278 `room_ping` envelopes, handled and billed | 672 | 1,235 | 507 | 148 / 52 / – |
| 7v7 after (P1b) | 460 | 278 | **182** | **727** | **211** | **549** / 110 / 3,846 (26 requests per match) |
| 14v14 before (P3, 6 min) | 1,206 | 0 — 670 envelopes | 1,206 | 3,018 | 1,728 | 82 / 23 / – |
| 14v14 before (P3, ICE batched, 2 min) | 457 | 0 — 223 envelopes | 457 | 2,269 | 1,728 | 218 / 36 / – |
| 14v14 after (P1b, 6 min) | 929 | 671 | **258** | **1,556** | **543** | **387** / 55 / 2,380 (42 requests per match) |

By type at 14v14, before (the 6-minute P3 run) → after: `room_ping` 670 handled → 0 (671 `keepalive:ping` frames, unbilled);
`room_signal:candidate` 276 → 0 and its 220 relays and 84 `signal_target` refusals → 0 / 28 (P3's own ICE batching, already
on the tip); offers 83 → 82, answers 55 → 54, `match_report` 38 → 38, `set_ready` 28 → 28, `room_join` 28 → 28,
`host_decline` 25 → 25, create / team / start 1 each; `room_state` 1,728 → 543 (the 28 sequential joins, instant by the rule,
still fan out to every seat already present — 378 of the 543; the readies and declines that used to fan out 28 times each
now ride one broadcast per 300 ms window); `room_ack` 93 → 93, `host_changed` 55 → 55, `match_start` 29 → 29. The steady
state of a running match is now the host's report every 10 s and nothing else: a 30-minute 14v14 costs ≈ 220 handled
messages at the start and per migration plus 180 reports ≈ 400 requests on the conservative rule — **≈ 250 matches a day of
headroom (the certification's figure was 26), ≈ 2,000 on the published rule** — and a keepalive that is free at any cadence.
Nothing else moved: 7v7 snapshot rate 30 Hz (min 29.5), host tick p50 0.4 / p95 1.1 ms, uplink 1,596 kbit/s median, 0 lost
frames, migrations 9,648 ms worst (P3: 9,970 / 10,180); 14v14 snapshot 29.9 Hz (min 29.5), host tick p50 1.1 / p95 2.4 ms,
uplink 4,937 kbit/s median (P3b's line, as before), 0 lost frames, entry 1.73–1.78 s (P3: 2.02–2.07 s), the migration 11,339 ms
on the worst seat with no seat missing (P3: 17,290 ms on one seat — the WebRTC re-offer timeout P3b names), `host_changed`
8,020 ms, desync 0.095 m, 0 console errors; the hull jump and the peer tab RSS fail as in the certification (P3b / P4).

**Migration timing (where the 12 s go).** The 8.0 s socket grace, 1.1–2.6 s for the elected seat to boot (the Worker chunk,
the manifest, the actor restored from the sealed keyframe: 1.1 s at 4 entities, 1.9 s at 14, 2.6 s at 28), and 30–50 ms
to the first snapshot on every seat. The 17.3 s outlier at 14v14 (seat p3s20, 3 reconnects instead of 2) is one peer whose
first offer to the new host never opened: the transport's attempt timeout (8 s, the WebSocket policy) then a retry that connected
at once. P3b: a shorter attempt timeout for the WebRTC re-offer (3–4 s), or a second offer when the peer connection reports
`failed` before the timeout — the room's election and boot are within budget on every other seat.

**Migration state (why the hull jumps).** The presented own-hull jump decomposes into (a) the authority rows: for the new host
itself 0.07–0.25 m and for its allies ≤ 1.0 m (the new host overlays its own newest frame — exact for what it could see), for
enemies and for allies outside the new host's interest range up to a keyframe interval of motion (6–28 m at the scripted
speeds: the sealed keyframe is up to `ROOM_MATCH_KEYFRAME_INTERVAL_MS` = 2 s old — §13.7's open item (3)); plus (b) the
client's own prediction lead (the RTT/2 + lead ticks it runs ahead of the row: 0.8–4.0 m at the loss), which the resume
resets because the client cannot replay 8–10 s of inputs (its replay window is 400 ms). "0.0 m" therefore holds only for a
hull at rest. P3b options, each a cost: sealed keyframes every 500 ms (4× the sealed traffic: ~1.7 Mbit/s more host uplink at
14v14), sealed deltas (§13.7 (3)), or each peer offering its own last authority row at the re-offer bounded by the keyframe
age × the hull's top speed (a client's row for itself, never for others — the AGENTS invariant holds, the bound closes the
teleport).

**Host capacity (the honest limit, §13.3).** The host's uplink is 180 kbit/s per viewer at 30 Hz (22.5 KB/s: the charter's
12–18 KB/s for 28 rows plus the sealed keyframe every 2 s and SCTP framing) — 4.9 Mbit/s at 27 viewers, over the 4 Mbit/s
line. P3b (not built here): the interest tiers §13.3 promises (20 → 15 → 10 Hz by distance — the publisher sends 30 Hz to
every viewer today), the unreliable channel of §13.2 for snapshots, or per-peer rate adaptation from `bufferedAmount`. The
host's CPU is not the limit: p95 2.3 ms per tick at 28 entities with 27 links.

**Memory.** The harness runs the dev server's unbundled module graph (source maps, the fleet specs, the manifest world for
prediction), so its renderers weigh 185–290 MB against the 150 MB budget while their JS heaps stay at 30–70 MB; the host's
renderer (the actor Worker with the 10 MB chunk and the collision world) 630–950 MB. The budget must be re-measured on the
built site (P4's cutover gate): the JS heap says the session itself is small.

**Decline rule (P1 ↔ the double).** `tools/mp-p2p-room-double.ts` now imports P1's `electHost` (a declined commander hosts
only as the last resort), keeps a running host that declines without a willing successor, times a host's silent reports out
(`reportStaleMs`) and broadcasts the room after a decline. `tools/mp-p2p-decline.selftest.mjs` proves the client under that
rule on the REAL actor (`server/rooms` with `matchTransport: 'p2p'`, its deadlines on a fake clock) and on the double: the hosting
admin's Garage return with every other commander declined keeps it as host (no election), the peers wait on a lost link, the
report budget (`ROOM_MATCH_REPORT_STALE_AFTER_MS` = 30 s) migrates with `timeout` to the last resort, which resumes from its sealed
keyframe at the continued tick; the other peer follows; the old host re-enters as a peer. The cost of P1's rule is that stall:
30 s instead of the 8 s grace. What P1 should add: treat a decline from the RUNNING host as `left` (the client only declines
while hosting when it is leaving the match — its actor is already gone), so the last resort is elected at once. **Done in
P1b (2026-09-28, §13.2.1):** the same receipt now measures the election 1 ms after the decline on the real actor and on the
double, the successor live 53 ms after it, with the stepped-down guard keeping two unable seats from electing each other.

**Real-service proofs.** `tools/mp-p2p-e2e.mjs --site=https://cot.kevinliu.studio --grace=8000` on this lane's tools against
the deployed site (stamp `de5322e7d`, 2026-09-28 22:48): PASS in 87 s — A hosting two peers on `rtc://`, C saw B move 17.4 m
over 364 snapshots in 12 s, A closed → B elected after 8,337 ms (generation 2), C live on B with +120 snapshots in 4 s, B's hull
2.12 m from where C saw it, A back as a peer on the auto path in one attempt (compile 2,572 ms), 0 browser errors. The
`host_only` step-down and the report cadence: the deployed run's reports are not observable from outside the Worker; the
cadence is receipted against the real actor's rules (`matchSessionP2p.selftest`: `loading`, every phase, every 10 s; one
`ended`), and the step-down is proven end to end on the real actor by `tools/mp-p2p-stepdown.selftest.mjs` — which found a
client bug first: a host whose ROOM socket dropped past the grace (its tab and actor alive) came back to a re-sent
`match_start` naming the successor at generation 2, but `RoomClient.generation` / `hostId` answered from the stale start
election it still held, so it offered to itself at generation 1 forever (the soak's `--migrate-mode=stepdown` run: 5
reconnects, never live). Fixed in this lane: a newer generation in a re-sent `match_start` supersedes the held election,
and the session's same-match re-entry steps a replaced host down at once (the `host_only` refusal of its next report stays
the fallback). On the real actor: p2 elected 8,030 ms after the blip, p3 followed, p1 back received `rtc://…/2` with host p2,
stepped down and was live as a peer of p2 within milliseconds of re-joining, p2 serving both. On the real Worker code
(`wrangler dev`, the soak's `--migrate-mode=stepdown` at 2v2): host_changed 8.01 s after the blip, the successor live at 9.19 s,
every seat on it by 9.23 s, and the old host — its actor still running until then — stepped down 7 ms after re-joining
(`match_start re-sent`) and played on as a peer of the new host.

**TURN entry soak.** `--ice=relay` (`iceTransportPolicy: 'relay'` on every peer connection, both ends, the credentials
from `https://cot.kevinliu.studio/api/ice` fetched with the site origin — 1 STUN + 6 TURN urls, TTL 28,800 s) at 2v2 for 3
minutes with two migrations: every candidate pair `relay` (12 relay candidates gathered per connection, 171 ms median; one
connection hit the 2.5 s gathering cap), joins 1.08–1.09 s (2.95 s for the capped one), wire RTT through Cloudflare's TURN
18.8 ms min / 21.2 median / 61 p95 (max 324 during a migration), host uplink 228 kbit/s at 3 peers, no lost frames,
migrations 9.29 s and 10.86 s to the first snapshot on every seat (host_changed 8.01 s, the new host live 9.24 / 9.12 s; one
relayed re-offer took 1.7 s longer than the others), the old host back as a relay peer in 755 / 763 ms, ICE resolved 26
times (once per connection — the renewal path `webRtcTransport.selftest` / `rtcClientLink.selftest` receipt: a renewed
credential reaches the next offer / answer). The credential TTL is 28,800 s on production (`expiresInSeconds`) and the standard ruleset's clock is 900 s
(`src/sim/matchRuleset.ts` — every mode's clock is at most 15 minutes): **no match can outlive a credential**, so the renewal
path matters only for re-offers, where it is receipted. The hold: a second relay-only 2v2 played until its own verdict at
t+453 s (every seat driving and firing; 13,758 snapshots per seat) with every relayed link up the whole way — RTT through
TURN 19.3 min / 21.5 median / 33 p95 ms, host uplink 231 kbit/s median, 0 lost frames, 0 stale snapshots, 0 reconnects, desync
0.007 m at the end. The 65-minute run the brief asked for was started and stopped after 6 minutes once the clock cap made it
moot (a match cannot last 65 minutes); the soak now ends a run on the match's own end and `--fire=0` keeps a hold from
ending on a verdict.

**Realism run (the real game page as host).** `--host=game`: the game page itself (`?mp=v2`, the Play menu's LAN room,
the renderer, the HUD, its own client) hosting three harness seats for 2 minutes with one migration away from it: the game
host entered its battle in 8.07 s and its peers were welcomed 8.5 s after the start (they wait for the host's actor, which
boots after the page's battle load); host uplink 136 kbit/s at 3 peers; host tick p95 0.3 ms; the game host's tab closed →
host_changed 8.04 s → a harness seat live 9.25 s → every remaining seat on it within 9.25 s, tick continuous; jumps allies
1.42 m (rows 0.08 m), enemies 0.45 m, the new host 0.26 m; desync at the end 0.001 m; 0 console errors on the game page;
room messages 52 in + 94 out.

**Open for P3b / P1 / P4 (each named above):** P3b — the host uplink at 14v14 (interest tiers, the unreliable channel, or
per-peer rate adaptation), the WebRTC re-offer timeout / retry on `failed`, the migration seed for unseen hulls (a shorter
sealed keyframe cadence, sealed deltas, or a bounded own-row hint). ~~P1 — the in-match keepalive interval, coalesced
`room_state` broadcasts, a running host's decline treated as `left`.~~ Done in P1b (2026-09-28/29: the unbilled keepalive
frame, the 300 ms broadcast window, the decline as a departure — "Room cost after P1b" above); what remains on the room's
cost is the join fan-out (instant by the rule: 378 of the 543 `room_state` at 14v14) if it ever matters. P4 — the peer tab RSS
on the built site, the credential TTL (28,800 s on production: no match in this certification crossed it; the per-connection
renewal is receipted).

### 13.9 Host bandwidth, re-offers and the migration seed (P3b, lane `mp/p2p-bandwidth`, 2026-09-29)

The certification's line: a 14v14 host uplink ≤ 4 Mbit/s median (aim ≈ 3) and p95 ≤ 5.5 Mbit/s from a home connection,
with §13.8's gates unchanged (desync ≤ 0.5 m, migration ≤ 12 s on every seat, 0 console errors, no reset). P3 measured
4,853 kbit/s median (p95 7,113) at 30 Hz to every viewer: ≈ 180 kbit/s per viewer for 28 rows plus the sealed keyframe.

**13.9.1 Interest tiers (§13.3, built here).** The spotting filter stays upstream and unchanged: the authority's viewer
snapshot decides WHICH entities a viewer receives, and a hidden enemy is never sent at any tier. The publisher
(`server/match/matchActor.ts` `buildFrame`, the rules in `server/match/interestTiers.ts`) then decides HOW OFTEN each
visible entity's row is refreshed for that viewer:

| Tier | Who | Cadence |
|---|---|---|
| near | the viewer's own vehicle; any visible entity within **100 m** of the viewer's hull; any entity **engaged** with the viewer in the last **4 s** (a hit either way, a shell of its landing within 15 m of the viewer, a ram — read from the events the viewer receives) | every snapshot |
| mid | 100–**300 m** | every second snapshot |
| far | beyond 300 m | every third snapshot |

The radii are the fleet's engagement ranges: spotting is unconditional inside 50 m and reaches 445 m at most
(`src/sim/spotting.ts`), the guns engage at 100–400 m, the battlefields span 600–1,000 m. Inside 100 m a hull can ram,
flank or be aimed at within a second; out to 300 m every second sample still places a hull at 15 m/s within 0.5 m of
its true pose at the client's interpolation delay; beyond it every third sample keeps a distant hull to a metre.
Refreshes are phased by entity id ((snapshot index + id) mod cadence), so the far rows never all land on one
snapshot; a row that is not refreshed is the one the viewer already holds, which the delta codec sends as nothing at
all. Spectators have no hull to measure from and receive every entity at full rate. Events (shots, hits, deaths, chat)
are never tiered. A tier change from far to near refreshes on the next snapshot (the near cadence is 1).

**The wire (protocol 2).** Every `EntityRow` carries `tick`, the authority tick it was captured at, and the row codec
gained group 16 `AGE` — a varint `packet tick − row tick`, present only when a row predates its packet: on a keyframe
carrying a held row, or a delta whose row was refreshed before the packet (an ack lagging). A patched row without AGE
was captured at the packet's tick; a row a delta leaves untouched keeps its baseline tick — including a fresh capture
whose fields did not change (a hull at rest), whose older tick is then still an exact pose. The frame layout of
protocol 1 is unchanged (`WIRE_VERSION` stays 1): a mismatch between builds is caught at the handshake as
`PROTOCOL_VERSION`. A held row costs 0 B on a delta and 2 B on a keyframe (`wire.selftest`).

**The client.** `RemoteInterpolator` presents each entity between its own two nearest distinct samples (rows of the
same tick are one sample however many frames carry them) and continues an entity from its own newest sample when the
render time has passed it — never a held row read as a fresh pose. With the delay at two snapshot intervals behind the
server's now, a mid-tier entity is always bracketed; a far-tier one is continued at most one interval past its sample at
its worst phase (the frame cap), and on a dry buffer at most the frame cap plus its cadence. `interpolation.selftest`
drives a near, a mid and a far entity at 10 m/s and holds every one to v·dt per frame; a held row read as fresh would
step 0, 0, 3·v·dt.

**13.9.2 The snapshot rate is the host's choice.** `MatchActorOptions.snapshotHz` (SNAPSHOT_HZ by default, any
divisor of the tick rate) is named by the WELCOME; the client adopts it — the interpolator's delay bounds (two to four
intervals) and extrapolation cap (one) follow in intervals, the snapshot stream's loss estimate counts gaps in the
named cadence, the status model reads it as the expected rate (20 of 20 is not a degraded cadence). It reaches the host
through `MatchSessionP2pOptions.snapshotHz` → `HostBootConfig.snapshotHz` on both boot paths; the peer harness takes
`?snapshotHz=`, the soak `--snapshot-hz`. `src/mp/match/snapshotRate.selftest.mjs`: the real actor at 20 and at 30 Hz
with a real `MatchClient` over the loopback pair on the dedicated collision world — 80 / 120 snapshots in 4 s, the delay
100 / 68 ms, no false gaps, own misprediction 1.7 mm at both, 25 Hz refused. Which rate the near tier runs at is decided
by the measurements in 13.9.6.

**13.9.3 Per-peer rate adaptation.** `SNAPSHOT_SKIP_BYTES` = 16 KB (≈ 0.7 s of snapshots at 14v14): a viewer whose
channel holds more unsent than that has its snapshot *skipped* — never delayed, never queued behind, so the next one it
receives is the freshest and the other peers are untouched (each link is sent to on its own); above the 64 KB soft bound
for 2 s, or the 512 KB hard bound at once, the link closes as BACKPRESSURE as before. The count surfaces as
`HostCoreStats.snapshotSkips` → `MatchHost.snapshotSkips` → `SessionP2pStatus.snapshotSkips` →
`NetworkStatusSnapshot.hostSnapshotSkips` and `window.__peer.status().host.core.snapshotSkips`, which the soak reports.
`matchActor.selftest`: a peer over the bound is skipped and counted, the others keep their cadence, no close, deltas
resume against the acknowledged baseline when it drains.

**13.9.4 Re-offer timing.** `RTC_OFFER_CONNECT_TIMEOUT_MS` = 3.5 s counted from the moment the offer leaves (after the
local ICE gathering, so a slow gather never eats into it): the host's answer takes its own gathering (capped at 2.5 s)
plus two relay hops plus the DTLS and SCTP handshakes — under a second on a LAN, two to three through TURN — so an offer
without a channel after 3.5 s is a lost offer, not a slow one, and it is re-offered **at once** (`retryDelayMs` 0), as
is an attempt whose ICE agent reports `failed` while connecting. The WebSocket policy's 8 s attempt timeout stays as the
outer bound from the attempt's start (a hung credential fetch), with its backoff; a dropped *open* channel keeps the 250 ms
backoff (the host is gone, the room's election is what it waits for). And the other way a first offer is lost: an offer
that reaches the elected seat before its acceptor exists (its `host_changed` and a peer's offer race on separate sockets)
— `RoomClient.recentOffers()` keeps the newest offer per sender for the current generation for 5 s and
`createRtcHostAcceptor` drains it at construction (`recoveredOffers`), so the peer is answered instead of waiting out its
timer. Receipts: `webRtcTransport.selftest` (a mute host: the second offer leaves 3.5 s after the first, at once, and is
answered when the host wakes; a failed agent re-offers at once; an offer that never leaves fails on the 8 s policy with
the backoff; the never-opens window exhausts on 3.5 s attempts), `rtcClientLink.selftest` (an offer relayed before the
acceptor existed is answered at construction, the peer never re-offers), `roomClientSignals.selftest` (one offer per
sender, the running generation only, drained on read, gone past the window).

**13.9.5 The migration seed for unseen hulls.** Three candidates were costed by uplink: sealed keyframes every 500 ms
(4× today's sealed traffic — ≈ 20 → 80 kbit/s per viewer, ≈ 2 Mbit/s more at 27 viewers), sealed deltas every 500 ms
on top of the 2 s keyframes (≈ 16 kbit/s more per viewer, ≈ 0.4 Mbit/s at 27), or **a bounded own-row hint** — nothing
in the steady state: one 32-byte message per seat per migration. The hint is the seat's own newest authority row from
the host it lost (the same authority's row, never the client's prediction), sent as `RESUME_HINT` right after the HELLO
of a resumed link (`MatchClient`: a migrated `MigratingTransport` opens with `resumed`; a plain reconnect sends it too
and the actor ignores it). The elected host's actor (`receiveResumeHint`) applies it to the seat's entity only when it
resumed a migration, the entity was restored from the migration state (`applyResumeState` names each restored row's
tick and position through `MatchActor.noteRestoredRow`), no hint was taken for it yet, the row is newer than the
restored one and older than the resume tick, and it lies within the distance the hull could have driven since the
restored row — (ticks between) × top speed × 1.25 + 3 m, the fleet's fastest hull as the floor — pose fields only,
never combat state. A client never places itself: a claim outside those bounds is refused and counted
(`ResumeHintStats.reasons`). Bots, disconnected seats and hulls nobody re-offers still resume from the sealed keyframe
(≤ 2 s old); the seed covers every hull whose own seat comes back, which is what the certification's own-hull gate
measures. Receipts: `matchActorResume.selftest` (older / future / too far / unrestored / spectator / repeated refused, one
bounded hint applied, none on an actor that did not resume), `matchHost.selftest` (the old host's driving hull, hidden
from bob, restored by bob's actor from the sealed keyframe metres behind its own last row, then the old host back as a
WebRTC peer: its hint applied, bob's own refused as no newer, the hull within a metre of its last row on the authority
rows — the "no reset" contract), the soak's migration table (hints applied / refused per migration).

**13.9.6 Where a 14v14 host's bytes go, and the rate decision.** Attribution on the actor in Node (28 hulls driving and
firing on the soak's scripted controls, dedicated collision, 30 Hz, `$SP/p3b/attribution.mjs`): per viewer ≈ 206 kbit/s
= rows 85 + the own-vehicle viewer section 48 (the 44-float movement checkpoint, 180 B every snapshot) + events 25
(JSON payloads fanned out to every viewer that may observe them) + the sealed migration keyframe 20 + snapshot header
11 + SCTP/DTLS/UDP framing 14 + shells 3. The tiers only reach the rows: in the 14v14 soak the far tier held 47 % of the
entity-viewer pairs (median pairs near / mid / far 53 / 100 / 381) and the rows fell by more than half, yet the median
uplink went from 4,937 to 4,201 kbit/s — the floor under the rows is ≈ 120 kbit/s per viewer. Two cuts beside the tiers:
**20 Hz** for the near tier (§13.3's design; every per-snapshot cost falls by a third) and **the movement checkpoint at
10 Hz** (`VIEWER_CHECKPOINT_HZ`: the viewer section rides every snapshot, the 44 floats every second or third one; the
predictor replays from the row alone between and re-seats the integrator on the next — `snapshotRate.selftest` measures
the own misprediction at 3 cm against 2 mm with a checkpoint every snapshot, inside the 5 cm gate and released by the
110 ms envelope; no wire change, `movementVersion 0` was always a legal section). The 30 Hz / 20 Hz comparison on the same
tree (14v14, P3's arguments, one migration each; the table in 13.9.7) showed 20 Hz costing nothing measurable but the
interpolation delay — two intervals, 107 against 74 ms — with the uplink at 3,114 against 4,201 kbit/s, the desync,
hard snaps, migration and console figures alike; `SNAPSHOT_HZ` is 20 from this lane on, and the WELCOME names it.

**13.9.7 Before / after (the soak: `tools/mp-p2p-soak.mjs` at P3's arguments — 7v7: 5 min, 2 migrations; 14v14: 6 min,
1 migration; the realism run `--host=game --seats=4 --play=2 --migrate-every=1`; every run against `wrangler dev` of the
current Worker, host candidates, verdant, every hull driving and firing on the scripted controls, Chrome at nice 19 under
the probe mutex, one at a time; reports in the lane's scratchpad `p3b/soak-*/`; the "before" rows are P1b's runs of
2026-09-29 on `4902f2394` — the certification's tree with the room-cost pass, 30 Hz to every viewer, no tiers).**

| Run (tree) | Host uplink kbit/s median / p95 / max | Per viewer kbit/s | Refresh Hz per entity, near / mid / far (entity-viewer pairs) | Skips | Migration: first snapshot on every seat, ms (host_changed / new host live) | Desync at the end, worst seat (median; hard snaps) | Own hull at the migration: presented allies / enemies / new host, m — on the authority rows — prediction lead |
|---|---|---|---|---|---|---|---|
| **before** 14v14 (P1b, 30 Hz) | 4,937 / 7,291 / 9,241 | 183 | 29.9 to every entity (–) | – | 11,321 … 11,339 on 27 of 27 (8,020 / 11,288) | 0.095 m (0.001; 34) | 5.75 / 1.75 / 1.25 — rows 1.00 / **3.88** / 0.06 — lead 4.15 |
| **before** 7v7 (P1b, 30 Hz) | 1,596 / 2,073 / 2,567 | 123 | 30.0 (–) | – | 9,634 … 9,648 and 9,532 … 9,546 on 13 of 13 | 0.069 m (0.001; 5) | 3.97 / 5.27 / 4.33 and 4.99 / 2.78 / 0.00 — rows 0.21 / **8.89** / 0.20 and 0.49 / 4.74 / 0.00 — lead 0.99 / 1.09 |
| **before** realism 2v2 (P3, the game page hosting) | 136 at 3 peers | 45 | 30 (–) | – | 9,250 on 3 of 3 (8,040 / 9,250) | 0.001 m | 1.42 / 0.45 / 0.26 — rows 0.08 / – / – |
| after, 14v14 at **30 Hz** with the tiers (`2880b5e25`) | 4,201 / 5,597 / 9,682 | 156 | 29.9 / 14.9 / 9.9 (53 / 100 / 381 of 729) | 0 | 10,513 … 10,527 on 26 seats, **12,074** on one (8,012 / 10,469) | 0.311 m (0.002; 59) | 5.52 / 5.54 / 4.24 — rows 1.00 / **0.49** / 0.39 — lead 3.29; hints 19 applied / 7 refused |
| after, 14v14 at **20 Hz** with the tiers (`2880b5e25 --snapshot-hz=20`) | **3,114 / 4,445 / 5,096** | **115** | 20 / 10 / 6.6 (51 / 111 / 384) | 0 | **10,424 … 10,443 on 27 of 27** (8,009 / 10,369) | 0.150 m (0.001; 60) | 4.20 / 5.41 / 2.62 — rows 1.00 / **0.95** / 2.62 — lead 3.50; hints 18 / 8; interpolation delay 107 ms (74 at 30 Hz) |
| after, 14v14 on the final tree (20 Hz default, the room-socket ceiling; `750a97314`) | 3,178 / 4,438 / 5,303 | 118 | 20 / 9.9 / 6.6 (58 / 97 / 389) | 0 | 10,246 … 10,269 on 26 seats, **12,051** on one (8,010 / 10,214) | 0.957 m on one seat (next 0.155; median 0.001; 59) | 5.98 / 6.59 / 1.47 — rows 1.00 / **0.93** / 0.06 — lead 1.19; hints 19 / 7 |
| after, 7v7 on the final tree | **1,054 / 1,285 / 1,562** | **81** | 20 / 10 / 6.6 (20 / 26 / 76 of 169) | 0 | **9,593 … 9,611 and 9,354 … 9,366 on 13 of 13** (8,006 / 9,537 and 8,006 / 9,312) | 0.771 m on one seat (next 0.073; median 0.000; 36) | 2.20 / 5.31 / 5.16 and 4.54 / 0.21 / 4.22 — rows 0.29 / **0.73** / 0.67 and 0.41 / **0.09** / 0.34 — lead 1.19 / 0.86; hints 9 / 4 |
| after, realism 2v2 on the final tree with the message bucket (`d0f9fba9c`, the game page hosting) | **94** / 107 / 130 at 3 peers | 31 | 20 / – / – | 0 | **9,161 … 9,177 on 3 of 3** (8,117 / 9,121) | 0.001 m (0; 0) | 1.57 / 4.26 / 0.20 — rows 0.21 / **0.60** / 0.13 — lead 3.01; 0 console errors |
| after, 14v14 on the final tree with the message bucket and the signal diagnostics (`d0f9fba9c`) | 3,211 / 4,476 / 6,424 | 119 | 20 / 10 / 6.6 (54 / 92 / 387) | 0 | 10,101 … 10,118 on 25 seats, **12,040 and 12,048** on two (8,010 / 10,069) | 0.095 m (0.001; 69) | 6.01 / 3.87 / 1.92 — rows 1.00 / **0.90** / 0.09 — lead 6.45; hints 18 / 9 |

The deployed site's proof, `tools/mp-p2p-e2e.mjs --site=https://cot.kevinliu.studio --grace=8000` on this lane's tools
(2026-09-29 07:35, the site on deploy 132 — this branch is not deployed): **PASS** in 80 s — A hosting two peers on
`rtc://RUNQA9/1`, C saw B move 35.1 m over 360 snapshots, A closed → B elected after 8,280 ms (generation 2), C live on B,
A back as a peer on the auto path, 0 browser errors. The proof tool runs as before.

**What the table says.** The 14v14 host uplink is 3.1–3.2 Mbit/s median (from 4.9), p95 4.4–4.5 (from 7.3), 115–118
kbit/s per viewer (from 183): under the 4 / 5.5 Mbit/s line, at the ≈ 3 aim; 7v7 1.05 Mbit/s (from 1.6). The per-entity
refresh rates are exactly the tiers' (20 / 10 / 6.6 Hz at 20 Hz; 29.9 / 14.9 / 9.9 at 30) with the far tier holding
about half of the entity-viewer pairs on verdant's scripted drive. Skips for slow peers: 0 on every run (no peer ever
held 16 KB unsent on a LAN; the bound is for a home uplink). The migration seed: the enemies' hulls resume within a
metre on the authority rows (0.49–0.95 m from 3.88 at 14v14, 0.09–0.73 from 8.89 / 4.74 at 7v7) — the own-hull *presented*
jump stays at 4–6 m because it is the prediction lead being reset (§13.8's item (b), untouched here). Every migration
was continuous (tick ≥ the last seen, every seat live, the old host back as a peer in 715–780 ms). Console errors: 0 on
every run of the final tree.

**Two things the table also says, honestly.** (1) At 14v14 one seat of 27 (two in the last run) came in at
12.04–12.07 s in three of the four runs (the other: every seat by 10.44 s); those seats' first offer after the election
got no channel and the 3.5 s offer timer re-offered it — the certification's 17.3 s seat cut to 12.0, and 40–74 ms over
the 12 s gate. What the counters say about that first offer: the new host's acceptor answered every offer it received
(27 / 27 and 28 / 28, 0 answers refused — the room-socket ceiling of 13.9.4 is real but not this), the room relayed every
answer it was given (56 sent, 56 received across the room), the late seats' room clients passed the answer to their
transports (`signalsReceived` 3 against the typical 2) and the transports did not refuse it (`staleSignals` 0) — yet the
peer connection never reported `connecting`, which is what an answer *without ICE candidates* looks like; and the new
host's room client refused exactly one outgoing signal that was not an answer (`refusedAnswers` 0, its `signalsRefused`
1): a trickled candidate. The reading: the host's answer for the slowest of 27 simultaneously gathering peer
connections left at the 2.5 s `ICE_GATHER_CAP_MS` without its candidates, and the candidate that followed was refused on
the way out. Next: count answers sent at the cap and their embedded candidates, count trickle refusals by reason
(`readRoomSignalPayload`, the socket), and — the fix that needs no diagnosis — re-answer a peer whose channel has not
opened within a few seconds of a capped answer. (2) The desync outliers in the table — 0.957 and 0.771 m on one seat
with the next seat at 0.155 / 0.073 and the median at 0.001 — were a bug of this lane's first tree, found by the landing's
core suite (`tools/mp-client-soak.selftest.mjs`: 3.6 m of misprediction against 0.3 on the base tree at the same rate and
seed): the client reconciled its own hull at the row's capture tick, and a hull held still against a hull the client
cannot see has an *unchanged* row — carried through the deltas with its old tick — so every such frame was refused as
"no newer authority" and the prediction drove on through the obstacle until the row changed. The own row is on the near
tier, so a carried row is the authority's exact pose at the frame's tick: the client reconciles there again
(`observeOwnRow`, `snapshotRate.selftest`: a parked hull's carried rows reconcile every snapshot), and the client soak
reads 0.03–0.74 m at 20 Hz on three seeds against 0.03–0.56 at 30. The table's desync column predates the fix; the
tiers, the rate and the migration figures are unaffected by it (the own row was never tiered).

**Open (P3b → the integrator / P4).** The lost first offer at 14v14 (above: the capped answer, diagnostics landed, the
re-answer to build); the hull-jump
presentation gate (the prediction lead, §13.8 (b)); the peer tab RSS on the built site (P4); the next uplink cuts if a
home uplink needs them — events (25 kbit/s per viewer, JSON payloads to every observer) and the sealed keyframe
(20; to host-capable seats only, or a longer cadence now that the hint covers own hulls) — the checkpoint at 10 Hz was
measured and rejected (13.9.6); the actor's message bucket is new behaviour (150/s sustained, 900 burst) and the room's
`ROOM_MATCH_KEYFRAME_INTERVAL_MS` contract is unchanged.

**Receipts.** `server/match/interestTiers.selftest.mjs` (core): the radii, the phased cadences, the fresh-row rules and
engagement on the pure module; then the real actor on the bare height field with hulls placed at 40 / 60 / 200 / 400 /
420 m from the viewer — the own row, the near ally and the near enemy refreshed every snapshot, the middle ally every
second (samples 4 ticks apart), the far ally every third (6 ticks apart) on the viewer's decoded frames; the spotting
invariant on every frame (the entity set equals the authority's visibility set for the viewer, the oracle); a
spectator's moving hulls all fresh and its braking hull's unchanged rows carried forward field for field; a hit from the
near enemy that then leaps 380 m away keeping it on the near tier for 4 s and back on the far cadence after; the
per-viewer and actor counters (`ActorClientStats.interest`, `HostCoreStats.interest`: rows published per tier, rows
held, tier populations). `wire.selftest` (the AGE group, the resume hint), `interpolation.selftest` (mixed cadences),
and every existing multiplayer receipt on the new row tick.

### 13.10 Cutover (2026-09-29, lane `mp/v2-only`)

**The owner's instruction.** After the v1 path failed on production ("Room service unavailable" from the signaling
function behind `wss://cot.kevinliu.studio/api/signal`): "use the new stuff, get rid of all old in codebase. time to
clean up." So the peer-to-peer match over the rooms Worker (§13) is the only multiplayer, with no `?mp=` switch and no
v1 fallback, and the v1 stack leaves the tree. Two landings: this section's (the switch and the v1 entry gone from the
client), then the removal branch `mp/v1-removal` (src/net's browser-host stack, `api/signal.ts`, `cloudflare/signaling`,
the v1 tools and their receipts, the dedicated/container match pieces).

**What changed (stage A).**

- `src/app/multiplayerFlag.ts` is deleted: no `?mp=v2` / `?mp=v1`, no `localStorage["cot.mp.v2"]`. `src/main.ts` no
  longer constructs v1's browser session (`createNetworkBrowserSessionRuntime`), its room-failure runtime or the
  lazy v1 composition (`import('./net/networkBattleComposition.ts')`): the Play menu's `onNetworkStart` always enters
  through `beginMultiplayerV2Battle` and the composition of §13.7, built from `multiplayerAppPorts()` (the loader
  cover, the world, the warm owners, the activation runtime — the ports v2 read from v1's option object, now typed
  by `BrowserCompositionPorts`). `vite build` carries no v1 chunk: `battleModuleAccess` keeps the Play menu's import
  alone; the bridge / network-status / input-runtime / private-handoff / dedicated-client / room-chat dynamic imports are
  gone.
- The Play menu (`src/ui/playMenu.ts`) imports `createRoomConnectionAdapter` and `resolveRoomsUrl` itself. The
  "Connection settings / Signaling server" field, its failure action and the room-level ICE note ("direct-only room",
  `ice_degraded`) are gone; the room host is `VITE_ROOMS_URL`, the official site's Worker or the LAN helper. A
  deployment that names none fails at mode selection as `room_unconfigured`; a room host that does not answer is
  `RoomConnectError` (`room_unreachable`, `src/mp/room/roomClient.ts`) — both classify as the room service being
  unavailable ("Room service unavailable", retryable, no code to edit; the copy no longer mentions a signaling address).
  Invite links always stamp `v=2`; the adapter's contract (`RoomConnectRequest.roomsUrl`, `RoomConnectionOptions`,
  `RoomConnectionRuntime`) is its own, no longer v1's `PrivateRoomConnectionRuntime`.
- The room's Garage presence has its own owner, `src/mp/session/lobbyIntent.ts`, loaded with the menu: the pending
  lobby (menu-owned) and the composition's owned room (`network:roomState`) paint the Garage strip, warm the room's
  battlefield and builders through the lobby preloader, and relay Ready, the vehicle pick and the end screen's Start
  into the menu (`setReady`, `syncGarageSelection`, the new `startRound`). v1's room coordinator did this inside the
  network composition; nothing of it is loaded now.
- i18n: `playMenu.advanced.summary` / `.signal`, `playMenu.failure.settings`, the `playMenu.room.turn*` /
  `.directOnly` / `.action*` and `playMenu.note.relayUnavailable` keys are gone from both catalogs;
  `roomFailure.signalingUnavailable.detail` and `roomFailure.accessDenied.detail` no longer mention a signaling server.
- Receipts: `playMenuAdapter.selftest` (new: create / join / the lobby shape / the start handoff / forget / a
  superseded attempt / validation / an unreachable host over real sockets), `lobbyIntent.selftest` (new),
  `playMenu`, `privateRoomFailurePresentation`, `playSurfaceRuntime`, `battleModuleAccess`, `browserComposition`,
  `loadingIntent`, `fx/lazyRuntime`, `battleAgainAction`, `loadingScreens` and the v1 launch receipt (its main seam
  replaced by the callback it exercised) updated to the v2-only composition; `tools/mp-p2p-e2e.mjs`,
  `mp-browser-e2e.mjs` and `mp-p2p-soak.mjs` boot without `mp=v2`.

**Stage B — the v1 stack leaves the tree (branch `mp/v1-removal`, on stage A's tip).**

- *Moved, not deleted* (the modules the game still needs, at their real homes): the simulation's action bits
  (`src/sim/playerActions.ts`; the wire's `ACTION_BITS` is that table), the aim intent, the prediction authority state
  and the movement checkpoint (`src/sim/aimIntent.ts`, `predictionAuthorityState.ts`, `movementPredictionState.ts`), the
  authority's viewer snapshot capture — the spotting boundary before serialization — as `src/sim/worldSnapshot.ts` with
  its own receipt; the lobby shape the room publishes (`src/mp/room/lobbyShape.ts`, `roomToLobby` returns it); the
  session helpers `src/mp/session/{playMode, playerNames, roomInvite, roomFailure, compositionAccess, roundState,
  intentCover, activationRuntime, lobbyPreloader}.ts` and `src/mp/transport/iceConfig.ts`, the ICE credential endpoint
  beside the room host in `endpoint.ts`; their receipts follow them (`tools/selftest-suites.mjs`). The pacing gate's
  roster — the era-matched seeded bot fill of the first handoff, over which `server/battlePacing.selftest`'s 5–8 minute
  bands were measured — is the gate's own fixture, `server/pacingRoster.test-support.ts` (rooms plan their bots in
  `roomPolicy.ts`).
- *Deleted*: `src/net` (118 files; the browser-host authority, the v1 protocol, lobby, signaling client, WebRTC peer,
  frame pump, bridge, prediction, launch/presentation/room runtimes), `src/ui/networkStatus.ts` and `roomChat.ts` (the
  v1 HUD strip and in-battle chat), `api/signal.ts` (and its `vercel.json` function), `cloudflare/signaling` (the
  `cot-private-rooms` Worker's source — the deployed Worker is not touched by this branch), `server/{signalingServer,
  signalingCutover, signalingMembership, roomStore, distributedRoomStore, roomCode, dedicatedMatchServer,
  dedicatedMatchRegistry, rankedMatchmaker, ratingStore}.ts`, the parked container (`server/match/main.ts`, its
  Dockerfiles, `cloudflare/rooms/src/matchContainer.ts`, the shim/container branches of `matchHost.ts`, the `service`
  vitest project and its stub; `MATCH_SHIM_URL` leaves `wrangler.jsonc` — a var, no migration), the self-host stack
  (`compose.selfhost.yaml`, `compose.multiplayer.yaml`, `deploy/`, `Dockerfile.selfhost`, `Dockerfile.multiplayer`),
  the v1 tools (`multiplayer-browser-soak`, `multiplayer-four-player-soak`, `multiplayer-live-combat`,
  `multiplayer-guest-entry`, `private-room-errors-browser`, `production-private-room-ui`, `production-multiplayer-check`,
  `production-room-webrtc-check`, `production-room-abandonment`, `production-entry-observer`,
  `lobby-prefetch-before-ready`, `multiplayer-loading-build-probe`, `multiplayer-render-perf`, the CDP observers only
  they consumed, the dual-screen marketing capture) and their receipts, the `test:net:*` scripts other than `v2`,
  `server:signal`, `server:match`, `selfhost:config`, `multiplayer:config`, `net:prod:check`, the
  `quality:coverage:prediction` script; `docs/MULTIPLAYER-ARCHITECTURE.md` and `docs/MULTIPLAYER-HOSTING.md` are
  two-line pointers here.
- *Vocabulary*: the room failure codes are the room's (`src/mp/session/roomFailure.ts`: `expired`, `kicked`,
  `resume_denied`, `room_closed`, `room_full`, `invalid_room_code`, `access_denied`, `room_service_unavailable`,
  `connection_failed`); the i18n keys of the v1-only failures (host left, host runtime failed, the WebRTC timeouts) left
  both catalogs and `signalingUnavailable` became `roomServiceUnavailable`.
- *Kept on purpose*: `tools/multiplayer-frame-trace.mjs` (the Garage battle-actions probe uses it),
  `server/dedicatedWorldCollisionBrowser.ts` (the manifest loader's receipt compares against it), `server/match/service.ts`
  + `localRoomService.ts` (the LAN helper's in-process match), `api/ice.ts` and the TURN variables.
- *Environment names that are now dead for the owner to delete* (never deleted by this lane): `VITE_SIGNAL_URL`,
  `COT_SIGNAL_BACKEND`, `COT_SIGNAL_REDIS_REDIS_URL`, `COT_SIGNAL_REDIS_KV_URL`, `COT_SIGNAL_REDIS_KV_REST_API_URL`,
  `COT_SIGNAL_REDIS_KV_REST_API_TOKEN`, `COT_ALLOWED_ORIGINS` (if only `api/signal` read it — `api/ice.ts` keeps its own
  origin list), `VITE_MATCH_SERVICE`; `VITE_ICE_CONFIG_URL` and every `COT_TURN_*` / `COT_CLOUDFLARE_TURN_*` stay.
- *Worker*: `cloudflare/rooms` needs no migration (the class chain is unchanged: v1 created `Room` and the container
  class, v2 deleted the container class); the `@cloudflare/containers` dependency stays in `package.json` until the
  integrator can run `npm uninstall @cloudflare/containers` in `cloudflare/rooms` (this lane installs nothing).

**Hosting after the cutover (what `docs/MULTIPLAYER-HOSTING.md` said that is still true).**

- Internet rooms: the rooms Worker (`cloudflare/rooms`, Free plan; `cloudflare/rooms/README.md` deploys it), named by
  `VITE_ROOMS_URL` on the site build or, on the official site, by `src/officialHost.ts`. The room host is resolved by
  `src/mp/session/endpoint.ts`; there is no connection-settings field.
- LAN and offline: `npm run server:mp` (`server/rooms/main.ts`, port 8792: rooms plus the match in-process, or the
  browser-hosted match with `COT_ROOMS_MATCH_TRANSPORT=p2p`); browsers on the network choose LAN in the Play menu.
- ICE: `api/ice.ts` issues short-lived TURN credentials from server secrets (`COT_TURN_*`, `COT_CLOUDFLARE_TURN_*`,
  `COT_TURN_ICE_SERVERS_JSON`); the client asks `/api/ice` on https pages (`VITE_ICE_CONFIG_URL` names another
  endpoint) and uses host candidates on LAN. A strict NAT relays through TURN; nothing contacts a public STUN service
  implicitly.
- Verification: `npm test` (the room actor, the p2p host, the client, the composition, the headless p2p flow),
  `npm run test:net:v2:rooms` (the Worker under the Workers runtime), `npm run test:net:v2:p2p` (three real browsers),
  `npm run test:net:v2:p2p:soak`, and `tools/mp-p2p-e2e.mjs --site=https://cot.kevinliu.studio` against production.

### 13.11 Rooms never hang — the lifecycle proofs (lane `mp/room-lifecycle`, 2026-09-30)

**The owner's request**: "test that rooms dont stay hanging or anything." `tools/mp-room-lifecycle.mjs` drives real room
clients over real WebSockets (`ws`) — and, where a match must run, real sessions hosting on the scripted WebRTC world through
`createHeadlessSession` — through eighteen lifecycle scenarios against any room service (`--local`: the in-process
`server/rooms` with the p2p host, the Durable Object's own state machine; `--rooms=ws://…` wrangler dev with
`--var ALLOWED_ORIGINS:http://127.0.0.1:0` and `--origin=http://127.0.0.1:0`; `--rooms=wss://cot-rooms.kk23907751.workers.dev`
the deployed Worker with the site Origin header, rooms created and left, nothing deployed). Every step has a hard budget
(the contract's constant plus 5 s of slack); a step that never completes is a **HANG** named by what it waited for and every
seat's state at that moment; a wrong outcome is a FAIL; the table prints the time to resolution and the room messages
(client→room / room→client, keepalive frames included) per scenario, and the exit code is non-zero on any hang or failure.
The receipt `tools/mp-room-lifecycle.selftest.mjs` (core group, ≈ 40 s) runs the fast set on the real actor;
`npm run test:net:v2:rooms:lifecycle` adds the slow budgets (b2 the 30 s admin grace, c3 the 30 s report budget, c4 the
60 s link window, d4 the admin lease after every seat dropped).

**The contract, where the brief left a choice.** (a) A room every seat has left keeps its code for the 24 h idle TTL
(README: "rooms never close because a player leaves"; a shared invite link keeps working) with the expiry as its only
deadline, and **the next seat to join owns it** — `joinRoom` makes the first seat of an empty roster the admin. (f) A join
during `starting` / `playing` is refused `room_locked`, spectators included; a seat with a capability resumes and receives
its `match_start` again. (e) An elected last resort that cannot host says so (`unable`) and the match ends `lost` at once
when nobody else can; a preference decline keeps the P1b rule (the host is kept, it may boot afresh).

**Found and fixed** (each receipted in `roomActor` / `roomPolicy` / `roomClient` / `matchSessionP2p` / `playMenuAdapter` /
`playMenu` and, actor-side, in the Workers-runtime suite `cloudflare/rooms/test/p2p.test.ts` — five new tests on the real
Durable Object with its alarms; the proofs' double `tools/mp-p2p-room-double.ts` mirrors every rule):

| # | Where | What hung | Fix |
|---|---|---|---|
| 1 | actor (`roomPolicy.joinRoom`) | an emptied room kept its departed creator as `adminId`; `readRoomSnapshot` requires the admin among the players, so every later joiner's client refused its own `room_joined` snapshot (`invalid_payload: room snapshot identity`) and the code was dead until the 24 h expiry — scenarios a, d1–d3 on the deployed Worker and the base actor | the first seat to join an emptied room is its admin |
| 2 | actor (`leave`) | a non-admin's leave cleared a disconnected admin's lease (`if (room.adminId !== playerId) adminLeaseAt = null` was true for every non-admin leaver): the seats left behind had no admin to start with until the admin returned — b2 hung 35 s on the deployed Worker and the base actor | `settleAdminLease`: cleared only when the admin is connected or gone, armed when the admin seat is disconnected without one |
| 3 | actor (`tick`) | the admin lease re-armed every 30 s while nobody else was connected: an abandoned room (every tab closed, the common exit) fired 2,880 billed alarms a day, each a storage write — 35 such rooms exhaust the Free plan's daily requests | a due lease with no migration target is not an alarm (`nextDeadline` gates it on `adminMigrationTarget`); the next admission's reschedule runs it at once, so a newcomer owns the room without a further wait |
| 4 | actor (`seatLeases`, `reapSeats`) | seats whose sockets closed were never reaped: a 1v1 room whose guest closed the tab refused every newcomer (`room_full`) for 24 h | `ROOM_SEAT_DISCONNECT_TTL_MS` = 5 min while the room waits (housekeeping: the idle clock does not restart); a seat of a running match is kept and its lease restarts at the end; durable, optional on restore (a pre-lane state gives every socketless seat a lease from the restore) |
| 5 | actor (`migrateHost`) + client | the last resort elected after the host's tab died could not host (the mobile tier, a failed boot, a Garage return): the room kept it as a host that never reported and the peers waited out the 30 s report budget — e2 resolved in 38.0 s on the base actor | `host_decline { unable: true }` ends the match `lost` at once when nobody else can (`loseMatch`); the client says `unable` on every cannot-host path; e2 resolves in 8.0 s (the host grace) |
| 6 | client (`RoomClient.transportChanged`) | a resume the room refused (`room_not_found` after the room went away) was swallowed: the client sat in `connecting` while the room retired the silent socket every 15 s and the transport reopened it — without end | the refusal ends the client with the room's code (`onClosed('room_not_found')` → the menu's "room expired") |
| 7 | client (`RoomClient.receive`) | two clients of one seat sharing its capability (two tabs of one browser) flapped the seat between them without end — the room retires the first with `resume_denied`, the first reconnects and resumes, the room retires the second, … every hop a billed message — f3 hung on the local actor with the deployed client's logic | an unsolicited `resume_denied` ends the retired client; it never resumes; f3 resolves in 0.02 s |
| 8 | client (`closeReasonFor`) | the reconnect window running out (`exhausted`) reached the Play menu as a generic connection failure | `room_unreachable` — the code a failed admission carries — so the menu shows "Room service unavailable" with Try again (`playMenuAdapter.selftest` over real sockets: the service closes the socket and stays away → `onClose('room_unreachable')`, `signaling_unavailable`, `canRetry`); Return to Garage stays unconditional (`playMenu.selftest`) |

No wrangler migration tag changes: the `Room` class and its storage shape are unchanged (`RoomActorState` gains an optional
field). This lane deployed nothing; items 1–5 reach production with the next deploy, items 6–8 with the next client build.

**Table 1 — wrangler dev (this branch's Worker code under miniflare, 2026-09-30 17:05, every scenario with `--slow`).**

| Scenario | Outcome | Resolution | Messages →/← | Detail |
|---|---|---|---|---|
| a creator leaves an empty lobby; a new seat joins the same code | PASS | 0.03 s | 6/10 | joined as admin, started |
| b1 creator leaves with seats present | PASS | 0.03 s | 9/23 | admin passed at once; the new admin started |
| b2 creator drops with seats present; a seat leaves during the grace | PASS | 30.03 s | 9/20 | admin passed at the 30 s grace; the dropped seat held for its lease |
| c1 a seat drops at match start (scripted host) | PASS | 0.06 s | 13/37 | `playing` on the host's report; `waiting` with the verdict |
| c2 the host drops at match start | PASS | 8.01 s | 11/39 | `host_changed` (timeout) to the next commander, the secret on its copy alone; playing, then the verdict |
| c3 the host stays connected and never reports | PASS | 30.00 s | 12/30 | replaced at the report budget |
| c4 a peer whose host reports but never accepts its link | PASS | 66.51 s | 47/57 | the session reaches `lost` at the 60 s link window; the room stayed `starting` on the hanging host's reports |
| d1 all seats leave mid-match, host last; a new seat starts a new match | PASS | 0.01 s | 28/56 | lost → waiting; the new seat admin at once, its host live |
| d2 all seats leave mid-match, host first | PASS | 0.17 s | 38/74 | two elections at once (`declined`: the Garage return declines before the leave), then lost; the new seat starts |
| d3 the only seat leaves mid-match | PASS | 0.00 s | 18/30 | lost → waiting; the new seat starts |
| d4 all seats drop mid-match (sockets closed) | PASS | 8.01 s | 26/67 | lost at the host grace; the new seat admin 22.0 s after joining (the 30 s lease from the host's drop), its match live |
| e1 the host's tab dies with a willing successor | PASS | 8.13 s | 29/55 | elected 8,021 ms after the drop; every seat live on the successor, nobody migrating |
| e2 the host's tab dies with no willing successor | PASS | 8.03 s | 16/32 | the last resort elected at the grace, `unable` → lost at once; the peer terminal (`lost`), the room waiting |
| f1 a bogus and a malformed room code | PASS | 0.02 s | 1/1 | `room_not_found`; `invalid_room_code` before any socket |
| f2 a join during playing (commander and spectator) | PASS | 0.04 s | 10/19 | `room_locked` for both; the lobby admits after the verdict |
| f3 a double join of the same seat, and a stranger with its id | PASS | 0.02 s | 4/5 | one seat, one socket; the retired client `resume_denied`, never resuming; the stranger refused |
| g twenty rooms created and left | PASS | 0.61 s | 40/40 | every socket closed |

**Table 2 — the deployed Worker (`wss://cot-rooms.kk23907751.workers.dev`, deploy 155 = the actor before this lane,
this lane's client and tool, the site Origin, read-only rooms; 2026-09-30 17:05).** Scenarios d and e need a match host
and ran against wrangler dev (Table 1) as the brief asked.

| Scenario | Outcome | Resolution | Messages →/← | Detail |
|---|---|---|---|---|
| a | **FAIL** | – | 3/3 | `RoomError: room snapshot identity` — the departed creator is still admin; the joiner's client refuses the snapshot (fix 1, lands with the next deploy) |
| b1 | PASS | 0.08 s | 9/23 | admin passed |
| b2 | **HANG** | – | 6/12 | the admin never passed in 35 s: p3's leave during the grace cleared p1's lease; p2 left with a disconnected admin and no start (fix 2) |
| c1 | PASS | 0.21 s | 13/37 | playing |
| c2 | PASS | 8.04 s | 11/39 | successor elected |
| c3 | PASS | 30.00 s | 12/30 | silent host replaced |
| c4 | PASS | 66.53 s | 47/57 | session lost at the link window |
| f1 | PASS | 0.53 s | 1/1 | clean refusals |
| f2 | PASS | 0.41 s | 10/19 | `room_locked`, spectators too |
| f3 | PASS | 0.50 s | 4/5 | one seat, one socket — with this lane's client; the deployed client flaps (fix 7) |
| g | PASS | 10.37 s | 40/40 | 20 rooms, every socket closed |

**Table 2b — the deployed Worker after this lane's actor (`6635b70d-97fc-4ef5-8690-bf285c7a33ac`, uploaded 2026-09-30 17:50
from `c363e1e67`; the site Origin, read-only rooms, every scenario the tool can run remotely, `--slow` for b2/c3/c4/d4).**
The first full run started within seconds of the upload and failed scenario a (`room snapshot identity`) while the actor
still ran `feec176b`; a alone (0.22 s, 6/10, "joined, admin, started") and a clean full run (13/13 in 59.7 s) passed, so
the row below is that clean run plus the slow set (4/4 in 166 s). Nothing hung.

| Scenario | Outcome | Resolution | Messages →/← | Detail |
|---|---|---|---|---|
| a | PASS | 0.22 s | 6/10 | joined, admin, started — the emptied room belongs to its first new joiner (fix 1) |
| b1 | PASS | 0.08 s | 9/23 | admin passed |
| b2 | PASS | 31.06 s | 9/20 | the admin passed at the disconnect grace; p3's leave no longer clears p1's lease (fix 2) |
| c1 | PASS | 0.16 s | 13/37 | playing |
| c2 | PASS | 8.07 s | 11/38 | successor elected |
| c3 | PASS | 30.88 s | 12/30 | silent host replaced |
| c4 | PASS | 70.57 s | 47/57 | session lost at the link window |
| d1 | PASS | 0.16 s | 29/57 | everyone gone, the new seat admin at once (`adminAfterMs` 0) |
| d2 | PASS | 0.35 s | 38/74 | everyone gone, host first; the new seat admin at once |
| d3 | PASS | 0.05 s | 18/30 | the only seat left; the new seat admin at once |
| d4 | PASS | 33.77 s | 27/68 | sockets closed mid-match; the new seat admin after the grace, match started |
| e1 | PASS | 8.21 s | 29/55 | elected in 8.05 s, every seat live |
| e2 | PASS | 8.14 s | 16/32 | terminal (`lost`) within the grace — the unable last-resort host ends the match at once (fix 5) |
| f1 | PASS | 0.29 s | 1/1 | clean refusals |
| f2 | PASS | 1.53 s | 10/19 | `room_locked`, spectators too |
| f3 | PASS | 0.91 s | 4/5 | one seat, one socket |
| g | PASS | 10.0 s | 40/40 | 20 rooms, every socket closed |

**Table 3 — the base actor (`a80a8b8c3`'s `server/rooms` LAN helper with `COT_ROOMS_MATCH_TRANSPORT=p2p`, this lane's
client and tool, every scenario with `--slow`): what the proofs find before the fixes.** a FAIL (identity), b1 PASS,
b2 HANG (35.0 s), c1 PASS, c2 PASS 8.14 s, c3 PASS 30.07 s, c4 PASS 69.6 s, **d1 / d2 / d3 FAIL** (identity: the new seat
cannot join the emptied room), **d4 HANG** (the new seat never admin in 35 s: the watcher's leave cleared the lease), e1 PASS
9.16 s, **e2 FAIL** (terminal after **38.0 s** — the grace plus the report budget — not within the grace), f1–f3 PASS, g PASS.
The local receipt's fast set on this branch: 14 scenarios PASS in 38.8 s (local run 2; f3 hung 5 s in run 1 before fix 7).

**What the tables say.** On the Worker's own code with this lane every scenario resolves inside the contract's constant:
the admin at once on a leave and at the 30 s grace on a drop, the host at the 8 s grace (c2, d4, e1, e2), a silent host at
the 30 s report budget (c3), a peer whose host never links at the client's 60 s window (c4 — the one bound that is the
client's, surfaced as `lost` → the entry failure / the disconnect overlay), every refusal clean (f), twenty rooms churned
with every socket closed and each actor holding only its idle expiry (g, asserted on the local actor). On production today
(deploy 155) two of the eleven room-only scenarios are stuck states — a (dead code after the creator leaves) and b2 (no admin
after a leave during the grace) — and the client-side hangs 6–7 are in the deployed client; none of them needs a Worker
class change.

**Receipts.** `tools/mp-room-lifecycle.selftest.mjs` (core), `roomActor.selftest` (six new sections: the emptied room,
the un-re-armed lease and the admission that runs it, the lease kept across a leave, the reap with its match exception
and restart, `unable` at once against the P1b keep, the leases' hibernation round trip and the legacy state),
`roomPolicy.selftest`, `roomClient.selftest` (the refused resume, the two-tab flap, `room_unreachable`),
`matchSessionP2p.selftest` (`unable` on the cannot-host and Garage-return declines, the re-entry decline a preference),
`playMenuAdapter.selftest` (the service closing the socket → "Room service unavailable" with Try again), `playMenu.selftest`
(Try again and Return to Garage pinned), `cloudflare/rooms/test/p2p.test.ts` (ROOM19–ROOM23: the emptied room's alarm and
owner, the un-re-armed lease and the admission migration, the lease across a leave, the reap and its match exception,
`unable` at once), `roomWorkerProgram.selftest` (DOM-free). The new receipts fail on the base commit (a scratch worktree at
`a80a8b8c3`: `roomPolicy` "the first seat to join an emptied room owns it", `roomClient` "timeout: the refused resume ends
the client").

### 13.12 UI states and syncing walked (lane `mp/ui-sync-check`, 2026-09-30)

**The owner's request**: "double check UI states and syncing." Three headless Chromes (puppeteer, `nice -n 19`, one probe
at a time) on a vite dev server of this tree against the in-process LAN room helper with the peer-to-peer host
(`createRoomsServer({ matchTransport: 'p2p' })`, the Durable Object's own state machine), plus the shipped proofs. Every
state below was screenshot and read back from the DOM (localized copy, no raw i18n keys, no leftover v1 field: the
dialog carries `name`, `code` and the size select only); every sync figure was sampled from all tabs at one wall time.

**UI states — what the player sees.** Garage → *Multiplayer* opens the play dialog with Private selected and Join
disabled until six characters; LAN selects; Create gives the lobby with the six-character code, the invite URL stamped
`v=2`, START disabled, the HOST badge on the creator, Ready enabled, Rejoin hidden; the Garage behind it shows the room
strip ("LAN lobby CODE · not ready · 0/1 ready") and, with a room held, hides the multiplayer entry (the strip reopens the
lobby). A second seat opening the invite sees "Join Alpha Lead's Game / LAN invitation / You are in room CODE…" with the
HOST badge on the creator and no START; its row reaches the creator's list 1–11 ms after its own (joins and leaves are
never coalesced); the arrangement of three seats across two teams reads identically on all three tabs; a leave drops the
row on the others within 2–11 ms and leaves the leaver in a clean Garage with no room socket. START enables only when
every active seat is READY (a spectator reads WATCHING and does not block it) and disables again when one un-readies; the
Garage strip's Ready relays into the room ("· ready · 3/3 ready"). Start covers every tab with the loader, reveals the
battle on all three (13.9 / 19.4 / 14.0 s), the strip reads "9 MS · HOST · SEAT 0 · 3/28" on the host and "1 MS · SEAT 1 ·
3/28" on a peer, F3 expands the panel (17 rows: Link Live, Round trip, Updates 19.7 of 20 Hz, Role Hosting for 2 / Peer,
Path this browser / direct, Host uplink, Generation 1, Room Joined · In battle, Seat, Seated 3 / 28). Dialogs: a wrong
code → "Room not found or expired" with *Join another room* and *Return to garage*; a full 1v1 room → "This room is full";
a join while the room plays → "Room access unavailable" (`room_locked`); a second tab of one seat → the first tab's
"This connection was replaced" while the second holds the seat; the room service down → every lobby shows "Connection
interrupted. Trying to reconnect for a limited time…", a fresh Create shows "Room service unavailable" with *Try again*
after 10.1 s (65 s before this lane: the first admission waited out the transport's 60 s window — fixed in
`roomClient.ts`), the service back → the lobbies' refused resume reads "Room not found or expired" and *Try again* creates a
room; every dialog's *Return to garage* leaves a clean Garage. Host loss with a successor: the peer's banner "New host:
Commander FJG4 · resuming…", the elected seat's "You are the new host · resuming the match…", elected 8.3 s after the
close, the first snapshot from the new host on the peer 10.7 s after it, the HOST badge moved, generation 2 on both,
scores and hulls continuous (0 m), the banner cleared. Host loss with no successor (two mobile-tier peers): terminal in
8.3 s, "The match connection was interrupted. No result was recorded." on both end screens, *Return to garage* → clean
Garage, the room waiting with no Rejoin. The end screen after a verdict shows the same result by team (victory / defeat /
defeat), the same scores (25 : 100) and clock (70.9 s) on every tab, the rematch panel ("READY FOR NEXT BATTLE", the admin's
"WAITING FOR TEAM" until everyone is ready) and *Return to garage*; after it each tab holds the Garage with one room
socket, no peers, no loader, no banner, no battle strip, the lobby back to waiting. Mobile 390×844: the dialog and the
lobby fit the viewport (panel 370 px wide, no horizontal overflow, no overlapping controls, no clipped labels).

**Syncing — the numbers.** `tools/mp-p2p-headless.mjs`: discontinuity across the migration 0.04 m (gate 1.0 m; raw 0.70 m
over 0.07 s of driving), elected 1.5 s after the grace, the rejoined seat welcomed by the new host. The three-tab battle
(zone control, 150 s, 233 samples at 500 ms, wall skew ≤ 103 ms): hull divergence between tabs 0.26 m median / 1.28 m p95 /
2.59 m max while a hull moves (the ~230–300 ms interpolation delay at up to 10 m/s) and 0 / 0.01 / 0.12 m at rest; both
allies saw each other drive 47–65 m; 116 hits and 4 destructions over the window, every hit on a hull a tab could see
present on that tab (183 of 183), damage values identical where two tabs saw one hit, every destruction on all three
tabs, the kill feed naming the same pairs; scores never differed beyond a tab reading one sample behind a 25-point kill;
the clock within 0.08 s p95 across tabs; 20 Hz snapshots on every peer (soak: 20 Hz median, min 19.9; host uplink 103
kbit/s median at 3 seats; peer desync 0.17 m; tick p95 0.3 ms). Scores and clock agreed at the verdict on every tab. A
seat back in the Garage with the room kept is offered *Rejoin battle*; a fresh join by code while the room plays is
`room_locked` (the contract of §13.11, not a late join). No human was destroyed in the sampled windows, so the respawn
flow was not observed in a browser (the bots' destructions and the mode's respawn table were).

**Found and fixed (receipted).** (1) The room's arrangement never reached the match: the lobby's rule card promised
"respawn in 6 s · First to 100" and every tab played to 750 — `HostBootConfig` carried neither `arrangement` nor
`campaignOperationId`, the host core and the LAN helper's in-process match booted `matchRulesetFor(mode)`;
`src/mp/host/hostRuleset.ts` now derives the ruleset the lobby promises, the session passes the room's settings (and the
sealed configuration's across an election), the WELCOME's `rulesetJson` reaches `game.ruleset` for the HUD; after the fix
the three tabs played to 100 and ended by score (`hostRuleset.selftest`, `battlePresentation.selftest`). (2) A first
admission against a dead room host took 65 s to fail; bounded by the request timeout (`roomClient.selftest`). (3) Host
warn-level logs ("match report refused host_only" after an election, an elected mobile seat declining) were console errors,
which the browser proofs count as failures; they are warnings now (`browserComposition.selftest`). (4) The shipped
`npm run test:net:v2:browser` read the removed connection-settings field and clicked the hidden multiplayer entry; fixed
and green (73 s). (5) Two stale banners on end screens: after a verdict the actor closes its links at the end of the ending
hold and the status banner read "Connection lost · the battle continues without you" (with Leave battle) over VICTORY; on a
lost match the elected-but-unable peer's "New host: … · resuming…" stayed over the after-action report. The status snapshot
now carries the round's verdict (the client's `lastVerdict`) and `roundOver` (a verdict, or the room's match ended / lost):
once the round is over the banner says nothing about the match link (the room link alone may still reconnect), and a
session ends an open migration when its round ends (`networkStatus.selftest`, `matchSessionP2p.selftest`). Open: a malformed invite link (`?room=AB`) is dropped silently by `parseRoomInvite` — the "Check the room
code" dialog exists but no product path reaches it.

## 10. Decisions for the owner

1. **Hosting account.** ~~Run the match containers in the existing Cloudflare account (Workers
   Paid)?~~ Decided 2026-09-28: no paid plan — the match runs peer-to-peer in the host's browser (section 13); the
   container is parked.
2. **Retire browser-host P2P.** ~~v2 has no browser authority.~~ Reversed 2026-09-28: v2's authority runs in the host's
   browser over WebRTC, with the Room DO for rooms, signaling and host migration; v1's stack retires after the cutover.
3. **One location per room** near its creator (friends across continents accept one RTT).
4. **Telemetry.** Anonymous boot/error beacons on by default with an opt-out in settings.
