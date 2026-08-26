# Multiplayer architecture

Status: implemented and playable. LAN, private room codes, and ranked matches
enter the renderer-free authoritative simulation. Solo bots deliberately keep
the original presentation-integrated local simulation: this avoids snapshot,
prediction, serialization, and duplicate presentation work in the latency-free
mode while preserving the game's established high-refresh performance.

## Product contract

| Mode | Authority | Transport | Ranking |
|---|---|---|---|
| Solo vs bots | local browser | direct in-page simulation | local battle record |
| LAN | one trusted browser host | direct WebRTC | unranked |
| Private code | one trusted browser host | WebRTC, with configured TURN fallback | unranked |
| Ranked | dedicated Node service | authenticated WebSocket | server-owned Elo |

Network modes change who hosts and how packets travel while sharing one combat
authority. Player/entity identity is independent from vehicle identity, so two
commanders may field the same tank without aliasing state. Solo remains a
separate optimized composition of the same core movement, armor, ballistics,
damage, spotting, and AI modules.

## Runtime boundaries

- `src/sim/authoritativeMatch.js` is the renderer-free battle authority.
- `src/net/matchRuntime.js` owns fixed ticks, input ordering, readiness,
  viewer-specific snapshots, catch-up limits, and connection state.
- `src/net/browserBattleBridge.js` turns authority snapshots and events into
  first-party Three.js visuals without resolving gameplay locally.
- `src/net/localSession.js` provides loopback authority for protocol tests and
  tooling; normal solo play does not load it.
- `src/net/privateRoomSession.js` and `privateMatchHandoff.js` own WebRTC lobby
  composition, seeded bot fill, and channel handoff.
- `server/dedicatedMatchServer.js` and `dedicatedMatchRegistry.js` own ranked
  WebSocket authority and reconnectable match lifetimes.

All twenty maps use the same authored collision, terrain, foliage concealment,
destructible indices, and loadout rules in solo, browser-hosted, and dedicated play.
Dedicated Node matches inflate collision from the generated
`server/world-collision-manifests.json`; browser hosts use the live `World`
collision facade.

## Protocol and authority

Protocol v4 uses validated envelopes with a finite message vocabulary,
sequence/acknowledgement fields, and simulation ticks. Clients submit controls
only: throttle, steering, brake, bounded aim yaw/pitch/distance, shell choice,
fire, and explicit consumable action bits. Distance preserves the finite
center-screen point and close-range parallax used by solo gunnery; it is not a
trusted hit position. Clients cannot submit a trusted position, hit, damage,
spotting result, reload completion, or match clock.

Authority runs at 60 Hz and publishes viewer-specific state at 20 Hz. Hidden
enemy coordinates are removed before serialization. Shells and combat events
have their own reveal rules. Inputs that are stale, implausibly far ahead,
malformed, or sent before the handshake are rejected without poisoning the
connection sequence.

## Delivery model

LAN/private WebRTC uses two data channels:

- `cot-match-v1`: ordered and reliable for handshake, lobby, room chat,
  combat events, ping, errors, and leave control.
- `cot-state-v1`: unordered with zero retransmits for replaceable snapshots
  and live input.

Ranked WebSocket remains ordered, but coalesces pending snapshot or input state
so stale frames cannot consume the reliable control budget. Input and reliable
control have independent sequence spaces, preventing reordered steering from
starving room commands. Fire, consumable, and manual-magazine-reload edges
repeat until a snapshot acknowledges receipt; authority deduplicates action
rising edges before the simulation sees them. All transports enforce payload and buffered-byte limits
and fail visibly on sustained backpressure.

Snapshots use a compact binary codec, explicit snapshot acknowledgements,
per-peer deltas, and periodic keyframes. A missing delta baseline waits for a
recovering keyframe rather than inventing state.

Reload presentation is authoritative. Each entity row carries remaining and
total reload time, reload phase, ready-rack rounds, and magazine capacity. The
browser bridge never reconstructs magazine state from muzzle events, so packet
loss cannot create a locally fireable round that the authority does not own.

One-shot combat/destruction events travel independently over reliable control
instead of living only inside replaceable snapshots. The browser bridge drains
critical state immediately and budgets expensive cosmetic presentation across
frames. Persistent facts are reconstructible after packet loss or reconnect:
the verdict is mirrored in snapshot metadata and destructible state carries a
revision plus destroyed identifiers in keyframes.

The browser host's own peer still crosses the exact protocol/runtime boundary,
but its in-process transport delivers synchronously and without cloning. The
presentation bridge and snapshot sampler reuse their frame/entity arrays and
objects, so a 120 Hz render loop does not manufacture a new scene-state object
graph every frame. Network diagnostics also stay dormant unless F3 is open.
During lobby-to-match handoff, a slow host buffers an already-loaded client's
ordered match handshake until authority owns the WebRTC channel; renderer load
order therefore cannot strand either peer at the readiness barrier.

## Client smoothness

Remote tanks use Hermite position interpolation, shortest-path angle blending,
an adaptive 100–220 ms jitter buffer, and at most 250 ms of bounded
extrapolation. The local tank predicts the exact shared 60 Hz movement code,
terrain contact, map bounds, and nearby static collision, then replays
unacknowledged inputs after each authority snapshot. Presentation correction is
grouped by physical role: horizontal hull motion uses an 110 ms envelope,
support height and hull attitude use 160 ms, and live turret/gun aim uses 75 ms.
Recent terrain or dynamic contact extends hull envelopes to 180/240 ms for
300 ms. Death or errors above 7 m still snap immediately.

Both presentation paths suppress quantization chatter only when a tank is
actually at rest. Remote snapshot samples retain a stable hull pose across
sub-contact-patch position and attitude changes; local reconciliation holds the
equivalent correction while neither acknowledged nor pending input requests
motion. Turret yaw and gun pitch always remain independent and live. Any real
drive input, meaningful authority velocity, larger displacement, destruction,
or hard snap releases the resting hold immediately, so stabilization cannot
add steering latency or hide legitimate slope motion.

Press `F3` to view live RTT, jitter, estimated snapshot loss, interpolation
delay, extrapolation, input acknowledgement lag/edge redundancy, transport
coalescing, and reconciliation error. Deterministic browser impairment is
available for QA:

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
locking, host permissions, and start policy. Empty 1v1/2v2/3v3/5v5/7v7 slots are
filled deterministically by authority-owned bots. Bots use seeded diverse
openings, traversability planning on every map, local obstacle recovery, and
the same spotting limits as human players.

The canonical room authority also owns display-name uniqueness. Automatic
callsigns are stable per browser identity, while case-insensitive collisions
are deterministically suffixed in both private lobbies and ranked rosters.
Private and LAN hosts can copy a same-deployment invite URL. Opening its
validated `room` query automatically enters the corresponding lobby and joins
the room after the normal loading gate; manual six-character codes remain a
fallback. New links also carry a normalized `host` callsign so the loading
screen and lobby can say “Join Name’s Game.” That URL field is never trusted as
identity: both in-memory and distributed signaling return the canonical host
name in their create/join responses, and the client replaces the hint.

Rooms persist across rounds. Protocol-v5 `ROOM_COMMAND` and `ROOM_STATE`
messages carry round, last result, full human roster, selections, and readiness
on the reliable channel. When authority publishes a result, the room returns
from `playing` to `waiting`, keeps connected peers and the WebRTC channels,
increments its next round at start, and clears every ready flag. The next match
replaces the simulation runtime while preserving transport and room identity.

Battle chat uses dedicated `ROOM_CHAT_COMMAND` and `ROOM_CHAT` control
messages instead of bloating snapshots or room-state broadcasts. Authority
derives the sender name and team from the authenticated room peer, normalizes
plain text, caps messages at 240 characters, throttles each sender, and fans
the accepted message out to every room participant. Clients retain only the
latest 48 messages; the battle UI disables driving and firing while its input
owns focus.

Closing the result report returns to the garage without leaving the room. A
compact room reminder remains under Battle and exposes ready/unready state.
Ready players cannot change vehicle, equipment, or team until they unready;
the report and lobby both show live play-again readiness. Only an explicit
Leave command disconnects the peer.

Ranked uses service-scoped anonymous bearer identities, widening Elo search
bands, server team balancing, one-time match tickets, persistent idempotent
settlement, rank names, profiles, and a leaderboard. Fake credits and XP are
absent because every vehicle is available and there is no tech tree. The
garage stores only an honest local battle record; competitive rating remains
server-owned.

Spectators receive both teams through an explicitly marked observer peer and
cannot submit vehicle controls. Ranked authority never migrates to a player.
Private/LAN rooms close cleanly if their browser host leaves; host
migration is intentionally not claimed.

Client presentation and input upload use separate clocks. Rendering remains
display-rate, while replaceable held controls are uploaded at the authority's
60 Hz cadence. Fire, consumables, shell selection, braking, and meaningful
analog changes bypass that interval immediately. This prevents 120–240 Hz
displays from multiplying RTC/browser work or inflating sequence backlog while
preserving responsive controls and the existing local prediction path.

Fresh WebRTC handshakes are replay-safe. The typed peer owner retransmits the
same pending offer or answer before attempting a new ICE generation, ignores
duplicate SDP, and reserves ICE restart for a later bounded attempt or an
explicit disconnected/failed connection state. This prevents a slow first
load from racing two offer generations while retaining automatic recovery
from genuine route changes.

Non-host refresh after a round is supported. Signaling preserves the stable
browser player id, the joined client keeps the canonical invite URL, and the
host keeps rendezvous listening after lobby-to-match handoff. When the page
returns during the room's waiting phase, a new WebRTC channel is attached to
the existing room controller and current `ROOM_STATE` is replayed. Explicit
Leave removes the URL. Refreshing the browser host is different: it destroys
the browser-owned authority, so host migration is intentionally not claimed.

Browser multiplayer certification creates a distinct pristine browser context
for every participant. Cache, storage, workers, credentials, and player
identity are never shared between the host and guests. The persistent-room
gate additionally drops signaling during live play, resumes the same durable
room, completes a round, readies both players, starts round two over the same
RTC channels, and verifies clean departure.

The full rendered capacity gate is `npm run test:net:seven:full`. It runs two
independent natural 7v7 battles—one with the browser host rendered and one with
an impaired remote client rendered. All 28 participants across those runs use
pristine browser profiles, retarget living opponents from authority state, and
continue through a real elimination result. The gate requires every session to
receive the result, retain the room in its waiting phase, and clear readiness;
it also enforces transport, prediction, frame-pacing, shadow, and presentation
budgets throughout the match.

## Deployment and trust

- Production signaling and match services require TLS and explicit origin
  allowlists.
- A public matchmaking mode must force TURN relay so strangers do not learn
  one another's IP addresses. Private code rooms currently negotiate direct
  ICE paths; LAN always remains direct.
- TURN credentials and persistent Elo storage paths are deployment secrets.
- A public competitive deployment should bind the existing service identity
  seam to real account/auth infrastructure. Client-owned solo results must
  never be accepted as ranked outcomes.

The signaling server only relays room membership, SDP, and ICE. Gameplay never
travels through it. Production room membership lives in Redis and signaling
notifications use Redis pub/sub, so peers routed to different WebSocket
function instances still share one room. Private rooms automatically request
short-lived TURN credentials from same-origin `/api/ice`; the deployment keeps
the long-lived provider token server-side. `VITE_ICE_CONFIG_URL` only overrides
that endpoint for a separate credential service. LAN remains direct.

LAN setup is automatic. Public deployments use their same-origin secure
signaling endpoint for rendezvous, while pages served from localhost or an
RFC1918 address use that host's bundled port-7777 signaling service. LAN does
not request STUN or TURN routes, so match traffic stays on the direct Wi-Fi
WebRTC path; the signaling service only exchanges room and connection metadata.

## Verification

```bash
npm test
npm run test:net:browser
npm run test:net:four
npm run test:net:seven
npm run test:net:seven:live
npm run build
npm run build:private
```

The persistent-room browser soak starts a real signaling server, Vite, and two
Chromium pages. The roster soak runs either one host plus three independent guest
pages in a human 2v2 or one host plus thirteen guests in a full human 7v7. It
applies configurable latency/jitter/snapshot and input loss, then gates every
client's handshake, timeline skew, shared teammate poses, authority convergence,
input acknowledgement lag, transport queues, runtime cost, and clean departure.
That lightweight maximum-roster soak is a network-capacity test; it does not
claim rendered combat quality. `test:net:seven:live` is the player-visible
certification. It runs independent host-rendered and impaired-client-rendered
7v7 matches, puts every human tank into a clear live battlefield engagement,
and requires all fourteen tanks to move and fire through the real authority.
It also requires real hit/damage events on both teams, full event delivery to
every peer, zero prediction hard snaps or dropped history, sub-0.5 m pose steps,
sub-0.3 m backwards steps, sub-0.25 m correction release, sub-0.15 m vertical
correction release, 30+ rendered fps with no freezes, healthy shadow
cascades/WebGL, and clean
first-volley/live screenshots under `.qa-dev/multiplayer-live-7v7/`.

Together the soaks prove room policy, identity separation, dual-channel WebRTC
handoff, rematches, authoritative movement and combat, adaptive delivery, and
the maximum fourteen-player room. Node tests separately cover four-client dedicated
WebSockets, hidden-coordinate filtering, combat authority, consumables, ram/HE
damage, bots, reconnect, matchmaking, Elo persistence, abuse bounds, and all-map
collision.

Useful service commands:

```bash
npm run server:signal  # default ws://127.0.0.1:7777/signal
npm run server:match   # default http://127.0.0.1:8790 + ws://.../match
```
