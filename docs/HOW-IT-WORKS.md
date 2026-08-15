# How Claude of Tanks works

This is the current technical tour of the shipped game. It describes the live
runtime, not the historical tank-rebuild program or quarantined reference
assets. The short version: a Vite application runs an original Three.js render
stack around a deterministic 60 Hz armored-combat simulation, and multiplayer
moves that same authority across WebRTC or WebSocket without moving gameplay
decisions into the renderer.

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
arrive first. Combat shaders, additional tank families, wreck treatments, map
chunks, and optional diagnostics are prepared in post-ready idle slices. The
garage and battle transitions remain painted while asynchronous work proceeds,
so low-end hardware sees progress instead of a blocked black canvas.

The quality system combines capability checks with a boot-time render probe.
Resolution, shadows, post effects, texture sizes, vegetation density, and
background work scale independently. A WebGL target watchdog can disable a
failing feature and restore output without changing combat behavior.

## First-party vehicle pipeline

The selectable roster currently contains **80 original first-party vehicles**.
Playable geometry is assembled at runtime from authored profile stations,
armor forms, fittings, and procedural running gear in
`src/vehicles/tankFactory.js` and `src/vehicles/profiles/`. The public runtime
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

Eight authored battlefields are generated from code: Verdant Fields, Sirocco
Wadi, Frosthollow, Steinburg, Saltmere Bay, Amberford, Tarkhan Steppe, and
Cinder Junction. Each owns a height field, material palette, roads, foliage,
buildings, collision, concealment, destructibles, lighting, sky, and minimap.
The browser and dedicated server share generated collision manifests so an
obstacle is not passable on one authority and solid on another.

The render side is plain Three.js: WebGL renderer, procedural sky and PMREM,
cascaded shadows, atmospheric fog, post-processing, particles, decals, and
audio. It never decides whether a shell penetrated or a tank was spotted. It
renders facts emitted by the authority.

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
clients do not receive coordinates and then pretend not to know them.

## Bots

Bots use the same controls, movement limits, spotting, ammunition, armor, and
damage paths as players. Their seeded openings vary by match, traversability
planning reads the battlefield, local steering negotiates traffic/obstacles,
and recovery logic backs out of stalls and replans. The seed keeps test runs
reproducible without making every public battle follow one memorized route.

## Multiplayer transport and prediction

Protocol v3 carries validated envelopes with sequence, acknowledgement, and
simulation ticks. A client submits throttle, steering, brake, shell choice,
fire, explicit consumable action bits, and a bounded yaw/pitch/distance aim
intent. Keeping distance preserves the same finite center-screen world point
used by solo play; the former infinite-ray approximation changed close-range
gun parallax and could lay multiplayer barrels high. The authority still owns
traverse, elevation/depression, muzzle position, dispersion, hits, damage,
spotting, and victory.

LAN/private WebRTC splits traffic:

- reliable ordered control: handshake, lobby/room state, inputs, combat
  events, ping, errors, and leave;
- unordered zero-retransmit state: replaceable 20 Hz snapshots.

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

Protocol-v3 `ROOM_COMMAND` and `ROOM_STATE` messages carry the room's round,
last result, roster, team, vehicle, equipment, map, and ready state on the
reliable channel. After a result the same peers remain connected, the room
returns to waiting, readiness resets, and the next round replaces only the
simulation authority—not the WebRTC transport. The report shows live
play-again intent. Closing it returns to the garage without leaving; a compact
room strip stays under Battle. Readiness locks vehicle/equipment/team changes
until the player unreadies. Explicit Leave disconnects from the room.

Invite URLs carry the validated six-character room code. On the same deployed
origin, opening the link loads the game and joins after the normal boot gate.
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

## Scene Studio and the 30-image modern set

Scene Studio (`src/game/studio.js`) runs a live battlefield with combat AI
paused. It can place any current vehicle, conform it to terrain, pose turret and
gun within spec limits, apply camouflage/damage states, fire the game's real
effects, freeze deterministic time, and capture through the full renderer up
to the GPU's safe output size.

The landing-page fleet reel is modern-only and reproducible source, not
hand-retouched art. Its 30 checked-in scenes deliberately span broad turret
search arcs and vehicle-authored gun elevation/depression instead of repeating
one catalog pose. The generated manifest records the requested turret angle,
gun angle, pose name, map, nation, and vehicle for every public frame:

```bash
node tools/marketing-shots/gen-modern-showcase.mjs
node tools/marketing-shots/shoot.mjs \
  --scenes tools/marketing-shots/scenes-modern \
  --out shots/marketing-modern/raw --width 1600
node tools/marketing-shots/encode-modern-showcase.mjs
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
