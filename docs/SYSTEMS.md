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
src/game/state.js. LAN, private, and ranked modes use
src/sim/authoritativeMatch.js behind the protocol and browser presentation
bridge. These compositions share movement, aiming, ballistics, armor, damage,
spotting, bot, destructible, and result rules.

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

src/main.js is the composition root.

### Boot

The boot path establishes the renderer, essential garage scene, selected
vehicle, and primary interface first. Optional or combat-only work is deferred
until after a presentable frame. The quality module classifies capability and
runs a render probe before committing expensive defaults.

The boot contract is:

- a visible transition or garage frame must cover asynchronous work;
- failure of an optional feature must not leave the output black;
- the game-ready signal is emitted only after the minimum interactive state;
- public presentation routes must not preload the game graph.

### Garage

The garage owns vehicle selection, equipment selection, map/mode entry,
settings access, room reminder state, and entry into Scene Studio. Vehicle
portraits and cards are generated from the same roster used by battle.

### Battle entry

Solo starts the local composition. A network battle first establishes a room
or ranked session, then loads the selected map and roster behind an opaque
transition. The browser bridge mounts visuals only after authority has a valid
initial state.

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
- rated-grade traction rejection and gravity-driven downslope return;
- map boundary and obstacle collision;
- tank-to-tank collision and ramming;
- crushable prop interaction;
- per-wheel terrain support;
- damped chassis height, pitch, and roll;
- suspension-limited contact release, ballistic flight, and landing.

Vertical motion has two explicit deterministic phases. While `grounded`, the
sprung chassis follows the sampled support plane within the running gear's
compression and droop limits. When support falls beyond full droop, the tracks
unload, drive/brake/steering forces stop, horizontal momentum is preserved, and
`verticalSpeed` integrates gravity. Contact resumes only when the fully
extended footprint reaches terrain. A slope at or above the 28-degree rated
grade rejects remaining uphill velocity and applies full along-slope gravity;
lower grades continue to use the engine, resistance, and creep model.
The solver raises `slopeBlocked` on a rejected drive tick. Bot controllers
consume that authoritative contact signal to activate a short-lived,
fixed-cadence terrain fan, selecting a climbable contour before the generic
stuck timeout. A sustained block also enters deterministic reverse/detour
recovery. The richer height probes remain dormant during ordinary traversal,
so this terrain-aware path correction does not become a per-frame AI cost.

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
4. ease normal visual error;
5. snap on death or an error beyond the safety threshold.

Prediction never resolves local damage, spotting, destructibles, or match
result.

## Lobby and room lifecycle

src/net/lobby.js is the canonical owner of team capacity, spectators,
readiness, selections, map, format, host permissions, lock policy, and start
policy. UI submits commands and renders room state; it does not mutate the
canonical roster locally.

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
- allow a new match runtime for the next round.

## Signaling and dedicated services

server/signalingServer.js relays membership, Session Description Protocol
offers and answers, and Interactive Connectivity Establishment candidates. It
does not carry gameplay.

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
