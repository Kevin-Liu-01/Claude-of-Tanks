# Match service (`server/match`)

The server side of Multiplayer v2 (`docs/MULTIPLAYER-V2.md`): one Node process
hosts N `MatchActor`s, each running the renderer-free authority
(`src/sim/authoritativeMatch.ts`) at 60 Hz for one room and publishing 30 Hz
interest-managed binary snapshots over WebSocket. The same process image runs
in a Cloudflare Container (one actor), on a VPS behind Caddy (N actors) and as
the LAN helper. Clients speak `src/mp/wire`.

## Layout

| File | Owns |
|---|---|
| `main.ts` | CLI entry: env, the service, SIGTERM/SIGINT drain (`node server/match/main.ts`). |
| `service.ts` | HTTP `/healthz` + `/metrics`, the `/match` WebSocket upgrade (origin allowlist, payload bound, HELLO within 5 s, seat-token verification, routing to the room's actor), the actor registry and drain. |
| `matchActor.ts` | One room: roster and entity ids, the authority and its world collision lease, the loop, seat admission, input admission, lag compensation, snapshot publishing with backpressure, reliable events, chat, verdict, stop. |
| `loop.ts` | Drift-corrected fixed-step scheduler (`dt = 1/60`, tick counters; wall clock only decides how many ticks are due; stalls drop the backlog). |
| `inputBuffer.ts` | Per-seat tick-keyed control buffer: v1's rejection rules, the adaptive 1–3 tick jitter buffer, the 500 ms held-input lease, fire/action edges applied once per sequence. |
| `lagCompensation.ts` | Per-seat latency tracker and the `shellRewind` hook that swaps every other tank to its rewound pose around a shell's sweep. |
| `publisher.ts` | Per-viewer acknowledged-baseline history, keyframe policy, server-side RTT from acks. |
| `entityRows.ts` | Authority entity → wire row / shell row / viewer section / meta. |
| `seatToken.ts` | HMAC-SHA256 seat tokens issued by the room service. |
| `localRoomService.ts` | The room side for tests, receipts, the soak and the LAN helper (roster, tokens, actor start, verdict). |
| `link.ts` | The transport contract (`ClientLink`) and the in-memory pair receipts use. |
| `chat.ts`, `log.ts`, `metrics.ts` | Chat normalization + limits, JSON-lines logger, p50/p95 histogram. |

`src/sim/**` is untouched except one additive seam (`shellRewind`, see below)
and the roster cap (14 → 64); `src/sim/poseHistory.ts` is new.

## Tick pipeline

Every tick: collect each seated client's control for this tick from its jitter
buffer → `authority.step({ dt: 1/60, inputs })` → record every pose into the
400 ms history → deliver the authority's per-viewer events (`EVENT`) → settle
the verdict → every second tick, publish snapshots. The match starts when the
actor is created (the room service decides); clients join a running match and
receive a keyframe at once. After the verdict the actor keeps publishing for 5 s,
then closes every client with `MATCH_ENDED` and releases its world lease.

## Admission

The first frame must be a `HELLO` (within 5 s) carrying a seat token. Tokens
are `base64url(JSON claims).base64url(HMAC-SHA256)` signed with
`COT_MATCH_SEAT_SECRET` by the room service (`LocalRoomService` for now, the
Room Durable Object in phase 2): `{ v: 1, roomId, seat, playerId, name, team,
specId, iat, exp }`. The service verifies the signature and expiry, routes the
socket to the actor named by `roomId`, and the actor checks the seat against
its roster. A second connection for the same seat replaces the first
(`REPLACED`). Spectator seats (`team: 'spectator'`) receive snapshots of both
teams and every event, and may send no `INPUT` (`NOT_SEATED`).

## Inputs

Controls are keyed by the client's intended server tick. A frame further ahead
than 120 ticks is rejected (`INPUT_TOO_FAR_AHEAD`); controls for ticks already
applied are dropped as stale; redundant copies (each frame carries the last 3
ticks) are deduplicated by tick. The seat's buffer applies control `T` at server
tick `T + B`, `B ∈ [1, 3]`: it grows by one when more than 5 % of a one-second
window arrived late and shrinks when the window's minimum margin exceeded
`B + 2`. A late control still newer than the last applied one runs at the next
tick; without fresh controls the last one is held for 30 ticks (500 ms), then
drive and fire are released while aim and ammunition selection are kept
(v1's rule). Fire and action edges are sequence numbers applied once per new
value; the snapshot acknowledges `ackedInputTick`, `ackedFireSeq`,
`ackedActionSeq` and reports `inputMarginTicks` so the client can keep its lead
in the 1–3 tick band.

## Lag compensation

Rule: every sweep of a shell fired by a seated player tests every other tank at
the pose it had `R` ticks earlier, `R = round((owd + interp) / tickMs)`
clamped to `[0, 15]` (250 ms), where `owd` is the server's own measurement
(half the median of the last eight round trips, each measured from a
snapshot's send time to the first acknowledgement of its tick) and `interp` is
the interpolation delay the client reports in every `INPUT` (u8 ms, clamped to
250). `R` is fixed for the shell's whole flight, so a shot lands where the
shooter's reticle was at any range; the victim is hit at most 250 ms "in the
past". The swap wraps the whole sweep — trace, damage localization, exit trace
and HE bursts read the rewound poses — and the live poses are restored before
the next shell (`authoritativeMatch.ts` `shellRewind` seam; the pose ring is
`src/sim/poseHistory.ts`). Bots and spectators never rewind. The actor counts
rewound shots and, for each, the nearest target's live-vs-rewound displacement:
`/metrics` → `lagComp.mismatchMeanM` is the reticle error the rule removes.

## Snapshots and interest management

Per viewer, every second tick: the authority's own visibility filter
(`snapshot({ viewerId })`) decides the rows — the viewer's team always, enemies
while spotted, everything for spectators — and hidden coordinates are never
serialized. Rows are captured once per tick from raw state (mm, u16 turns) and
delta-coded per viewer against its last acknowledged snapshot; a keyframe goes
every 2 s and whenever the acknowledged baseline is no longer held (a client
that never acknowledges receives only keyframes). Backpressure: with more than
64 KB buffered on the socket the snapshot is dropped (never queued behind);
above 512 KB, or 64 KB sustained for 2 s, the client is closed with
`BACKPRESSURE`.

## Measured (receipts, 2026-09-25, Apple Silicon dev host)

`tickCost.selftest`: 28 bots (14v14), dedicated collision shards, 600 measured
ticks after 120 warm-up; six heaviest maps by `cpuP95Max` of
`docs/references/perf/round59-map-perf-audit.json` plus the most collision
parts (monsoon):

| map | headless p50 / p95 ms | +28 acking viewers p50 / p95 ms | egress per spectator |
|---|---|---|---|
| winter | 0.72 / 1.53 | 1.40 / 3.79 | 28.1 KB/s |
| mars | 0.67 / 1.82 | 1.21 / 2.48 | 26.1 KB/s |
| alpine | 1.11 / 3.99 | 1.67 / 3.76 | 29.2 KB/s |
| badlands | 0.78 / 2.03 | 1.44 / 3.79 | 26.9 KB/s |
| delta | 1.11 / 3.11 | 1.57 / 3.70 | 29.0 KB/s |
| steppe | 0.95 / 2.79 | 1.23 / 2.27 | 27.2 KB/s |
| monsoon | 1.11 / 2.68 | 1.68 / 4.17 | 29.1 KB/s |

Budget: p95 ≤ 6 ms. Wire sizes (`src/mp/wire/wire.selftest`): full row 44 B,
moving delta row 16 B, 28-entity keyframe with the viewer section 1473 B,
input frame 57 B. A spectator sees all 28 rows; a seated player sees its team
plus spotted enemies, so its egress is lower.

## Environment

`COT_MATCH_PORT`, `COT_MATCH_HOST`, `COT_MATCH_ALLOWED_ORIGINS`,
`COT_MATCH_SEAT_SECRET`, `COT_MATCH_MAX_ACTORS`, `COT_MATCH_LOG_LEVEL` — names
only; values live in the platform's secret store. TLS is terminated by the
platform (Caddy / Cloudflare). `GET /healthz` is the readiness probe (503 while
draining); `GET /metrics` returns JSON (service totals, per-actor tick p50/p95/
max, clients, bytes, snapshot/keyframe/drop counts, lag-compensation stats).

## Container

`server/match/Dockerfile`: a `node:24-alpine` deps stage (production dependencies
pruned to `three`'s ESM build plus the four `examples/jsm` directories the
vehicle and world modules import, and `ws`; the node binary stripped), a
`sources` stage that drops receipts, docs and the browser-only subsystems, and a
plain Alpine runtime with the node binary that runs `node server/match/main.ts`
through Node's native type stripping. Measured 2026-09-25 (Docker 29, colima):
291 MB in `docker image ls` (the containerd store counts compressed + unpacked),
216 MB of unpacked layers, 75 MB compressed content; `/healthz` answers about
3 s after start. `Dockerfile.dockerignore` trims the BuildKit context; the
legacy builder ignores it, which is why the Dockerfile prunes in stages.

```
docker build -f server/match/Dockerfile -t cot-match .
docker image ls cot-match
docker run --rm -p 8791:8791 -e COT_MATCH_SEAT_SECRET=<secret> cot-match
```

The in-container closure check (the pruned tree must still load every map,
vehicle and `three` module the actor needs):

```
docker run --rm cot-match node --input-type=module -e "import { createMatchActor } from '/app/server/match/matchActor.ts';
const bots = []; for (let i = 0; i < 28; i++) bots.push({ playerId: 'b' + i, name: 'b', team: i < 14 ? 'alpha' : 'bravo', specId: i % 2 ? 't90m' : 'm1a2' });
let now = 0; const actor = createMatchActor({ roomId: 'smoke', mapId: 'alpine', seed: 1, seats: [], bots, world: 'dedicated', countdownS: 0, now: () => now, schedule: () => () => {} });
for (let t = 0; t < 120; t++) { now += 1000 / 60; actor.advance(now); } console.log(actor.tick); actor.stop();"
```

## Receipts

`node server/match/loop.selftest.mjs`, `inputBuffer.selftest.mjs`,
`seatToken.selftest.mjs`, `matchActor.selftest.mjs` (loopback: welcome,
cadence, deltas/keyframes, interest set equals the authority's, server-measured
RTT → rewind budget, fire edge once, chat, malformed/spectator/far-ahead
rejections, backpressure drop then close, replace, leave, verdict + linger),
`service.selftest.mjs` (real sockets: admission classes, origin allowlist,
healthz/metrics, replace/leave, capacity, drain), `tickCost.selftest.mjs`
(the table above). All registered in the core group. The 28-client soak is
`npm run test:net:v2:soak` (`tools/mp-soak.mjs`).
