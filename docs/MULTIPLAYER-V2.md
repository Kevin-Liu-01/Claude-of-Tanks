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

<!-- AUDIT-1: the code-level audit of the v1 stack (topology, limits, lifecycle, netcode, tests) is
     folded in here when the audit lands. -->

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

<!-- AUDIT-2: the first-entry audit's ranked failure causes are folded in here when it lands. -->

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

## 10. Decisions for the owner

1. **Hosting account.** Run the match containers in the existing Cloudflare account (Workers
   Paid; cost as above)? The alternative is a small VPS the owner provisions.
2. **Retire browser-host P2P.** v2 has no browser authority; LAN moves to the local helper.
3. **One location per room** near its creator (friends across continents accept one RTT).
4. **Telemetry.** Anonymous boot/error beacons on by default with an opt-out in settings.
