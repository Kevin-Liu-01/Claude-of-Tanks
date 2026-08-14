# Multiplayer architecture

Status: implementation in progress. The protocol, lobby model, loopback
transport, authoritative tick host, client jitter buffer, viewer-filtered
snapshots, and their invariant tests are implemented in `src/net/`.

## Product contract

Claude of Tanks has one match implementation with four ways to enter it:

| Mode | Authority | Transport | Ranking |
|---|---|---|---|
| Campaign / bots | local browser host | loopback | campaign leaderboard only |
| LAN | one trusted browser host | WebRTC data channels | unranked |
| Private code | one trusted browser host initially | WebRTC + TURN fallback | unranked |
| Public / ranked | dedicated server | WebSocket | rated PvP |

Local play must use the same host/client protocol as network play. Rendering,
audio, input devices, and UI are client concerns; armor, ballistics, damage,
spotting, collision, match outcome, and bot decisions are authority concerns.

## Current-shape review

| Area | Current shape | Risk | Better interface | Proof |
|---|---|---|---|---|
| Match loop | Fixed step is embedded in `main.js` | Network modes can diverge from solo | `AuthoritativeMatchRuntime.advance(ms)` | Exact tick/catch-up tests |
| Identity | Entity ID equals vehicle spec ID | Duplicate vehicle selections are impossible | Player/entity ID independent from `specId` | Lobby and snapshot tests use two M1A2s |
| Simulation | `state.js` owns sim, visuals, roster, and AI setup | Dedicated server would import rendering code | Headless simulation adapter behind `step`/`snapshot` | Node-runnable runtime tests |
| Visibility | Client currently owns the complete local world | Multiplayer could leak hidden opponents | Viewer-specific snapshot policy | Hidden-coordinate exclusion test |
| Session modes | Solo path directly mutates game state | LAN and online become separate games | Loopback/WebRTC/WebSocket transport seam | Local session traverses host/client modules |
| Progression | Credits and XP persist without a tech tree | UI rewards a currency with no meaningful sink | Rank, match history, campaign medals | UI/economy removal tests (pending) |
| AI routes | Strong local controller over doctrine waypoints | Repeated openings and hill pockets | Seeded global traversability planner + local controller | Route diversity/stuck-time gates (pending) |

Deletion test: removing `src/net/` would force tick scheduling, input ordering,
room policy, visibility filtering, backpressure, interpolation, and clock sync
into every session-mode caller. The module therefore concentrates real policy
rather than adding a pass-through layer.

## Implemented interfaces

### Protocol

`src/net/protocol.js` owns the version, envelope, sequence arithmetic, room
codes, and untrusted player-input validation. Aim is transmitted as yaw/pitch;
clients never submit a trusted world hit point or damage result.

Every message contains:

```js
{
  v,       // protocol version
  type,    // finite message vocabulary
  seq,     // sender ordering
  ack,     // latest received envelope
  tick,    // sender simulation tick
  payload,
}
```

### Lobby

`src/net/lobby.js` is the only owner of room capacity, teams, readiness,
vehicle selection, host permissions, map selection, room locking, and the
start gate. Signaling transports submit commands; they do not reimplement
policy. Player identity is independent from vehicle identity.

### Transport

Adapters implement this small interface:

```js
{
  send(message) -> boolean,   // false means bounded backpressure rejected it
  onMessage(listener) -> unsubscribe,
  onClose(listener) -> unsubscribe,
  close(reason),
  readyState,
}
```

The loopback adapter is implemented. WebRTC and WebSocket adapters must obey
the same ordering, close, and backpressure behavior.

### Authority

`AuthoritativeMatchRuntime` owns fixed-step accumulation, latest-input
selection, stale/future input rejection, per-viewer snapshot cadence, and
catch-up limits. The simulation adapter is intentionally only:

```js
{
  step({ dt, tick, timeMs, inputs }),
  snapshot({ tick, serverTimeMs, viewerId, ackInputSeq }),
  onPeerJoin?({ peerId, metadata }),
  onPeerLeave?({ peerId, reason }),
}
```

The interface does not expose transport, rendering, lobby, or UI state.

### Client

`MatchClientRuntime` uploads validated input, estimates server clock offset,
buffers snapshots, and exposes interpolated render state. Position uses
Hermite interpolation with velocity; angles take the shortest wrapped path;
packet gaps extrapolate for at most 250 ms.

## Authority and visibility invariants

- Only authority advances armor, ballistics, damage, spotting, physics, bots,
  destruction, timers, scores, and match result.
- Clients submit controls, never results.
- Hidden enemy entities are omitted before serialization. Proximity-only
  interest management is insufficient because spotting is gameplay.
- Events and shells are filtered independently from tank visibility so tracer,
  muzzle-flash, and impact reveal rules remain intentional.
- Ranked games never migrate authority to a player.
- LAN/private host migration, if added, is allowed only for unranked rooms and
  requires an acknowledged keyframe plus lobby epoch change.
- Public WebRTC must force TURN relay or use the dedicated server so player IP
  addresses are not disclosed to strangers.

## Performance invariants

- Simulation: 60 Hz fixed tick.
- Snapshots: 20 Hz, viewer-specific.
- Render: variable, normally 60 Hz, from an interpolation buffer.
- At most four catch-up ticks after a client stall; excess wall time is
  discarded and measured.
- Input messages are latest-state, sequenced, and bounded. Fire/action edges
  will use explicit action bits so a dropped intermediate frame cannot erase
  a shot.
- Network modules stay out of the initial bundle until a network mode is
  selected. Loopback authority is small enough for campaign boot.
- Snapshot payloads are quantized before encoding. The binary codec and delta
  keyframes are the next wire optimization; gameplay code never depends on a
  codec.
- Transport queues are bounded. Congestion disconnects fail-visible rather
  than accumulating seconds of stale controls.

## Required migration sequence

1. Separate runtime entity IDs from vehicle spec IDs in game state.
2. Extract a headless battle simulation adapter from `state.js`; visuals are
   created and synchronized by a client-side presentation module.
3. Run campaign/bot battles through `createLocalMatchSession` and prove visual
   and gameplay parity.
4. Add WebRTC data-channel and signaling adapters for LAN/private codes.
5. Add a dedicated Node authority using the same simulation adapter and a
   WebSocket transport for public/ranked rooms.
6. Replace the garage flow with Play, Private, LAN, Campaign, and Training;
   move tank/loadout choice inside the selected mode.
7. Remove wallet/XP surfaces and migrate old saves non-destructively to match
   history, campaign medals, settings, and cosmetic/loadout choices.
8. Replace doctrine-only opening routes with a seeded traversability graph,
   route diversity constraints, live occupancy costs, and recovery telemetry.
9. Run constrained CPU/network/browser gates and soak matches before enabling
   rated play.

## Release proof

The feature is not complete until all of the following are demonstrated:

- Two players can choose the same tank and spawn as distinct entities.
- Campaign, LAN, private, and ranked use the same armor/damage/match rules.
- Team switches and ready/start permissions work under reconnect and leave.
- A client cannot create damage, teleport, fire through reload, inspect an
  unspotted enemy, or advance the match clock.
- 150 ms RTT, 3% loss, and 20 ms jitter remain steerable without visible
  correction spikes; 300 ms/10% loss degrades clearly without divergence.
- A 30-minute LAN game survives mobile sleep/wake or exits cleanly.
- Public rooms do not expose peer IP addresses.
- Bot openings vary by seed, never require hidden exact target positions, and
  meet bounded stuck-time/recovery gates on all eight maps.
- Low-tier hardware maintains the existing visual-quality target with no new
  garage-transition or first-shot stalls.
