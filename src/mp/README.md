# Multiplayer v2 client (`src/mp`)

The browser side of `docs/MULTIPLAYER-V2.md`: a server-authoritative match
client for up to 14v14 that speaks the binary wire in `src/mp/wire`, predicts
the viewer's own tank through the shared movement module, interpolates
everyone else, and drives the existing renderer, HUD, FX and audio through one
thin presentation adapter. Every layer below `presentation/` runs unchanged in
Node — the receipts and the soaks drive the real client headless — and nothing
under `src/mp` is imported by the solo boot path.

## Module map

| Directory | Owns | Node-runnable |
|---|---|---|
| `wire/` (server lane) | The binary schema and codecs both sides share. Import it; never edit it from the client lane. | yes |
| `transport/` | `Transport` contract (`open/send/reconnect/close`, `onFrame/onState`, `bufferedBytes`, typed close reasons), `WebSocketTransport`, `LoopbackTransport` pair. | yes |
| `match/` | `MatchClient` and its parts: `clock.ts`, `inputStream.ts`, `snapshotStream.ts`, `interpolation.ts`, `prediction.ts` (+ `movementCheckpoint.ts`), `events.ts`, `recovery.ts`, `headlessDriver.ts`; `scriptedServer.test-support.ts` is the fixture server the receipts use. | yes |
| `presentation/` | `PresentationAdapter` + `bindMatchPresentation`, `RecordingPresentation` (headless), `createBattlePresentation` (the renderer/HUD/FX/audio bridge), `createPredictionWorld` (the collision the prediction integrates against). | adapter + recorder yes; the battle presentation needs the fleet and `three` |
| `room/` | The room protocol and policy both sides share, `RoomActor` (the room state machine the LAN helper and the Worker run), `RoomClient` (create/join/resume, commands, chat, `match_start`). | yes |
| `session/` | `MatchSession` (one room's session owner: a `MatchClient` and a presentation per round), `createHeadlessSession` (receipts, `tools/mp-rooms-e2e.mjs`), `createRoomConnectionAdapter` (the Play menu's v2 room connection), `resolveRoomsUrl` (the rooms endpoint policy), `createBrowserComposition` (the browser launch, below). | yes; the browser composition's default presentation factory needs the fleet and `three` |

Dependency direction: `presentation → match → transport`, all three `→ wire`
and `→ src/sim` (movement only). `src/net` (v1) is never imported; the
receipts import it only to prove parity (`movementCheckpoint.selftest.mjs`).

## Layer contracts

**Transport.** Five calls and two subscriptions. `send` returns false and
counts a drop when the frame would leave more than `maxBufferedBytes` (64 KB)
unsent; refusals sustained for 5 s close the transport with `backpressure`.
`reconnect(reason)` drops the socket and retries with backoff (250 ms doubling
to 8 s, ±20 % jitter) inside a 60 s window, presenting the resume token on the
URL (`?resume=<token>&attempt=<n>`) so a proxy or Durable Object can route the
new socket to the same match; `open { resumed: true }` tells the owner to run
its handshake again. `close('client' | 'server' | …)` never reconnects; an
unsolicited socket close always does, because the owner ends a deliberate
server close itself when it sees the wire `CLOSE` first. The loopback pair
keeps socket semantics — order preserved under jitter, a graceful close
delivered behind the frames sent before it — and adds one-way latency, jitter
and loss per direction on the caller's clock (`pump(nowMs)`); `lossFilter`
restricts loss to replaceable frames (SNAPSHOT, INPUT), which is what loss
means on an ordered socket.

**MatchClient.** `connect()`, `update(nowMs, elapsedS)` once per display frame,
`leave()`, `dispose()`; `onWelcome`, `onFrame`, `onPhase`; `stats()` for F3.
The frame (`MatchFrame`) carries the interpolated remote samples, shells, the
sampled meta clocks, the persistent destroyed-prop list and revision, the
viewer's predicted `TankState` + newest authority row + viewer section + this
frame's predicted own shot, the budgeted reliable events, and the viewer's own
accepted shots (immediate). Prediction is enabled by a `PredictionProvider`
(`{ world: { heightField, collide? }, specFor }`) at construction or later via
`enablePrediction` (the presentation knows the map late).

**Presentation.** `applyRoster(roster, context)`, `applyFrame(frame)`,
`applyEvent(event, { own, feedbackPredicted })`, `applyVerdict`,
`setVisibility(entityId, visible)`, `dispose`. `bindMatchPresentation(client,
adapter)` is the whole glue. The battle presentation writes the same surfaces
v1's bridge fed (`game.tanks/tankById/player/shells/spotting`, `timeS`,
`preBattleS`, `result`, `gameMode`, `matchModeState`; the bus vocabulary
`shell:fired`, `shell:hit`, `shell:expired`, `tank:destroyed`, `prop:crushed`,
`module:state`, `tank:fire`, `tank:ram`, `battle:ended`, `ui:*`, `ammo:*`,
`weapon:predicted`, `mode:*`; the tank visuals' `setVisible`, `syncFromState`
seeding, `stripEra/resetEra`, `setDestroyed/resetDestroyed`, `recoilKick`,
`gunMuzzleWorld/gunDirWorld`; `worldCollision.crushObstacle`) and owns no
rule: combat values are the authority's rows, the own tank renders the
predictor's state object directly, effects are the authority's events.

## The client's rules and their constants (why each number)

| Rule | Constant | Why |
|---|---|---|
| Server clock | median of the last 16 pongs after rejecting the slower half of RTTs and 3-MAD outliers; slew ≤ 50 ms/s, ≤ 250 ms of elapsed per step; snap above 2 s | v1's slew (a late pong can never move a fast tank a visible fraction of a metre in one frame); the RTT-half filter removes asymmetric-path samples; the snap keeps a slept tab from slewing for a minute |
| Pings | 8 at 200 ms, then 1 Hz; HELLO→WELCOME is the first sample | the offset filter fills before the countdown ends |
| Input | 60 Hz ticks, every frame carries the newest 3 ticks, `fireSeq`/`actionSeq` repeat until acknowledged, per-bit release by first sequence | the wire's contract; one lost frame loses nothing |
| Lead | starts 2 ticks over the server tick + RTT/2; +1 when `inputMarginTicks` < 1 (≤ 1 per 250 ms), −1 when > 3 (≤ 1 per s), 0..12 | controls arrive 1–3 ticks early, as the server's buffer asks |
| Tick catch-up | ≤ 4 ticks per frame; > 8 behind skips ahead | a suspended tab must not flood the server with stale controls |
| Snapshot ring | 96 frames (3 s); ack = newest assembled frame, `NO_TICK` = "send a keyframe" | keyframes go every 2 s; a delta against an evicted or unknown baseline requests a keyframe at once |
| Interpolation delay | 2 intervals + 2 × arrival jitter + 1 interval while a loss is < 2 s old, clamped to 2..4 intervals (67–133 ms at 30 Hz); grows at ½ of elapsed, releases at ⅒ | v1's adaptive buffer with the charter's bounds; latency is recovered at 1.1× real time, never by seeking back |
| Extrapolation | ≤ 1 interval, angles continue the last short-arc secant for at most one interval | the charter's cap; longer stalls hold the render clock at the horizon (the delay grows, then releases) and a stall past 400 ms or beyond the buffer resyncs once with every entity flagged `snapped` |
| Hull blending | monotone Hermite on the ground, plain Hermite airborne, shortest-arc angles, teleport above max(8 m, 3 × speed × dt) snaps | contact-safe (a stale tangent never overshoots a stop), ballistic arcs stay velocity-correct |
| Prediction | rewind to the row + the version-1 integrator checkpoint (viewer section), replay ≤ 24 ticks (400 ms), correction = the same-tick shift accumulated onto the decaying one | the server's lag-compensation history is 400 ms; a perfect prediction stages nothing |
| Correction envelopes | hull 110 ms, attitude/support 160 ms, live aim 75 ms; 180/240 ms for 300 ms after a contact; release ≤ 0.2 m horizontal and 0.1 m vertical per frame; hard snap only above 7 m | v1's ratified envelopes ("Client smoothness") |
| Resting hull | held while nothing requests motion and the re-prediction stays within 3 cm / 2.5 cm / 0.0035 rad | quantization chatter never reaches the screen; drive intent releases it at once |
| Display tick | a fractional tick advancing at 1 tick per tick of local time, slewed ⅒ per frame toward the sampler, blending a 32-pose ring | lead and RTT changes never hitch the local hull |
| Own shot feedback | flash on a fire edge only when authority ≤ 250 ms old says the slot is ready, once per ready epoch; the `shell_fired` carrying that `fireIntentSeq` confirms | v1's `shotFeedbackVersion 1` rule |
| Events | released once the presented tick reaches theirs, ≤ 3 per frame, a heavy one (shot, hit, impact, destruction, prop) ends the flush; own shots bypass | v1's volley budget |
| Recovery | stalled after 5 s without accepted authority (one reconnect request), live only after a snapshot on the socket, failed 60 s after the loss, explicit leave | v1's watchdog and grace; WELCOME alone never ends an outage |

## Receipts and soaks

Every module has a receipt in the core group (`tools/selftest-suites.mjs`):
`src/mp/transport/transport.selftest.mjs`, `src/mp/match/{clock,inputStream,
snapshotStream,interpolation,events,recovery,movementCheckpoint,prediction,
matchClient}.selftest.mjs`, `src/mp/presentation/battlePresentation.selftest.mjs`,
`tools/mp-client-soak.selftest.mjs`. Run any of them with `node <file>`.

`matchClient.selftest.mjs` is the loopback receipt against the scripted server
fixture (100 ms RTT ± 30 ms, 3 % loss): no hard snaps, remote and own pose
steps ≤ 0.5 m, correction release ≤ 0.25 m, input ack lag p50 ≤ RTT + 2 ticks
(the intrinsic lag, i.e. minus the lead the client chose), keyframe recovery
after dropped baselines, stall → reconnect → live, the 60 s grace, leave and a
server close, a spectator.

The soak (`tools/mp-client-soak.mjs`) runs N headless clients on one virtual
clock against the real `server/match` MatchActor (its authority, bots, lag
compensation and publisher; seats admitted through signed seat tokens) or the
fixture, and prints every gate plus bytes per client per second:

```
node tools/mp-client-soak.mjs                        # 4 clients, 120 s, 100 ms ± 30 ms, 3 % loss, MatchActor on verdant
node tools/mp-client-soak.mjs --server=fixture --seconds=20
node tools/mp-client-soak.mjs --clients=8 --rtt=160 --jitter=40 --loss=0.05 --map=alpine --json
```

Measured 2026-09-25 (4 clients + 4 bots, 120 s, MatchActor, verdant, terrain
world): 12.1–12.8 KB/s down and 3.3 KB/s up per client (the charter's 12–18
KB/s is sized for 28 rows; 8 rows read at the floor), interpolation delay
120–128 ms at 11–16 ms of measured jitter, 0 hard snaps, remote steps ≤ 0.47 m,
own steps ≤ 0.43 m, release ≤ 0.21 m, misprediction ≤ 1.5 m (hull contacts
and shell knocks the client cannot see; 0.03–0.3 m otherwise), intrinsic ack
lag p50 6 / p95 7 ticks against 7–8 ticks of RTT, every own shot predicted and
confirmed, 0 rejected inputs, 0 dropped snapshots, server tick p95 0.17 ms.

## Browser launch (`?mp=v2`)

`src/app/multiplayerFlag.ts` reads the switch (`?mp=v2` on the URL or
`localStorage["cot.mp.v2"] = "1"`; `?mp=v1` clears it). Behind it `src/main.ts`
imports two modules dynamically — nothing under `src/mp` is on the solo boot
path — and hands them to the Play menu:

- `session/playMenuAdapter.ts` — `createRoomConnectionAdapter` implements v1's
  `PrivateRoomConnectionRuntime` contract (connect / observe / close / forget)
  over a `RoomClient`, so `src/ui/playMenu.ts` renders the v1 `SerializedLobby`
  shape (`roomToLobby`) and sends the same commands. The connection carries
  `inviteVersion: 2` (invite links stamp `v=2`) and a `session` recognised by
  `isMultiplayerV2Session`; the room's `match_start` reaches the menu's
  `onHostStart` for every seat.
- `session/endpoint.ts` — `resolveRoomsUrl` fills the menu's room-host field:
  `VITE_ROOMS_URL` (a `wss://` origin) in production, the LAN helper
  (`npm run server:mp`, port 8792) on local and RFC1918 hosts.

The menu's `onNetworkStart` routes a v2 session to `beginMultiplayerV2Battle`
(v1 otherwise), which mounts the same synchronous intent cover as v1 and loads
`session/browserComposition.ts` — the v2 counterpart of
`src/net/networkBattleComposition.ts`, built from the same app-port object
(`networkCompositionOptions()` in main: the loader cover, `ensureBattleVisuals`,
the battle-only modules, `ensureWorld`, the roster labels, the warm owners,
v1's activation runtime, the Garage return). Per room it owns one
`MatchSession`; per `match_start` the session asks it for a presentation:

1. cover, reset the round state, show the concrete battlefield of `match_start`
   with the room's roster; load the modules, the visuals and the world together;
2. `createBattlePresentation` on the world's collision (paint from the room
   seats' `camo`); after WELCOME wait for `rosterReady()`, seat the ground
   sampler, enable prediction with `predictionWorld()`;
3. on the first frame: the covered warm order v1 proved (atmosphere, night
   lighting, terrain, wrecks, player panel, program compile, opening effects,
   shot cards), `activate` (world/HUD/FX reset, phase `battle`, camera
   ownership, Garage shutdown), the opening ground cover, final shadows, the
   black watchdog, `primeReveal`, the loader fade;
4. the verdict reaches the end overlay through the presentation's
   `battle:ended`; once the result is up (or the player is back in the Garage)
   the lobby re-attaches to the Play menu (`attachActiveRoom`, version 2) for
   the rematch, which re-enters through the same `beginRoom`;
5. the Garage return's network port keeps the room (`disposePresentation`
   leaves the match, the seat stays) or closes it (`closeMatch`); an explicit
   leave from the lobby or the battle drops the seat at once.

Failures go to the existing surfaces: a load that fails, the black watchdog
refusing the frame, the match link exhausted while loading (`lost`) and the
start timeout (120 s without `match_start`) restore the Garage under the cover
and settle the entry `false`; `lost` in a live round ends it once as
`network_disconnect`; the room vanishing (kicked, expired, resume denied,
transport exhausted) clears input, returns to the Garage and opens the menu's
room failure panel with the reason. The composition's frame hooks (`pump`,
`pumpBackground`, `queueConsumable`, `queueAction`, `active`) ride main's
existing network predicate and pumps beside v1's. Diagnostics builds publish
it as `window.__MULTIPLAYER_V2` (`stats()`: room, session, round, events by
kind and shots by shooter, the last failure).

The receipt (`session/browserComposition.selftest.mjs`, core group) drives the
composition through a scripted session owner and a recorded presentation:
the start, the covered load, prediction, the warm order, activation, the
reveal, controls (aim intent from the own actor's aim point, HUD action edges),
the pumps, the verdict and the lobby back on the menu, the Garage return with
the room kept, the rematch on the same owner, a lost link, a failing world
load, the black watchdog, the room closing mid-battle and mid-load, an
explicit leave mid-load and from the lobby, the start timeout.

### Browser end-to-end

`npm run test:net:v2:browser` (`tools/mp-browser-e2e.mjs`): one in-process room
host (`server/rooms/serve.ts`, the LAN helper's composition), one Vite dev
server of the checkout with its own `--cache-dir`, two pristine Puppeteer
contexts on the real site with `?mp=v2`. A creates a LAN room from the
Garage's battle menu; the invite link comes from the address bar (`v=2`); B
opens it, joins and takes A's side; both ready; A starts; both reach the
battle (first battle frames screenshot); 30 s of driving with one shot per
side; A closes its tab; B plays on 15 s; the admin migrates to B; B leaves the
battle to the Garage (room kept), reopens the room and leaves it. Any console
or page error fails the run; `report.json` and the screenshots land in
`--out` (default `.qa-dev/mp-browser-e2e`).

Measured 2026-09-25 (headless Chromium, ANGLE; terrain world; 2 humans + 2
bots): Garage ready 3.5 s (A) / 2.6 s (B, invite link); room created 5.7 s
after the Garage; load to the revealed battle 14.6 s (A) / 14.1 s (B) with 4
actors each; in 30 s of play each browser saw the other move 35–36 m across
30/30 disclosed samples and saw the other's `shell_fired` once (own shot
predicted and confirmed on both), RTT 10–11 ms, ~1 230 snapshots and ~1 900
presented frames per browser; after A closed its tab B received 451
snapshots in 15 s with the link `live` and the battle unresolved, and the
admin migrated to B 30.3 s after the close (the reconnect grace); B's Garage
return kept the room, the explicit leave left A's disconnected seat alone in
a `playing` room; 0 browser errors; 106 s of wall time.
