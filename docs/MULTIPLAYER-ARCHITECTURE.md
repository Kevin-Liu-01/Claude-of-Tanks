# Multiplayer architecture

Status: implemented and playable. Solo bots, LAN, private room codes, and
ranked matches now enter the same renderer-free authoritative simulation.
Rendering, audio, input devices, and UI remain client concerns; movement,
armor, ballistics, damage, modules, spotting, collision, bots, consumables,
destruction, timers, scores, and match outcome belong to authority.

## Product contract

| Mode | Authority | Transport | Ranking |
|---|---|---|---|
| Solo vs bots | local browser host | in-process loopback protocol | local battle record |
| LAN | one trusted browser host | direct WebRTC | unranked |
| Private code | one trusted browser host | WebRTC, with configured TURN fallback | unranked |
| Ranked | dedicated Node service | authenticated WebSocket | server-owned Elo |

The mode changes who hosts and how packets travel. It does not select a second
combat implementation. Player/entity identity is independent from vehicle
identity, so two commanders may field the same tank without aliasing state.

## Runtime boundaries

- `src/sim/authoritativeMatch.js` is the renderer-free battle authority.
- `src/net/matchRuntime.js` owns fixed ticks, input ordering, readiness,
  viewer-specific snapshots, catch-up limits, and connection state.
- `src/net/browserBattleBridge.js` turns authority snapshots and events into
  first-party Three.js visuals without resolving gameplay locally.
- `src/net/localSession.js` routes solo bot play through a real loopback
  host/client pair.
- `src/net/privateRoomSession.js` and `privateMatchHandoff.js` own WebRTC lobby
  composition, seeded bot fill, and channel handoff.
- `server/dedicatedMatchServer.js` and `dedicatedMatchRegistry.js` own ranked
  WebSocket authority and reconnectable match lifetimes.

All eight maps use the same authored collision, terrain, foliage concealment,
destructible indices, and loadout rules in browser-hosted and dedicated play.
Dedicated Node matches inflate collision from the generated
`server/world-collision-manifests.json`; browser hosts use the live `World`
collision facade.

## Protocol and authority

Protocol v2 uses validated envelopes with a finite message vocabulary,
sequence/acknowledgement fields, and simulation ticks. Clients submit controls
only: throttle, steering, brake, aim yaw/pitch, shell choice, fire, and explicit
consumable action bits. They cannot submit a trusted position, hit, damage,
spotting result, reload completion, or match clock.

Authority runs at 60 Hz and publishes viewer-specific state at 20 Hz. Hidden
enemy coordinates are removed before serialization. Shells and combat events
have their own reveal rules. Inputs that are stale, implausibly far ahead,
malformed, or sent before the handshake are rejected without poisoning the
connection sequence.

## Delivery model

LAN/private WebRTC uses two data channels:

- `cot-match-v1`: ordered and reliable for handshake, lobby, input, combat
  events, ping, errors, and leave control.
- `cot-state-v1`: unordered with zero retransmits for replaceable snapshots.

Ranked WebSocket remains ordered, but coalesces pending snapshot state so stale
frames cannot consume the reliable control budget. All transports enforce
payload and buffered-byte limits and fail visibly on sustained backpressure.

Snapshots use a compact binary codec, explicit snapshot acknowledgements,
per-peer deltas, and periodic keyframes. A missing delta baseline waits for a
recovering keyframe rather than inventing state.

## Client smoothness

Remote tanks use Hermite position interpolation, shortest-path angle blending,
an adaptive 100–220 ms jitter buffer, and at most 250 ms of bounded
extrapolation. The local tank predicts the exact shared 60 Hz movement code,
terrain contact, map bounds, and nearby static collision, then replays
unacknowledged inputs after each authority snapshot. Normal corrections ease
over 90 ms; death or errors above 7 m snap immediately.

Press `F3` to view live RTT, jitter, estimated snapshot loss, interpolation
delay, extrapolation, transport queues, and reconciliation error. Deterministic
browser impairment is available for QA:

```text
?netSim=1&netLatency=120&netJitter=40&netLoss=10&netdiag=1
```

The latency value is one-way. Reliable control remains ordered; only
replaceable state is eligible for snapshot loss unless `netInputLoss` is set.

These are the useful ideas adopted from CarverJS: separate control/state
delivery, local prediction and reconciliation, an adaptive jitter buffer,
and observable impairment testing. CarverJS itself is not a dependency; the
game keeps its own deterministic tank simulation and authority contracts.

## Lobbies, spectators, bots, and ranking

`src/net/lobby.js` is the only owner of room capacity, team switching,
spectators, readiness, vehicle/loadout selection, team size, map choice,
locking, host permissions, and start policy. Empty 1v1/3v3/5v5/7v7 slots are
filled deterministically by authority-owned bots. Bots use seeded diverse
openings, traversability planning on every map, local obstacle recovery, and
the same spotting limits as human players.

Ranked uses service-scoped anonymous bearer identities, widening Elo search
bands, server team balancing, one-time match tickets, persistent idempotent
settlement, rank names, profiles, and a leaderboard. Fake credits and XP are
absent because every vehicle is available and there is no tech tree. The
garage stores only an honest local battle record; competitive rating remains
server-owned.

Spectators receive both teams through an explicitly marked observer peer and
cannot submit vehicle controls. Ranked authority never migrates to a player.
Version 1 private/LAN rooms close cleanly if their browser host leaves; host
migration is intentionally not claimed.

## Deployment and trust

- Production signaling and match services require TLS and explicit origin
  allowlists.
- Public WebRTC must force TURN relay so strangers do not learn one another's
  IP addresses. LAN may use direct host candidates.
- TURN credentials and persistent Elo storage paths are deployment secrets.
- A public competitive deployment should bind the existing service identity
  seam to real account/auth infrastructure. Client-owned solo results must
  never be accepted as ranked outcomes.

The signaling server only relays room membership, SDP, and ICE. Gameplay never
travels through it.

## Verification

```bash
npm test
npm run test:net:browser
npm run build
npm run build:private
```

The browser soak starts a real signaling server, Vite, and two Chromium pages.
It proves room codes, host-only policy, team/spectator switching, same-vehicle
identity separation, dual-channel WebRTC handoff, authoritative movement,
adaptive delivery under configurable latency/jitter/loss, and clean peer
departure. Node tests separately cover hidden-coordinate filtering, combat
authority, consumables, ram/HE damage, bots, real WebSockets, reconnect,
matchmaking, Elo persistence, abuse bounds, and all-map collision.

Useful service commands:

```bash
npm run server:signal  # default ws://127.0.0.1:7777/signal
npm run server:match   # default http://127.0.0.1:8790 + ws://.../match
```
