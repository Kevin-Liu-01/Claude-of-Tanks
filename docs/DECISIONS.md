# Architecture decisions

This file records the small set of decisions that still constrain the current
game. It replaces the former directory of per-file migration receipts. Those
receipts described completed work, not alternative designs; Git history keeps
them available without making contributors read hundreds of obsolete steps.

Current behavior is defined by `SYSTEMS.md`, `MULTIPLAYER-ARCHITECTURE.md`,
`PERFORMANCE.md`, `GAME-MODES.md`, and the source code. Add an entry here only
when future work must preserve a non-obvious choice or deliberately reverse it.

## Product scope

Claude of Tanks is a first-party browser armored-combat game, not a loader for
third-party playable models. Every playable vehicle is procedural runtime
geometry owned by this repository. Comparison meshes may support authoring and
review, but public builds and gameplay do not load them.

Multicrew is not a planned mode. One player owns one vehicle input seat. New
multiplayer work should improve rooms, teams, objective modes, persistence,
prediction, authority, and reliability without introducing multiple player
roles inside one tank.

## Checked application graph

The shipped application, server, API, middleware, Vite configuration, and
browser tooling are strict TypeScript. `allowJs` is disabled. `.mjs` is retained
only for Node command, generator, and self-test entrypoints around checked
owners. New runtime JavaScript, type suppressions, and unchecked compatibility
facades are not acceptable substitutes for defining a real interface.

The composition root declares construction order and connects capabilities. A
phase-owned state machine belongs in a focused module with a narrow port and a
Node-runnable self-test. Renderer-free simulation and network authority must
not import browser or Three.js presentation state.

Lazy modules derive their integration types from the loaded owner rather than
duplicating broad compatibility interfaces. The two phase-narrowing bridges
that remain for killcam and deterministic capture validate their callable
surface at runtime before handing staged live entities to the owner. Generic,
unchecked `legacyPort` casts are prohibited.

## Fixed-step authority

Movement, ballistics, armor, damage, ERA, spotting, bots, match modes, and
results advance on a deterministic 60 Hz authority clock. Rendering is
variable-rate presentation. Randomness is seeded or injected, and clients never
decide hits, damage, reload completion, hidden-enemy disclosure, or match
results.

Solo, browser-hosted private/LAN rooms, and dedicated matches share the same
headless combat rules. Player identity is separate from vehicle identity, so
duplicate tank selections remain valid.

## Loading and resource ownership

Garage readiness does not require a battlefield, solo-authority graph, combat
effects graph, complete fleet, or multiplayer presentation graph. Battle intent
may transfer exact dependencies, but construction of heavy visible resources
belongs behind the covered loading transition.

Visible work yields within a small frame budget. Work under an opaque loader
uses cooperative task yields and guarantees periodic real paints. Slow progress
is not treated as failure; failed imports and graphics-context loss remain
retryable without a refresh loop. Public first-visit performance is measured in
multiple cache-disabled sessions under constrained network and CPU conditions.
Optional workers are accelerators, never lifecycle dependencies. Each worker
task has a bounded deadline and an equivalent local fallback, so a browser that
neither starts the worker nor reports an error cannot strand boot or battle
entry. The cloud-texture worker currently yields to the exact synchronous bake
after three seconds measured from worker creation.

Fleet acquisition is exact-family demand loading. Regional bundle modules and
playable GLB fallbacks are retired. Inactive Garage, world, battle, Studio, and
combat-effects resources have explicit residency limits and phase-scoped
disposal. The reusable FX pool detaches and releases renewable GPU allocations
outside Battle or Studio, then restores behind the next covered warm.
Desktop boot does not transfer touch-control or mobile-auto-aim chunks. One
retryable mobile input access owner joins both dependencies only after a touch
battle entry and retains the active lock and sound-toggle state outside the
composition root.
Settings, pointer recapture, disconnect presentation, and Garage frame pacing
read one synchronous battle-phase policy so a result, dead player, killcam, or
covered loader cannot acquire subtly different meanings across browser owners.
Solo rollout never adjusts the reveal camera. A separate typed entry owner
selects the requested vehicle/map and, on any cold-load failure, restores and
paints Garage state behind opaque coverage before fading the loader.
Engineering drive controls sit behind an inert typed facade. Ordinary players
transfer no drive-test implementation; development, automation, and explicit
debug intent join one retryable import while earlier callbacks remain stable.

## World and Garage lifecycle

`worldBuildCoordinator.ts` owns transfer, chunked construction, cancellation,
cache limits, and eviction. `worldActivationRuntime.ts` exclusively owns the
active world, atmosphere, collider/minimap readiness, covered GPU warming, and
dormancy. Callers use that interface instead of retaining parallel map state.

The Garage and battlefield have exclusive scene residency. The Garage sleeps
its frame clock after presentation settles and invalidates it only on actual
activity. Verdant retains the authored workshop. Every other Garage destination
mounts its complete cached battlefield and seats the presentation at a measured
open point with at least 24 m of real obstacle clearance; it must not create a
parallel proxy terrain, skyline, landmark, wall, roof, or light rig.
`garageBattlefieldPresentationRuntime.ts` owns that activation transaction,
including stale-load cancellation, placement state, camera framing, and failure
diagnostics. The composition root supplies concrete ports but does not retain a
second Garage/world state machine.
`garageWorkshopDiagnostics.ts` owns the stable engineering surface for Garage
variant probes. It exposes immutable snapshots and explicit build/select
commands; `main.ts` does not assemble workshop receipts from scene internals.
Return-to-Garage is not complete until renewable GPU resources and the final
Garage camera/sun cascade maps have both been rendered offscreen. The return
transaction then freezes those exact depth maps before its first visible color
frame; an idle watchdog must never become the first consumer of pending CSM
work.

## Rendering and shadows

Quality changes presentation cost, never game rules. Static geometry may be
batched or instanced only when appearance, ownership, transforms, and disposal
remain equivalent. Visible vehicle silhouette and authored detail are preserved;
triangle reduction is acceptable only when visual comparison proves parity.
The production renderer remains Three.js WebGL. WebGPU/TSL, whole-renderer
workers, BVH acceleration, and new batching layers require an isolated measured
win before adoption; none is a default cure for unrelated CPU, shader, or
readback costs. Deterministic static textures are baked offline when practical,
while unavoidable runtime pixel work uses bounded workers with local fallback.

Cascaded shadow projection and its depth map are updated atomically. Ordinary
frames alternate mutually exclusive near and far two-map cohorts; the far pair
shares one camera and vegetation-LOD timestamp, and every snapped light pose
moves only with the depth map that owns it. No ordinary frame submits all four
cascades. CSM fade therefore never blends the far maps from different states,
and modest GPUs avoid a periodic doubled shadow pass. Bias scales with physical
texel size. Temporal ambient occlusion rejects disoccluded depth history so
trees, structures, and overlapping geometry cannot flash stale darkness.

## Aiming and vehicle presentation

The screen aim request, camera reticle, turret solution, and physical gun bore
share one typed controller. Traverse, elevation, and depression limits constrain
the solution; multiplayer presentation consumes the same requested aim as solo
instead of inventing a second camera-relative target.

Turret, gun, recoil, wheels, track links, suspension, modules, crew, armor, and
ERA have explicit articulation owners. Track geometry conforms to terrain while
authority preserves rigid-body airborne motion, rollover, stacking, and contact.
ERA is consumed once by authority and its matching tile presents a destructive
activation effect.

## Multiplayer connectivity and persistence

Private internet rooms use same-origin durable signaling plus direct ICE with
TURN fallback. STUN-only operation is degraded service, not proof that arbitrary
friends can connect. TURN credentials are short-lived and issued from server
secrets; long-lived relay credentials never ship to browsers. LAN rooms avoid
internet ICE services.

Room membership survives transient transport loss and page reload. A stable
player ID reclaims its seat through a new page-session and RTC generation;
rooms retain their lobby through results and rematches. Reload during a live
round restores the same protocol epoch when authority already welcomed the new
transport.

A cold guest acquires its ICE/TURN configuration before its signaling join
announces membership to the host. WebSocket connection and ICE discovery may
overlap, but the host cannot start sending SDP and candidates until the guest
can immediately construct its peer session. Room creation remains parallel
because a new room code is undiscoverable until creation returns.

Signaling delivery is replayable, duplicate SDP is idempotent, data lanes and
ICE generations are replaceable, and recovery is bounded. Snapshot clocks slew
toward new offset estimates instead of jumping. Local prediction replays shared
movement rules and applies bounded role-aware correction; remote presentation
interpolates without revealing hidden state.

## Public repository evidence

Tracked tests are release contracts and must be registered in the ordered test
inventory. Generated audits, traces, screenshots, task notes, and agent handoffs
belong in ignored QA directories or external artifacts. Repository-level and
subsystem skill documents are retained only when indexed and when they define a
real ownership boundary.

Maintain one current document per subject. Raw benchmark runs and completed
migration narration belong in Git history; current docs state the invariant,
the reproduction command, and the evidence required to change it.

## Required proof

Every architectural change runs the nearest focused self-test, strict
typechecking, the ordered test suite, and the relevant public/private build.
Rendering work also needs current browser evidence and resource/performance
gates. Multiplayer claims require pristine browser contexts, impaired delivery,
disconnect/reload recovery, a complete match, and production TURN verification
when restrictive-NAT connectivity is claimed.
