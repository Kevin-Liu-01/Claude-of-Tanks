# Internal systems reference

This is the current internal architecture of Claude of Tanks. It defines
ownership boundaries, runtime flows, and invariants for engineers changing the
game. It supersedes the original implementation-era module plan in
ARCHITECTURE.md wherever the two disagree.

## Design principles

1. Gameplay truth is independent from Three.js objects.
2. Simulation uses fixed 1/60-second steps.
3. Network clients submit intent, never trusted combat outcomes.
4. A persistent fact must survive dropped snapshots and reconnect.
5. Solo does not pay for multiplayer composition.
6. Quality scaling changes presentation cost, not combat behavior.
7. Playable vehicle geometry is first-party and locally authored.
8. Generated assets must be traceable to live geometry and combat metadata.

## Top-level composition

    input
      |
      v
    fixed-step movement and combat authority
      |
      +---- durable state -----------------------------+
      |                                                |
      +---- reliable one-shot events ----------------+ |
                                                     | |
                                                     v v
                                      browser presentation bridge
                                                     |
                         +---------------------------+------------------+
                         |                           |                  |
                     Three.js scene                 HUD             audio/FX

Solo composes the simulation and presentation directly in src/main.js and
src/game/state.js. The dependency-free typed session shell and event bus live
in src/game/stateCore.ts. Typed roster records, battle-visual policy, and
deterministic participant/camouflage planning live in src/game/rosterState.ts,
so garage and battle-intent loading can use them without owning the solo combat
graph. src/game/soloBattleRuntime.ts is the typed lazy boundary that acquires
the legacy solo authority only on Battle or capture intent. LAN, private, and
ranked modes use
src/sim/authoritativeMatch.js behind the protocol and browser presentation
bridge. These compositions share movement, aiming, ballistics, armor, damage,
spotting, bot, destructible, and result rules.

The composition root delegates its order-sensitive browser lifecycles to
strict TypeScript owners:

- `src/engine/bootLifecycle.ts` owns stage attribution and paint yields;
- `src/engine/programWarm.ts` owns gameplay-target shader submission, uniform
  discovery, bounded linker breathing, and context-loss invalidation;
- `src/engine/deploymentShadowWarm.ts` owns bounded deployment caster uploads,
  depth-program submission, exact cascade priming, and state restoration;
- `src/game/battleModuleAccess.ts` owns retryable battle-only imports;
- `src/game/battleEntryLifecycle.ts` owns cross-mode entry exclusivity, the
  covered render gate, and default-frame reveal acknowledgement;
- `src/game/combatWarmCoordinator.ts` owns resumable opening/rare warm receipts,
  synchronous capture drains, round resets, and countdown cancellation;
- `src/game/deferredCombatWarmRuntime.ts` owns the revision-bound deployment
  queue: hidden opponent visuals, opening FX, bot routes, terrain lookahead,
  rare shader work, cooperative yields, and stale-rematch cancellation;
- `src/game/soloBattleDeploymentRuntime.ts` owns the covered solo warm from
  final camouflage through exact visual cohorts, terrain, FX, forward programs,
  cascaded shadows, post passes, and the first production-quality reveal frame;
  generation cancellation and failure fallback remain inside that boundary;
- `src/game/studioAccess.ts` owns retryable Studio/FX acquisition, the stable
  render-loop proxy, and transfer of temporary F8 ownership to the full mode;
- `src/fx/fxRuntimeAccess.ts` independently owns combat-effects code preload,
  singleton GPU/runtime construction, coalescing, and failure retry; intent may
  transfer the module without allocating particles, lights, or render state;
- `src/game/killcamAccess.ts` owns replay code preload, singleton construction,
  failure retry, and the stable no-op presentation facade used before battle;
  the fixed-step simulation receives the direct live capture implementation;
- `src/game/playerBattleActions.ts` owns ammunition, shell selection,
  consumable cooldowns, special actions, and the local-versus-network command
  split without importing Three.js or the demand-loaded combat implementation;
- `src/game/playerFrameInput.ts` owns allocation-free per-frame keyboard,
  mouse, gamepad, touch, cursor-fallback, zoom, and RMB-mode sampling and
  publishes the stable movement/fire and camera input records;
- `src/game/battleResultPresentationRuntime.ts` owns player-death holds,
  result replay selection, kill-cam completion, verdict presentation, and
  round/exit cancellation independently from the fixed-step render loop;
- `src/game/garagePedestalRuntime.ts` owns garage hero construction, shader
  submission, warm visual residency, switch convergence, and battle handoff;
- `src/game/garageShowroomRuntime.ts` owns the Garage camera phase latch,
  pointer capture, drag/wheel routing, and listener disposal while the engine
  orbit remains the sole camera-pose solver;
- `src/game/battleIntentRuntime.ts` owns explicit Battle preloading, concrete
  Random-map reservation, intent-only world scheduling, exact-roster texture
  coalescing, and the camouflage-safe handoff into covered entry;
- `src/game/battleWarmRuntime.ts` owns the typed Battle/Studio-only terrain,
  effect, wreck, hidden-variant, and fallback shader-warm implementation; its
  retryable access facade is acquired before any synchronous fallback drain.
  Network entry uses the final battlefield light set, temporarily attaches
  distance-managed detail, and performs one offscreen fielded-wreck draw so
  driver linking and destruction textures cannot move into live combat;
- `src/game/battleClientAccess.ts` owns the retryable client combat boundary;
- `src/ui/minimapAssetRuntime.ts` owns baked minimap request coalescing,
  stale-world rejection, load traces, and the procedural fallback edge;
- `src/ui/battleLoad.js` is intentionally boot-critical: its small roster veil
  is ready before Battle can be pressed and covers the first asynchronous
  world, vehicle, or network transfer on a pristine connection;
- `src/game/battleVisualStreamer.ts` owns bounded vehicle texture upload,
  production-target shader submission, and spotting-safe scene attachment;
- `src/game/battleVisualStreamerAccess.ts` keeps that staging implementation
  out of garage boot and retries it on battle or joined-lobby intent;
- `src/world/worldBuildCoordinator.ts` owns battlefield build/cache work;
- `src/net/networkFramePump.ts` owns host/client frame cadence and snapshots;
- `src/net/networkBattleBarrier.ts` owns initial-snapshot and peer-ready
  predicates plus the identity-bound READY retry lease;
- `src/net/networkRoomCoordinator.ts` owns the persistent room UI lifecycle;
- `src/net/networkBattleLaunchRuntime.ts` owns private/LAN, retained-room
  rematch, and ranked launch policy plus cold-entry failure cleanup;
- `src/net/connectionRecovery.ts` owns the single reconnect presentation edge;
- `src/dev/debugTelemetry.ts` owns read-only diagnostics;
- `src/dev/driveTestController.ts` owns deterministic rendered-battle QA input.
- `src/dev/combatTelemetry.ts` owns debug-only attributable shell and bot
  pressure receipts; ordinary production installs no telemetry listeners.
- `src/dev/shotContract.ts` exposes only the stable capture view names at boot;
  `src/dev/shotRuntime.ts` demand-loads all deterministic staging only after
  an engineering tool explicitly calls `window.__SHOTS.set()`.

`src/main.js` still declares dependency order and connects these ports, but it
does not reimplement their state machines.

## Directory ownership

| Directory | Responsibility | Must not own |
| --- | --- | --- |
| src/engine | Renderer, camera, lighting, sky, post, quality, GPU recovery | Hits, damage, spotting, match outcome |
| src/world | Map registry, terrain, props, vegetation, collision, destructibles | Player input or network policy |
| src/vehicles | Specs, geometry, materials, running gear, labels, generated asset contracts | Match lifecycle |
| src/sim | Renderer-free movement, aiming, shells, armor, damage, spotting, bots, match state | DOM or Three.js presentation |
| src/game | Local composition, input, equipment, consumables, profile, killcam, Studio | Network protocol validation |
| src/net | Protocol, rooms, transport, snapshots, prediction, presentation bridge | Authoring combat rules twice |
| src/ui | Garage, HUD, rooms, reports, settings, touch controls, icons | Resolving gameplay truth |
| src/fx | Presentation clock, particles, impacts, decals, destruction effects | Authority state |
| src/audio | Audio graph and voice/effect playback | Match state |
| server | Signaling, distributed rooms, dedicated matches, ranked queue and rating | Browser rendering |
| tools | Generation, probes, browser rigs, release checks, captures | Shipped gameplay behavior |

## Application lifecycle

src/main.js is the legacy composition root. New ownership moves out through
tested strict-TypeScript boundaries; src/game/stateCore.ts is the shared
session boundary, src/game/rosterState.ts owns roster/visual planning, and
src/game/soloBattleRuntime.ts demand-loads src/game/state.js, which remains the
legacy solo battle owner.

Migration is boundary-first, not extension-first. A JavaScript subsystem moves
only when its coherent owner and focused behavioral test are clear. A rename
to `.ts`, broad `any`, or `@ts-nocheck` does not count as migration. Refactor
commits preserve rendering and gameplay; behavior changes land separately.

`src/game/battlePresentationRuntime.ts` is the hot rendered-vehicle owner. It
separates fixed-step solo interpolation from already-smoothed network poses and
concentrates spotting residency, track-detail cadence, vehicle FX, and light
prop contacts behind one allocation-bounded interface.

`src/game/soloBattleDeploymentRuntime.ts` is the covered entry owner. The
composition root supplies concrete capabilities and receives only a generation
and reveal receipt; it must not duplicate warm ordering or shader/shadow policy.

`src/game/battleResultPresentationRuntime.ts` is the post-simulation result
owner. The frame loop invokes it once after authority advances and does not own
death-beat deadlines, replay-pending state, or result-presentation latches.

### Boot

The boot path establishes the renderer, essential garage scene, selected
vehicle, and primary interface first. Optional or combat-only work is deferred
until after a presentable frame. The quality module classifies capability and
runs a render probe before committing expensive defaults.

`src/engine/viewportRuntime.ts` keeps renderer, camera, post, and CSM dimensions
atomic. Its zero-size first-layout recovery is inert on normal boots and
self-disarms as soon as a host exposes usable dimensions.

`src/engine/frameLoopScheduler.ts` keeps one queued animation-frame owner and
funnels context-restoration, hidden-pane timer, and hidden-input recovery into
the same frame callback. Boot gating and focus checks preserve full background
freeze without losing short control edges in interactive embedded panes.

The boot contract is:

- a visible transition or garage frame must cover asynchronous work;
- failure of an optional feature must not leave the output black;
- the game-ready signal is emitted only after the minimum interactive state;
- proven module failures receive at most two fresh-document attempts, while
  slow foreground work receives a nonblocking retry before any automatic
  navigation is considered;
- hidden or offline documents never auto-reload, and a counted retry URL
  prevents loops when session storage is unavailable;
- public presentation routes must not preload the game graph.
- garage boot must not statically import the solo battle authority graph.
- deterministic capture recipes and fallback combat warm generators must not
  reside in the mandatory garage entry chunk.

`bootLifecycle.ts` is the only stage-state owner. `battleModuleAccess.ts`
coalesces concurrent hover/click imports and clears only a failed request, so a
transient chunk failure can retry without restarting healthy boot work.

### Garage

The garage owns vehicle selection, equipment selection, map/mode entry,
settings access, room reminder state, and entry into Scene Studio. Vehicle
portraits and cards are generated from the same roster used by battle.

The optional workshop is split into two typed owners. `garageDressingAccess.ts`
keeps the final light signature stable while demand-loading authored geometry;
`garageDressingScheduler.ts` advances complete visual chunks only during a
genuine input and transition lull. The background battlefield builder observes
the same garage-activity epoch, so optional world and workshop work cannot
independently pile onto an interactive frame.

`garagePedestalRuntime.ts` owns the selected hero as one lifecycle: construction,
off-stage shader submission, warm visual LRU, stale-switch cancellation,
watchdog convergence, and reuse across the battle boundary. It composes
`garagePedestalPreloader.ts`, which owns card-neighbor and pointer-intent
warming, loads only exact vehicle families, cancels stale work after fresh
input, coalesces repeated intent, and bounds retained texture-only previews.
`garageIdleWorkCoordinator.ts` serializes that paint with background world and
workshop construction; it does not change authored work or visual quality.

After the complete workshop arrives, `garageDressingOptimization.ts` freezes
stable descendant transforms, batches exact repeated opaque props sharing
geometry/material/render state, and removes only sub-resolution fitting shadow
casters. Transparent or specialized meshes and authored fleet exhibits stay
independent; authored proxy shadows and every visible surface remain intact.

`garageShowroomRuntime.ts` presents one phase-scoped camera interface to the
composition root. It owns primary-pointer capture, drag cancellation, wheel
consumption, and listener lifetime. The existing engine orbit still computes
every camera pose from the unchanged canonical hero frame.

`battleIntentRuntime.ts` owns the next operation rather than any rendered
object. A Battle hover or focus transfers battle-only modules, plans the exact
roster, coalesces its texture work, resolves Random to one concrete map, and
starts that map's bounded prefetch. The click consumes that same reservation.
Covered entry first drains or cancels the hover bake, applies the chosen map's
camouflage, and resumes exact-roster baking with the loading-screen yielder.
Changing tank/map or starting a new round invalidates the reservation.

### Battle entry

Solo Battle intent begins downloading the solo authority chunk and the exact
next roster/map through `battleIntentRuntime.ts`; the covered battle barrier
joins that work in parallel with independent world construction. A
network battle first establishes a room or ranked session, then loads the
selected map and roster behind an opaque transition without importing solo
authority. The browser bridge mounts visuals only after authority has a valid
initial state.

`networkBattleLaunchRuntime.ts` is the common mode-launch owner above that
presentation seam. Private/LAN first entry, retained-room rematch, and ranked
handoff share identity validation, loader presentation, cleanup, and typed
failure diagnostics instead of implementing parallel policies in `main.js`.

Every new battle resets result and presentation state. A previous verdict must
not survive into a new network round.

### Battle exit

Solo returns directly to the garage. A private or LAN result returns the room
to waiting and resets readiness while retaining the connection. Closing the
report returns to the garage without issuing Leave.

## Simulation clock

Movement and combat use a fixed step:

    SIM_DT = 1 / 60 seconds

The render loop accumulates wall time, advances a bounded number of simulation
steps, and clamps long interruptions. This prevents display refresh rate from
changing acceleration, reload timing, shell motion, fire damage, repairs, or
bot decisions.

Network authority publishes snapshots at 20 Hz, but it continues simulating at
60 Hz. Snapshot frequency is a delivery policy, not a gameplay clock.

## Vehicle state and identity

A vehicle has three related but separate forms:

1. Specification: dimensions, mobility, weapons, armor, modules, crew, labels,
   and appearance metadata.
2. Authority state: position, orientation, speed, aim, ammunition, hit points,
   modules, visibility, and result contribution.
3. Presentation: Three.js hull, turret, gun, fittings, wheels, track links,
   materials, effects, and interface assets.

Player identity and vehicle identity are independent. Multiple players can use
the same vehicle specification without sharing authority or visual state.

The registry is finalized by src/vehicles/specs.js and the first-party
registration modules. src/vehicles/tankFactory.js constructs the visual from
the selected specification. Generated assets are checked against live geometry
and metadata fingerprints.

## Movement system

src/sim/movement.js owns tank motion. Its inputs are normalized controls,
vehicle parameters, terrain support, collision context, and fixed time step.
Its outputs include authoritative position, yaw, velocity, hull attitude,
support information, contact phase, vertical velocity, landing impulse, and
track travel.

The solver covers:

- engine force and power-to-weight behavior;
- forward and reverse limits;
- steering and pivot behavior;
- brake and handbrake;
- slope and ground resistance;
- engine/track/ground-derived climb authority and gravity-driven downslope return;
- map boundary and obstacle collision;
- tank-to-tank collision and ramming;
- crushable prop interaction;
- per-wheel terrain support;
- damped chassis height, pitch, and roll;
- suspension-limited contact release, ballistic flight, and landing;
- bounded rigid-air angular momentum, rollover, and tank-on-tank support.

Vertical motion has two explicit deterministic phases. While `grounded`, the
sprung chassis follows the sampled support plane within the running gear's
compression and droop limits. When support falls beyond full droop, the tracks
unload, drive/brake/steering forces stop, horizontal momentum is preserved, and
`verticalSpeed` integrates gravity. Pitch and roll angular velocity continue
through the unsupported phase with light air drag; terrain attitude cannot
instantaneously pull the nose onto a distant downslope. Contact resumes only
when the fully extended footprint reaches terrain. The landing impulse is
bounded and applied at the contact offset before the terrain spring blends
back in, so hard or off-axis landings can initiate a physical tumble while
ordinary landings retain the established suspension settle.

`src/sim/tankBodyContacts.ts` adds the deliberately narrow three-dimensional
dynamic-contact layer that the ground capsule solver does not own. Grounded
tanks keep the established inexpensive two-dimensional collision path. A
clearly vertically ordered overlapping pair can instead resolve roof/side
support, mass-weighted vertical impulse, off-center pitch/roll torque, stacking,
and rollover. At the fourteen-vehicle ceiling this is 91 allocation-free broad
phase checks per fixed tick; the capsule and vertical-box work runs only for
horizontal overlaps. A side/roof-down tank remains physically recoverable: a
teammate shove or renewed body motion restarts its stationary recovery timer.
After fifteen still seconds, a bounded righting actuator rolls the hull across
its contact edge; it does not teleport the pose. This preserves visible flips
and stacking without letting an overturned bot hold a match open forever.

There is no universal climb angle. The
solver compares gravity demand with engine acceleration and track grip derived
from power-to-weight, current engine/module health, the vehicle's per-ground
resistance, and its optional `trackTraction` multiplier. Insufficient engine
force produces a natural stall and rollback; exhausted track grip additionally
rejects wall-like uphill contact.

The solver raises `slopeBlocked` whenever commanded uphill travel exceeds the
current vehicle capability. Global bot A* and the local recovery fan consume
the same terrain-mobility functions, including hard/medium/soft ground, so a
bot routes around a grade its own tank cannot sustain instead of following a
fleet-wide cutoff. A sustained block still enters deterministic reverse/detour
recovery. The richer local height probes remain dormant during ordinary
traversal, so terrain-aware correction does not become a per-frame AI cost.

The movement module is used by solo, browser-hosted authority, dedicated
authority, local network prediction, bots, and Studio terrain settlement.

Presentation consumes support and travel but does not feed cosmetic wheel or
track placement back into authority.

Network snapshots carry quantized `vy` and an airborne flag. Remote
presentation interpolates Y with velocity-aware Hermite motion, and local
prediction seeds and replays the same contact phase and vertical velocity as
authority. This prevents a browser client from flattening or re-grounding a
server-authoritative jump.

## Aiming and gunnery

Player aim begins as a finite world point. For network delivery it becomes a
bounded yaw, pitch, and distance intent. The authority reconstructs the
requested point relative to the controlled vehicle.

The turret solve proceeds in this order:

1. Convert the requested point into vehicle-local direction.
2. Compute desired turret yaw and gun pitch.
3. Clamp to traverse arc, elevation, and depression.
4. Approach the result at the vehicle's traverse and elevation rates.
5. Resolve the actual muzzle transform.
6. Apply dispersion and spawn the shell from that transform.

The client cannot submit a hit point or barrel transform. This preserves
authority while keeping close-range aim consistent with solo play.

## Ballistics, armor, and damage

src/sim/ballistics.js advances shells and resolves candidate impacts.
src/sim/armor.js evaluates the struck plate. src/sim/damage.js applies vehicle,
module, crew, fire, and destruction state.

Explosive reactive armor is a one-shot authoritative plate, not a cosmetic hit
kind. The damage solver records the exact activated plate name in `eraSpent`
even when the projectile continues into base armor. Presentation consumes that
same event additively: the cassette emits its sharp blast, sparks, smoke,
fragments, and audio before the deeper penetration/non-penetration effect, then
the exact authored visual cluster is removed. Procedural irregular cassettes
retain their ordinary merged material buckets and draw-call count; the factory
records vertex spans only for the rare activation/reset operation. Instanced
ERA uses the equivalent matrix-depletion path. A round reset restores every
cluster.

The authority emits:

- durable changes such as hit points, module state, death, destructibles, and
  match result;
- reliable one-shot events such as shot, impact, module alert, destruction,
  and match-ended presentation.

Persistent facts are never represented only by one-shot events.

## Spotting and hidden information

src/sim/spotting.js owns visibility. It evaluates view range, concealment,
movement and firing state, foliage, line of sight, and radio relationships.

In network play, matchRuntime produces a viewer-specific snapshot. Hidden
enemy transforms are excluded before encoding. Observer peers are explicitly
marked and receive the view required for spectating.

## Bots

Bots output the same control vocabulary as human players. Route planning and
local steering are separate:

- src/sim/botRoutePlanner.js chooses traversable strategic routes;
- src/game/ai.js and server authority logic turn those routes into immediate
  movement, aim, fire, and recovery controls.

Seeded openings permit reproducible tests. Local traffic avoidance, reverse
recovery, hill handling, and replanning prevent one path from becoming the
entire behavior model.

## World system

src/world/maps/index.js is the ordered map registry. Each map configuration
defines identity, terrain, dressing, lighting, vegetation, and gameplay
parameters. src/world/map.js composes the world.

The browser world exposes:

- height and terrain-normal sampling;
- collision queries;
- concealment and vegetation volumes;
- destructible registration and revision;
- map dressing, sky, lighting, and minimap data.

The dedicated service inflates server/world-collision-manifests.json so it can
run collision without WebGL or DOM dependencies. The manifest and browser
world must describe matching obstacles and destructible identifiers.

World instances may be cached between entries. Reset logic must clear
match-specific destruction and visibility state without rebuilding immutable
terrain unnecessarily.

Large baked sandbag and utility-pole streams have two representations with one
owner. `props-models.json` is the attributed, reviewable authoring source.
`propsModelStore.ts` owns the deterministic packed runtime archive, transfer,
decompression, validation, retry, and zero-copy typed-array views. Async map
construction begins that transfer before terrain work and joins it only when
props are needed. `npm run world:props:pack` regenerates the archive; its
self-test proves every float and index matches the source.

## Renderer and quality

src/engine/renderer.js owns the WebGL renderer and render-loop integration.
Lighting, sky, post, camera, quality policy, warmup, and device diagnosis remain
separate modules so a failed optional path can degrade independently.

Quality policy controls:

- internal render scale;
- antialiasing and post-processing;
- shadow resolution and distance;
- vegetation and prop density;
- texture budgets;
- particle and effect budgets;
- idle warmup and background scheduling.

Combat state, simulation rate, map dimensions, and armor resolution do not
change by device tier.

The render-target watchdog always restores the previous target in a finally
path before disposing temporary resources. A diagnostic failure must not
strand subsequent frames on an off-screen target.

Low-frequency renderer, world, network, and shadow telemetry is owned by
`src/dev/debugTelemetry.ts`. The composition root supplies live subsystem
references; the diagnostic owner remains read-only outside its explicit,
state-restoring shadow A/B probe.

## Presentation bridge and effects

src/net/browserBattleBridge.js applies sampled authority state to browser game
state. The main render loop owns the final visual synchronization, avoiding a
second full tank sync in the same frame.

src/net/presentationEventQueue.js separates critical and cosmetic work:

- critical state and report transitions apply immediately;
- heavy remote smoke, debris, sparks, and destruction work is admitted within
  a per-frame budget;
- reliable event identifiers prevent duplicate presentation;
- snapshot interpolation remains independent from event delivery.

Destruction causes are known before a visual crosses into its destroyed state
so ammo-rack and ordinary destruction can produce the correct first effect.

## Multiplayer protocol

src/net/protocol.js defines protocol version 4 envelopes and validation.
src/net/matchRuntime.js owns authority ticking, input ordering, readiness,
viewer snapshots, acknowledgements, and catch-up bounds.

LAN/private WebRTC uses:

- cot-match-v1: ordered reliable control and events;
- cot-state-v1: unordered, zero-retransmit snapshots and live input.

`src/net/webrtcPeer.ts` owns typed SDP/ICE negotiation. A slow fresh join first
replays its exact pending description, duplicate descriptions are idempotent,
and only a later bounded attempt performs ICE restart. This keeps the initial
handshake stable while retaining route-change recovery.

Rendezvous messages are additionally addressed to sender and receiver
page-session IDs. The room store rejects stale receiver generations, and the
browser discards stale mailbox deliveries before they reach `RTCPeerConnection`.
Player IDs remain stable for seat recovery; page-session IDs identify only the
current negotiation generation.

Snapshots use a compact binary codec, per-peer baselines, deltas,
acknowledgements, and periodic keyframes. A client missing a delta baseline
waits for a keyframe instead of applying undefined state.

Ranked WebSocket is ordered, but pending snapshot and input state is coalesced
so obsolete frames cannot block control traffic. Fire and consumable edges are
repeated until acknowledged and deduplicated by authority.

## Prediction and reconciliation

Remote entities use an adaptive interpolation delay, Hermite position
interpolation, shortest-angle rotation blending, and bounded extrapolation.

The local entity predicts the same movement code as authority, including
terrain contact, map bounds, and nearby static collision. On snapshot:

1. accept the latest authoritative local state;
2. remove acknowledged inputs;
3. replay remaining inputs through shared movement;
4. ease normal visual error through separate horizontal, terrain-support, and
   live-aim presentation channels;
5. snap only beyond the safety threshold; a terminal wreck pose remains
   authoritative but settles through bounded presentation correction.

Prediction never resolves local damage, spotting, destructibles, or match
result. Terrain and dynamic contact keep support height and hull attitude on a
heavier 300 ms correction envelope, while turret and gun aim converge faster.
Presentation additionally caps a rendered frame to 0.20 m of horizontal and
0.10 m of support-height correction. Browser gates retain wider 0.25 m and
0.15 m safety ceilings; authority and shared movement are unchanged.

## Lobby and room lifecycle

src/net/lobby.js is the canonical owner of team capacity, spectators,
readiness, selections, map, format, host permissions, lock policy, and start
policy. UI submits commands and renders room state; it does not mutate the
canonical roster locally.

`src/net/networkRoomCoordinator.ts` owns the browser lifetime around that
canonical state: lobby intent, room subscriptions, garage reminder state,
ready/start commands, selection locks, bounded chat buffering, menu attachment,
and one rematch claim per new round. It receives UI and match ports and imports
neither DOM nor Three.js. `src/net/networkFramePump.ts` separately owns the
per-frame match path; room lifecycle never advances simulation itself.

The lifecycle is:

    waiting -> starting -> playing -> waiting

ROOM_COMMAND carries intent. ROOM_STATE carries the canonical round, last
result, roster, team, selection, and readiness.

Shareable URLs carry the room code plus an optional host callsign used for
first-paint invitation text. Signaling returns canonical host identity during
join, so URL text never grants authority or overrides room state.

The room controller outlives the match runtime. At result:

- publish the final durable state;
- return the room to waiting;
- clear all ready flags;
- retain connected peers and transports;
- fan reliable waiting state in bounded browser-host batches, cancelling any
  unsent stale revision if a newer room command arrives;
- allow a new match runtime for the next round.

## Signaling and dedicated services

server/signalingServer.js relays membership, Session Description Protocol
offers and answers, and Interactive Connectivity Establishment candidates. It
does not carry gameplay. Correlated mailbox-poll acknowledgements provide the
browser-visible liveness signal that native WebSocket ping/pong cannot expose;
the client replaces a half-open signaling socket and resumes the same durable
room seat after a bounded missed acknowledgement.

Production signaling can use server/distributedRoomStore.js for Redis-backed
membership and publish/subscribe notifications across function instances.
Redis connectivity is deployment-critical for distributed room lookup and
must be monitored separately from WebRTC gameplay.

server/dedicatedMatchServer.js owns ranked WebSocket sessions.
server/rankedMatchmaker.js owns queue grouping.
server/ratingStore.js owns idempotent rating settlement.

Private browser hosts are trusted. Ranked moves authority to the service.

## User interface

The interface is a projection of canonical state:

- garage: selected vehicle, equipment, map, record, mode, and room reminder;
- lobby: roster, teams, vehicle names and icons, readiness, host controls;
- HUD: vehicle state, reticle, ammunition, modules, map, and network status;
- killcam and shot information: resolved combat event;
- after-action report: outcome, personal contribution, team result, and live
  rematch readiness;
- settings and touch controls: device-appropriate input and quality.

Ready state locks mutable battle selections. The lock must be enforced by room
authority as well as reflected visually.

## Authoring tools

Scene Studio uses the production world, vehicle factory, effects, materials,
terrain support, camera, post chain, and capture path while pausing combat.

Tank Gallery surface markup uses first-party visuals and records precise
geometry selections for review. It remains isolated from the playable boot
graph and is not a runtime battle dependency.

Generated vehicle portraits and diagrams are produced by tools/genIcons.mjs.
Marketing captures are produced by tools/marketing-shots.

## Storage boundaries

Local browser storage may contain preferences, bindings, garage selections,
anonymous player identity, and local battle record. It is not trusted for
ranked rating or match settlement.

Room state belongs to room authority. Ranked identity, tickets, and rating
belong to the dedicated service.

## Required invariants

Changes should preserve these invariants:

- no gameplay decision depends on a Three.js object;
- no render-rate-dependent simulation;
- no trusted client positions, hits, damage, or result;
- no hidden enemy transform in a normal viewer snapshot;
- no durable fact exists only in a transient event;
- no expensive cosmetic burst blocks critical state;
- no ready player changes locked selections;
- no playable loads comparison GLB geometry;
- no public build ships quarantined source assets;
- no public presentation route preloads the game module graph;
- no new round inherits the previous result.

Use docs/DEVELOPMENT.md to select the verification commands for a change.
