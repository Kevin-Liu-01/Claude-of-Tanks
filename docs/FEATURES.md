# Product features and technical achievements

This document connects the visible game to the systems that implement it. It is
written for players, contributors, reviewers, and anyone evaluating the project
without requiring them to reconstruct behavior from source files.

Claude of Tanks is a browser-native armored combat game built directly with
Three.js and Vite. It does not embed a commercial game engine, stream a native
application, or use React as a rendering layer. The repository contains the
gameplay simulation, first-party vehicle geometry, generated worlds, multiplayer
stack, authoring tools, test rigs, and public presentation.

## Current product facts

| Area | Current implementation |
| --- | --- |
| Playable fleet | 121 production-visible and 158 keyed local-development first-party procedural vehicles |
| Runtime vehicle provenance | 0 playable vehicles sourced from GLB geometry |
| Battlefields | 20 authored and destructible maps |
| Simulation | Fixed 60 Hz movement and combat rules |
| Presentation | Direct Three.js WebGL rendering with adaptive quality |
| Modes | Standard Battle, Capture the Flag, Zone Control, Turbo Ball, Endless Horde; solo, private, LAN, and ranked deployment |
| Platforms | Desktop and mobile browsers |
| Authoring | Scene Studio and Tank Gallery surface markup |
| Progression | No currency, experience grind, or tech-tree lock |

The executable provenance check is:

    npm run tank:native:check

At the time of this document update it reports 131 first-party procedural battle
playables, no GLB-sourced playables, and no comparison-source paths in the
runtime registry. Offline reference articulation lives under `tools/` only.
The canonical saved-roster report separately tracks all 160 records, including
development-only vehicles and two reference-only placeholders.

## Battle rules

Five rule sets use the same complete armored-combat simulation. Standard
Battle is the unchanged elimination game. Capture the Flag adds flag carry,
drop, return, three-capture scoring, and six-second respawns. Zone Control
scores three capturable sectors until one team reaches 1,000 points. Turbo Ball
gives both teams super-fast tanks and a physical ball that can be moved by a
hull or a shell; guns, armor, and damage remain active. Endless Horde is
cooperative: escalating bot waves increase in number, durability, and speed,
while deterministic floating repair and ammunition caches become progressively
harder to sustain.

The room host selects the rule before ready-up. The choice persists through
the authoritative lobby handoff and rematches. Objective bots pursue live
flags, uncaptured zones, the ball, or the nearest opposing survivor instead of
continuing the Standard Battle opening route. See `docs/GAME-MODES.md`.

## Armored combat

### Center-point gunnery

The center of the screen requests a finite point in the world. The turret and
gun attempt to reach that point while respecting traverse rate, traverse arc,
elevation, depression, damage, and physical aim constraints. The center marker
therefore represents player intent, while the gun marker represents the bore's
current solution.

Shots leave the resolved muzzle transform. They are not cast from the camera.
This preserves the meaningful difference between line of sight and line of
fire, including close-range parallax and a barrel that has not yet completed
its traverse.

Relevant implementation:

- src/sim/ballistics.ts
- src/net/aimIntent.ts
- src/game/state.ts
- docs/GUNNERY-CAMERA-SPEC.md

### Plate-level armor

Armor is explicit gameplay data rather than a single vehicle-wide defense
number. A hit resolves the actual struck plate and considers:

- plate thickness and slope;
- horizontal and vertical impact angle;
- shell normalization and ricochet rules;
- caliber overmatch;
- kinetic and chemical protection;
- spaced layers and external modules;
- explosive reactive armor;
- distance-dependent penetration where applicable.

The result feeds the shot panel and X-ray killcam. Those interfaces display the
authority's completed calculation; they do not run a second approximation.

Relevant implementation:

- src/sim/armor.ts
- src/sim/ballistics.ts
- src/ui/shotInfo.ts
- src/game/killcam.ts

### Ballistics and ammunition

AP, APCR, APFSDS, HEAT, and HE ammunition have distinct muzzle velocities,
gravity behavior, penetration curves, ricochet rules, and damage behavior.
Reload state, ammunition count, dispersion, movement bloom, and damaged gun or
loader state remain authority-owned.

Every shell slot carries its own finite authored count and can be selected and
fired while rounds remain. Guided missiles are ammunition, not a hidden weapon
mode: the E action selects the vehicle's ATGM slot exactly like its numbered
slot. External missile launchers retain independent 2–3 second reload channels,
so their cooldown neither empties nor blocks an autoloader magazine. Partial
autoloader clips can refill while an auxiliary launcher is selected, and
changing the desired cannon round does not restart a refill already underway.
Endless Horde uses these same counts and restores them through battlefield ammo
caches. Bots consume and switch the same authoritative inventories as players.

### Internal damage

Penetration can damage crew and modules inside the target. The simulation
tracks the engine, fuel tanks, ammunition rack, gun, turret ring, optics,
radio, tracks, and crew positions. Module state affects movement, reload,
aiming, spotting, fire, repair, and catastrophic destruction.

The visual damage panel, hit messages, killcam, and final report read the same
module registry and combat state.

See docs/MODULES.md for the detailed state machine.

## Movement and terrain

Claude of Tanks uses a fixed-step tank-specific movement solver rather than a
generic rigid-body vehicle preset. The solver handles engine force, gearing,
steering, braking, handbrake behavior, reverse speed, slope response, terrain
resistance, map bounds, vehicle collision, ramming, and crushable cover.

Terrain support is sampled beneath the running gear. Suspension damping turns
those samples into stable hull height, pitch, and roll instead of snapping the
vehicle to a single terrain normal. The presentation layer then conforms road
wheels and track paths to the solved support. Track links follow the actual
running-gear loop and scroll from measured hull travel.

This separation is important:

- the simulation owns traction, support, collision, and motion;
- the visual owns wheel travel, flexible link placement, dust, and track scroll;
- neither render frame rate nor cosmetic animation changes vehicle authority.

Relevant implementation:

- src/sim/movement.ts
- src/world/terrain.ts
- src/world/collision.js
- src/vehicles/tankFactory.ts
- tools/track-geometry.selftest.mjs

## Visibility, bots, and battlefield knowledge

Spotting combines view range, concealment, movement and firing penalties,
foliage, line of sight, radio sharing, and the 15 metre bush rule. Multiplayer
snapshots are filtered for the receiving viewer. Hidden enemy coordinates are
not sent to a normal player and then hidden only in the interface.

Bots use the same movement, spotting, ammunition, armor, and damage rules as a
human player. Seeded openings create repeatable test cases without forcing
every public match down one deterministic path. Route planning reads map
traversability, while local avoidance and stall recovery handle traffic,
obstacles, and failed climbs.

Relevant implementation:

- src/sim/spotting.ts
- src/sim/botRoutePlanner.ts
- src/game/ai.ts
- server/authoritativeBots.selftest.mjs

## Twenty generated battlefields

The game includes:

1. Verdant Fields
2. Sirocco Wadi
3. Frosthollow
4. Steinburg
5. Saltmere Bay
6. Amberford
7. Tarkhan Steppe
8. Cinder Junction
9. Frontier Basin
10. Nordhavn Fjord
11. Jade River Delta
12. Redrock Divide
13. Monsoon Ridge
14. Glacier Pass
15. Obsidian Caldera
16. Ironworks
17. Ruinspires
18. Blackglass District
19. Titan Gorge
20. Skybridge Chasm

Each battlefield combines a generated height field, material program, authored
landmarks, roads, structures, foliage, concealment volumes, collision,
destructibles, sky, lighting, fog, and minimap. Browser-hosted and dedicated
matches use matching collision descriptions.

All twenty maps use the same modern world-quality vocabulary: 28 procedural
structure families, independently destructible huts and camps, persistent
debris, vehicle wreck families and detached remnants, topple interactions,
connected utility networks, loose physical props, terrain attachment, and
narrow collision shapes. The original eight received a deliberate backport
rather than remaining a lower-detail compatibility tier.

Landmarks and ordinary buildings share connected exterior-detail rules:
foundations, courses, corner piers, gutters, drainpipes, awnings, service
conduits, AC/louver clusters, facade bay piers, recessed windows, crossed
mullions, ledges, doors, chimneys, dormers, and roof equipment must touch a
wall, the ground, or a declared supported
fixture. Large structures merge those details into their existing material
batches. Repeated destructible buildings retain one instanced intact pool and
one instanced wreck pool, including collapsed panels and surviving frames.
Stable per-instance tinting breaks up repeated prefab rows and follows the same
building into its packed wreck slot without another material or draw call.
Packed AO/roughness maps and normal maps deepen surfaces without multiplying
geometry, while restrained clearcoat and emissive panes reuse the renderer's
environment and post-processing stack.

Destruction is durable state. A destroyed prop changes collision and is
represented by a revision plus destroyed identifiers so a packet loss,
keyframe, or reconnect cannot restore the obstacle on only one client.

## First-party vehicle fleet

Every selectable vehicle is assembled by the repository's own geometry
pipeline. A vehicle specification provides:

- dimensions, mass, engine output, speed, and gun limits;
- ammunition and reload behavior;
- armor plates, crew, and module volumes;
- concealment and spotting values;
- hull, turret, gun, fittings, running gear, and material metadata;
- nation, tier, labels, markings, and generated interface assets.

The same specification serves the garage, battle authority, bot roster, icon
generator, armor diagrams, module diagrams, loading screen, and renderer.
Public builds strip quarantined comparison assets. Historical source models
remain research inputs only and do not replace playable geometry.

The generated package for each vehicle includes shaded portraits, top and side
silhouettes, armor diagrams, separate module and crew diagrams, and markings. The manifest
stores fingerprints and hashes so stale presentation assets fail verification.

See docs/TANK-ASSET-PIPELINE.md and docs/BUILD-STANDARD.md.

## Multiplayer and persistent rooms

### Four authority arrangements

| Mode | Authority | Delivery |
| --- | --- | --- |
| Solo bots | Local browser, direct composition | No network layer |
| LAN | Trusted browser host | Direct WebRTC data channels |
| Private room | Trusted browser host | WebRTC with configured ICE fallback |
| Ranked | Dedicated Node service | Authenticated WebSocket |

Network clients send control intent, not trusted outcomes. Position, spotting,
hits, damage, reload completion, destructibles, and victory are resolved by
authority.

LAN and private rooms separate ordered reliable control from replaceable state.
Lobby commands, combat events, and errors use the reliable channel. Live input
and viewer-filtered 20 Hz snapshots use an unordered, zero-retransmit state
channel with acknowledgements, edge redundancy, deltas, and periodic keyframes.

Remote vehicles use buffered interpolation and bounded extrapolation. The local
vehicle predicts the shared movement code and replays unacknowledged input
after reconciliation.

### Room continuity

A battle result ends the round, not the room. Connected peers remain in the
room, readiness resets, and the next round replaces the match runtime without
recreating the WebRTC relationship. The result screen and lobby show live
play-again readiness.

Closing the result screen returns to the garage while keeping a compact room
status below Battle. A ready player cannot change vehicle, equipment, or team
until they unready. Invite links contain the room code and join through the
normal loading gate.

A copied invitation carries both the room code and the host callsign, producing
a human entry such as “Join Kevin’s Game” from the first loading frame. The
callsign in the URL is presentation metadata only: after joining, signaling
returns the authoritative host identity and the lobby replaces the label. Old
room-code-only links remain valid.

A non-host can reload while the host's room is waiting and reattach with the
stable browser player identity. Reloading the browser host ends browser-owned
authority; host migration is not claimed.

See docs/MULTIPLAYER-ARCHITECTURE.md.

## Results and combat presentation

The after-action report is organized around combat rather than an artificial
economy. It reports outcome, survival, damage, kills, assists, blocked damage,
spotting contribution, shot efficiency, team results, and rematch readiness.

One-shot combat and destruction events use reliable delivery independently
from replaceable snapshots. Critical state is applied immediately. Expensive
cosmetic work such as smoke, sparks, debris, and multi-vehicle destruction
bursts is admitted through a bounded presentation queue so one network frame
cannot monopolize rendering.

The X-ray killcam reconstructs the resolved shot path, struck armor, effective
protection, penetration result, damaged internals, and destruction cause.

## Graphics, drivers, and high-refresh presentation

The renderer identifies device, browser, WebGL, GPU, and driver capabilities
before selecting a quality contract. That contract governs pixel density,
render scale, texture and shadow budgets, vegetation, particles, transparent
depth work, anti-aliasing, post-processing, and shader prewarm. Black-frame and
context-loss recovery can rebuild presentation state without changing combat
authority.

Four quality-scaled cascaded shadow maps use stable texel anchoring and
articulation-aware tank shadow hulls. Output grading and anti-aliasing share a
fused presentation path, while repeated world objects, particles, and temporary
vectors use batched, pooled, or reused storage to limit draw calls and garbage
collection. The game can render above the 60 Hz simulation rate with interpolated
presentation; the current certified desktop path reaches 120 FPS. This is a
measured path, not a promise for every browser, resolution, thermal state, GPU,
or driver.

The diagnostics surface exposes FPS, ping, frame timing, draw calls, triangles,
memory, quality state, render scale, post path, GPU/driver identity, and network
telemetry. The compact FPS/ping readout remains available during normal play.

See docs/PERFORMANCE.md and src/engine/SKILL.md.

## Desktop, mobile, and accessibility

Desktop controls are remappable. Hold `Caps Lock` (or secondary `Left Alt`,
controller `RB`) to preserve the current turret rotation and gun elevation
while freely moving the live sight; release lets the gun catch up. `Shift`
toggles sniper mode; configurable `RMB` behavior provides
hold-to-aim, toggle-aim, or a second free-look binding, and wheel-in can enter
the scope. Mobile receives a dedicated touch layout with movement
joystick, swipe aim, pinch-to-scope, dynamic fire controls, safe-area handling,
and mobile aim assistance.

The quality system changes rendering cost rather than combat rules. Resolution,
shadows, post effects, vegetation, texture sizes, particle budgets, and
background work adapt independently. Smaller layouts reduce nonessential
labels and penetration diagrams while preserving core controls and state.

See docs/PERFORMANCE.md.

## Built-in production tools

### Scene Studio

Scene Studio is a production mode inside the game. It can place current roster
vehicles on any map, settle them through the terrain support solve, pose hulls,
turrets, and guns within physical limits, apply camouflage and damage, trigger
real effects, freeze a deterministic timeline, and capture through the
production renderer.

The current public field archive combines 50 new checked-in Studio scenes with
11 deterministic game/interface states. Its manifest records titles, maps,
features, actors, effects, and capture provenance. The landing page, field
manual, Gallery, and Studio all render the same filterable archive component.
No generative or substituted vehicle imagery is used.

See docs/STUDIO.md.

### Tank Gallery markup

The Tank Gallery includes authoring and review tools beside every vehicle
dossier. Its Markup layer loads only first-party procedural vehicles, provides
repeatable camera and articulation views, and records exact mesh triangles,
transforms, bounds, centroids, and requested changes in portable JSON with a
matching PNG.

See docs/GALLERY.md.

## Public visual archive

`public/media/showcase-r1/manifest.json` is the contract for the current
88-frame archive: 13 owner-selected features, 30 action compositions, 30
foreground compositions, five directed Studio keyframes, and ten live interface
states. The publisher also records six 2400×592 contact sheets that preserve the
human collection-review pass before 4K admission. Checked-in scene data, the
serialized capture harness, automated image grading, owner approval, and the
publisher keep the archive reproducible and prevent hand-curated imagery from
drifting away from the game.

## Verification as a product feature

The repository includes executable checks for the claims above:

| Claim | Primary verification |
| --- | --- |
| Movement, combat, bots, rooms, UI, services | npm test |
| Real signaling and two-browser WebRTC | npm run test:net:browser |
| First-party playable provenance | npm run tank:native:check |
| Vehicle assets and fingerprints | npm run tank:assets:check |
| Fleet geometry freeze | npm run tank:freeze:check |
| Public artifact and quarantine strip | npm run build |
| Private tooling artifact | npm run build:private |
| Cold-load behavior | npm run perf:cold |
| Development performance trace | npm run perf:dev |

The detailed verification map is in docs/DEVELOPMENT.md. The dated
conversation-to-practice synthesis, with fresh renderer captures and commit
evidence, is summarized in docs/TECHNICAL-OVERVIEW.md and the architecture
decision records.
