# How Claude of Tanks works

This document describes the current game runtime. Historical fleet work and
quarantined reference assets are outside its scope. A Vite application runs a
Three.js rendering stack around a deterministic 60 Hz armored-combat
simulation. Multiplayer transports the same authority model over WebRTC or
WebSocket without moving gameplay decisions into the renderer.

## Runtime at a glance

```text
controls ──► 60 Hz authority ──► state + reliable events ──► presentation bridge
                 │                                          │
                 ├─ movement / terrain / collision           ├─ first-party tank visuals
                 ├─ aim / ballistics / armor / modules       ├─ tracks / suspension / effects
                 ├─ spotting / concealment / bots            ├─ HUD / audio / killcam
                 └─ destructibles / result                    └─ Three.js renderer / post
```

Solo composes the authority directly in the browser. LAN and private rooms put
one trusted browser in charge and carry inputs/state over WebRTC. Ranked puts
the authority in the dedicated Node service and uses an authenticated,
reconnectable WebSocket. All modes share the same movement, armor, damage,
spotting, bot, destructible, and outcome rules.

## Boot, garage, and lazy work

`src/main.js` owns application composition. The first visible garage frame is
kept deliberately narrow: renderer, garage, selected vehicle, and essential UI
arrive first. `fleetFactory.js` maps each tank id to an import-free ownership
manifest and downloads only that profile family before its first real build.
The battlefield constructor is a separate dynamic module; terrain, vegetation,
structures, and wreck code do not enter the startup graph. During a map build,
each deterministically selected tank wreck yields once so its exact vehicle
family can load before baking resumes. Studio and deterministic screenshot
authoring are the only explicit full-fleet gates. Garage and battle transitions
remain painted while this asynchronous work proceeds, so low-end hardware sees
progress instead of a blocked black canvas.

The quality system combines capability checks with a boot-time render probe.
Resolution, shadows, post effects, texture sizes, vegetation density, and
background work scale independently. A WebGL target watchdog can disable a
failing feature and restore output without changing combat behavior.

## First-party vehicle pipeline

The registry currently retains **150 vehicle records**. The production
projection exposes **111**; an explicit local-development key unlocks all
**148 first-party playable models** with `DEV` labels, while two generic
reference placeholders remain report-only. The generated inventory is
maintained in `VEHICLE-ROSTER.md`.
Playable geometry is assembled at runtime from authored profile stations,
armor forms, fittings, and procedural running gear in
`src/vehicles/tankFactoryCore.js`, `src/vehicles/fleetFactory.js`, and
`src/vehicles/profiles/`. Node audits retain the eager `tankFactory.js` facade;
the browser runtime uses the demand-loaded facade. The public runtime
does not swap those vehicles for community GLBs. Historical source assets are
quarantined comparison material and are stripped from public builds.

Each vehicle spec supplies dimensions, mass, mobility, gun limits, ammunition,
armor plates, modules, crew, concealment, and render metadata. Texture programs
paint the selected camouflage, surface breakup, welds, wear, and roughness. The
same spec drives the garage card, icon set, loading roster, armor logic, bot
selection, and final visual, which prevents the UI and simulation from quietly
describing different tanks.

Tracks are not a rigid decoration. The movement state samples terrain support,
solves hull pitch/roll with suspension damping, and passes wheel/track contact
to the visual. Links follow the running-gear path, conform over terrain-facing
road wheels, and scroll from measured hull travel rather than a cosmetic timer.

## World and renderer

Twenty authored battlefields are generated from code. The original eight are
Verdant Fields, Sirocco Wadi, Frosthollow, Steinburg, Saltmere Bay, Amberford,
Tarkhan Steppe, and Cinder Junction; Frontier Basin, Nordhavn Fjord, Jade River
Delta, Redrock Divide, Monsoon Ridge, Glacier Pass, Obsidian Caldera, and
Ironworks form the second set; Ruinspires, Blackglass District, Titan Gorge,
and Skybridge Chasm complete the current roster. Each owns a height field, material palette,
roads, foliage, structures, collision, concealment, destructibles, lighting,
sky, and minimap. Shared structure, wreck, loose-prop, utility-network,
terrain-attachment, and destruction systems keep the expanded vocabulary
consistent, while map-specific composition preserves distinct tactical spaces.
The browser and dedicated server share generated collision manifests so an
obstacle is not passable on one authority and solid on another.

Buildings use two bounded authoring paths. Large landmarks add windows,
reveals, ledges, gutters, downpipes, attached service equipment, roof fittings,
and biome-specific trim to the existing material buckets before those buckets
are merged. Lightweight destructible structures use intact and broken
`InstancedMesh` pools, so adding façade depth or a persistent collapsed frame
does not add one draw call per building. An authoring-time support graph rejects
floating fixtures and disconnected landmark parts. The same support receipt is
created before each lightweight building is merged, proving every intact roof,
porch, ladder, rack, frame, utility fitting, and grounded accessory reaches a
wall or physical ground contact. Collision is then captured from the final
seeded worlds into the dedicated-server manifest.

Wall, roof, stone, wood, straw, canvas, and structural-metal materials use
color, normal, and a packed linear surface texture (red AO, green roughness).
Sourced CC0 PBR sets replace the procedural fallback in-place after loading;
both paths keep the same material bindings. Glass uses the existing environment
map and restrained clearcoat, while a deterministic minority of window panes
emit warm light into the renderer's existing bloom path. Tone mapping, bloom,
environment reflections, warm sun, cool sky fill, and cascaded shadows remain
central renderer responsibilities rather than per-building effects.

The rendering system uses Three.js: a WebGL renderer, procedural sky and PMREM,
cascaded shadows, atmospheric fog, post-processing, particles, decals, and
audio. It does not decide whether a shell penetrated or a vehicle was spotted.
It presents state emitted by the authority.

## Movement and aiming

Movement advances in fixed 1/60-second steps. Engine force, gearing, steering,
braking, slope response, ground type, map bounds, tank collision, crushable
props, suspension, and hull attitude are resolved independently of render
rate. A clamped frame accumulator prevents a stalled/backgrounded tab from
integrating a giant physics step when it resumes.

The center screen aim ray establishes the requested world point. Turret yaw and
gun pitch track that point one-to-one within the vehicle's real traverse,
elevation, depression, and rotation-rate limits. The gun marker shows the
actual bore solution while the center marker preserves the requested point;
obstruction and convergence remain visible rather than silently moving the
shot. Dispersion, movement bloom, travel time, drop, and penetration are then
resolved from the real muzzle transform.

## Combat authority

The combat path is data-first and renderer-free:

1. The gun validates reload, ammunition, damage state, and physical aim limits.
2. Ballistics advances the selected AP, APCR, HEAT, HE, or APFSDS shell through
   time with muzzle velocity, gravity, and distance behavior.
3. Collision identifies the struck plate or destructible.
4. Armor resolves impact angle, normalization, ricochet, caliber overmatch,
   spaced armor, composites, ERA, and penetration roll.
5. Damage resolves HP, crew, modules, tracks, fuel, fire, ammo rack, and repair
   state.
6. The authority emits durable state plus reliable one-shot events for visuals,
   audio, the shot log, killcam, and results report.

Spotting uses view range, concealment, movement/firing bloom, foliage, and the
15 m bush rule. Viewer-specific network snapshots omit hidden enemy positions;
clients do not receive coordinates for vehicles they are not permitted to see.

## Bots

Bots use the same controls, movement limits, spotting, ammunition, armor, and
damage paths as players. Their seeded openings vary by match, traversability
planning reads the battlefield, local steering negotiates traffic/obstacles,
and recovery logic backs out of stalls and replans. The seed keeps test runs
reproducible without making every public battle follow one memorized route.

## Multiplayer transport and prediction

Protocol v4 carries validated envelopes with sequence, acknowledgement, and
simulation ticks. A client submits throttle, steering, brake, shell choice,
fire, explicit consumable action bits, and a bounded yaw/pitch/distance aim
intent. Keeping distance preserves the same finite center-screen world point
used by solo play; the former infinite-ray approximation changed close-range
gun parallax and could lay multiplayer barrels high. The authority still owns
traverse, elevation/depression, muzzle position, dispersion, hits, damage,
spotting, and victory.

LAN/private WebRTC splits traffic:

- reliable ordered control: handshake, lobby/room state, combat events, ping,
  errors, and leave;
- unordered zero-retransmit state: replaceable live input and 20 Hz snapshots.

Snapshots use compact encoding, acknowledgements, deltas, and periodic
keyframes. Remote tanks use adaptive buffered interpolation with bounded
extrapolation. The local tank predicts the shared movement code and replays
unacknowledged input after authority corrections. Persistent facts—match
result and destructible revision/state—also exist in snapshots/keyframes, while
reliable events carry one-shot presentation work exactly once.

## Persistent room and rematch lifecycle

A private or LAN room outlives one battle:

```text
waiting ──everyone ready──► starting ──load──► playing
   ▲                                              │
   └──────── result + readiness reset ◄───────────┘
```

Protocol-v5 `ROOM_COMMAND` and `ROOM_STATE` messages carry the room's round,
last result, roster, team, vehicle, equipment, map, and ready state on the
reliable channel. After a result the same peers remain connected, the room
returns to waiting, readiness resets, and the next round replaces only the
simulation authority—not the WebRTC transport. The report shows live
play-again intent. Closing it returns to the garage without leaving; a compact
room strip stays under Battle. Readiness locks vehicle/equipment/team changes
until the player unreadies. Explicit Leave disconnects from the room.

Invite URLs carry the validated six-character room code and a normalized host
callsign for human presentation. From the first loading frame the recipient
sees “Join Name’s Game”; after signaling joins, the service-provided host
identity replaces the URL hint. Room-code-only legacy links remain valid. On
the same deployed origin, opening the link loads the game and joins after the
normal boot gate.
Joined browsers keep that canonical room URL and a stable browser identity.
Reloading while the host's persistent room is waiting creates a fresh WebRTC
channel, reattaches the same player identity, and restores the room state;
vehicle and equipment can then be selected before readying again. An explicit
Leave clears the room URL. Because private/LAN authority lives in the host's
browser, reloading the host itself still ends that browser-owned authority;
host-failover would require migrating authority to another peer or service.
LAN uses direct Wi-Fi WebRTC and automatic same-origin/local signaling; private
internet rooms use deployed signaling plus configured ICE/TURN fallback.

## Results, replay, and presentation events

The end report is combat-focused because the game has no currency, XP grind,
or tech tree. It summarizes outcome, survival, damage, kills, assists, blocked
damage, spotting contribution, shot efficiency, team roster, and rematch
readiness. Killcam and shot panels are projections of resolved combat events,
not a second damage calculation.

Heavy cosmetic bursts are admitted through a bounded presentation queue so
several remote destructions cannot monopolize one render frame. Critical state
events apply immediately; smoke, debris, and other expensive effects can be
staged over subsequent frames without changing the outcome.

## Scene Studio and the 88-frame field archive

Scene Studio (`src/game/studio.js`) runs a live battlefield with combat AI
paused. It can place any current vehicle, conform it to terrain, pose turret and
gun within spec limits, apply camouflage/damage states, fire the game's real
effects, freeze deterministic time, and capture through the full renderer up
to the GPU's safe output size.

The landing page, public field manual, Gallery, and Studio use a reproducible
visual archive rather than hand-retouched art. It leads with 13 owner-selected
features, then preserves 30 action frames, 30 foreground-led frames, five
directed Studio keyframes, and ten deterministic game/interface captures. Six
contact sheets expose all 60 campaign frames in the collection-review pass. The
generated manifest records map, feature, actors, effects, provenance, grading,
and review-sheet membership for every public frame:

```bash
npm run shots:battle:generate
npm run shots:battle:grade -- --root shots/marketing-battles-r3
npm run studio:action:render
npm run showcase:publish
npm run showcase:check
```

## Verification

The repository keeps simulation checks in Node, transport/service checks in
Node and real browsers, render/capture checks in Chromium, and public/private
build checks in Vite.

```bash
npm test
npm run test:net:browser
npm run tank:native:check
npm run build
npm run build:private
```

For deeper contracts, continue with [FEATURES.md](FEATURES.md),
[SYSTEMS.md](SYSTEMS.md), [DEVELOPMENT.md](DEVELOPMENT.md),
[MULTIPLAYER-ARCHITECTURE.md](MULTIPLAYER-ARCHITECTURE.md),
[PERFORMANCE.md](PERFORMANCE.md), [STUDIO.md](STUDIO.md), and
[GUNNERY-CAMERA-SPEC.md](GUNNERY-CAMERA-SPEC.md). The original
[ARCHITECTURE.md](ARCHITECTURE.md) is retained as a historical implementation
contract rather than the current system map.
