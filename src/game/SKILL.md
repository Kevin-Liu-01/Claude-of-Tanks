---
name: src-game-skill
description: Work on battle integration, bots, input, garage dressing, progression, replays, and studio state.
---

# claude-of-tanks / src/game

## Purpose
<!-- agent-docs:fill:purpose -->
Own game-level orchestration between pure simulation, presentation, input, bots,
and persisted player choices.

## Mental model & key files
<!-- agent-docs:fill:model -->
`stateCore.ts` owns the dependency-free typed session shell and event bus;
`rosterState.ts` owns typed roster entities, battle-visual construction policy,
and deterministic participant/camouflage planning; `rosterPresentation.ts`
owns consistent lobby and pre-battle display rows without importing rendering
or authority code; `soloBattleAccess.ts` owns
retryable lazy acquisition while `soloBattleRuntime.ts` is the typed import
boundary for legacy solo authority in `state.ts`, which owns battle setup and
the fixed battle step; `battleEntryAcquisition.ts` owns covered solo/network
dependency order and timing; `battleWarmRuntime.ts` owns battle-only terrain,
wreck, Studio/shared FX, and covered deployment-program residency behind a
retryable typed access facade; `ai.ts`
owns bot decisions and is injected into the headless multiplayer authority;
`input.ts` normalizes devices; `profile.ts` persists real local match history;
`playerBattleActions.ts` owns ammunition, consumable, special-action, and
local-versus-network command policy without importing the combat runtime;
`equipment.ts` owns the strict catalog, persistence, legal-loadout, multiplier,
combat-attachment, bot-default, and Garage-stat contract shared by both
authorities;
`playerFrameInput.ts` owns allocation-free per-frame movement, fire, mouse,
touch, cursor fallback, zoom, free-look, and sniper-mode sampling;
`pointerLockFeedbackRuntime.ts` owns pointer-lock denial/restoration listeners,
the delayed cursor-aim notice, canvas recapture, and battle-start touch refresh;
`mobileAutoAimRuntime.ts` owns touch target acquisition, loss, UI state and the
allocation-free center-mass sample consumed by the camera input;
`mobileBattleInputAccess.ts` keeps touch controls and that auto-aim owner out of
desktop boot, joins concurrent touch entry, retries failed chunks, and owns the
mobile sound toggle behind one typed access interface;
`battlePhasePolicy.ts` is the synchronous source of truth for live-battle,
settings, pointer-lock, disconnect-presentation, and Garage-idle predicates;
`battleRolloutRuntime.ts` owns countdown/audio release without moving the
covered reveal camera; `soloBattleEntryRuntime.ts` owns selected solo launch
and the paint-before-fade Garage recovery transaction for failed cold entry;
`sniperFillRuntime.ts` owns the retained shadow-free close-cover scope light;
`combatFeedbackRuntime.ts` owns discrete ERA, hit-confirm, camera-recoil,
prop-destruction, and Garage-residency reactions on the shared event bus;
`armorAimOverlay.ts` owns the typed, bounded scoped plate-penetration overlay;
`battleFrameRuntime.ts` owns pause edges, retained input sampling, network
cadence, pre-battle hold, fixed-step debt, result progression, and rendered
pose interpolation;
`battlePresentationRuntime.ts` owns solo/network pose selection, spotting
residency, running-gear detail cadence, vehicle FX, and light prop contact;
`battleHudFrameRuntime.ts` owns the retained HUD frame, spectator perspective,
spotting disclosure, aim publication, scoped armor targeting, and damage-panel
transaction;
`battleResultPresentationRuntime.ts` owns live player-death holds, result
replay handoff, final verdict presentation, and round/exit reset state;
`killcamAccess.ts` owns retryable replay acquisition and its stable inactive
facade; `killcam.ts` owns replay presentation, while `studio.ts` renders the
Scene Studio and `studioTimeline.ts` owns its strict JSON-safe storyboard and
allocation-free camera/actor sampling contract.
`garagePedestalRuntime.ts` owns hero construction, shader submission, warm LRU
residency, switch convergence, and battle visual handoff; it composes
`garagePedestalPreloader.ts` for exact card-intent and quiet neighbor warming.
`garageShowroomRuntime.ts` owns the Garage camera phase latch, pointer capture,
drag/wheel bindings, and disposal while the engine orbit remains the only pose
solver.
`garageReturnRuntime.ts` owns battle/Studio return teardown, retained-room
policy, world/hero handoff, coalesced leave transitions, and Battle Again
sequencing.
`garagePhasePresentationRuntime.ts` owns the authored Garage key lights,
neutral showroom sun, mutually exclusive scene membership, renewable dressing
GPU residency, world-root swaps, and terrain-relative stage placement. Camera
framing and pedestal pose math remain with their existing owners.
`garageEnvironmentPresentationRuntime.ts` owns the isolated Garage anchor,
battlefield dormancy, lifecycle effects, and diagnostics.
`garagePresentationPose.ts` is the only owner of hero heading, camera offset,
look height, and FOV; stage, pedestal, activation, and return paths must consume
it without variant-specific branches. `garageStage.ts` owns the restored exact
Verdant indoor workshop. `garageEnvironmentKit.ts` owns the other nine bounded
scene packs: generated real-terrain excerpts, camera-space connected structure
builders, static tree/ground-cover instances, a generated first-party wreck
proxy, Garage-sized PBR derivatives, the finite sky and three-layer terrain
horizon. `garageFacilityDetails.ts` flattens two-sided service bays, equipment,
first-party tank-part vocabulary, and low-poly service vehicles into those
packs; it must never import a playable fleet builder. Never add a world-loading
or per-frame update port to a Garage environment module. `garageDressingAccess.ts`
demand-loads one shared, optimized four-bay modern maintenance layer after
Garage readiness. Its Burlak, Abrams, T-90M, and K2 exhibits surround all ten
environments; Verdant alone may show wall-mounted interior clutter. Keep the
fleet load behind the quiet-window scheduler, reuse one graph across variants,
and never duplicate it per scene pack.
`battleIntentRuntime.ts` owns the explicit Battle hover/focus lifecycle:
concrete Random-map reservation, exact-roster texture coalescing, stale intent
cancellation, and the camouflage-safe handoff into covered loading. Passive
garage dwell never constructs a battlefield. `battleEntryLifecycle.ts` owns
entry exclusivity across every mode and the covered default-frame reveal gate.
`playSurfaceRuntime.ts` owns mode-specific menu acquisition, preload policy,
active-room reopening, solo bypass, and battle dismissal. Later-declared lazy
ports must stay behind closures so pristine boot never reads a temporal-dead-
zone binding while the composition root is still evaluating.
`soloBattleDeploymentRuntime.ts` owns the ordered solo deployment warm from
final camouflage through exact roster, terrain, FX, shader, CSM, post, and
reveal preparation; callers receive only generation and reveal receipts.
`soloBattleLoadingRuntime.ts` owns the complete covered solo entry around that
warm: exact world/roster acquisition, progress, texture upload, visual staging,
minimum loader dwell, reveal fallback, countdown calculation, and diagnostics.
`soloBattleStartRuntime.ts` owns the synchronous post-acquisition transaction
that resets round-scoped presentation, activates the world and roster, and
publishes the solo battle phase; `soloBattleStartAccess.ts` keeps it out of
Garage/multiplayer boot until covered solo intent.
The corresponding multiplayer lifecycle lives in
`src/net/networkBattlePresentationRuntime.ts`; `main.ts` supplies renderer and
world adapters but must not reimplement its preparation/readiness/reveal order.
Keep it behind `src/net/networkBattlePresentationAccess.ts` so Garage and solo
boot do not evaluate or allocate multiplayer-only presentation policy.

## Patterns to follow / invariants
<!-- agent-docs:fill:patterns -->
Keep authoritative rules deterministic and Node-runnable. Inject world, bus,
RNG, and presentation dependencies. Keep garage-safe session data in
`stateCore.ts`, visual/roster policy in `rosterState.ts`, and combat integration
in `state.ts`. Keep roster naming, filtering, and local-player ordering in
`rosterPresentation.ts`. Garage boot must not statically import `state.ts`; acquire it
through `soloBattleAccess.ts` on Battle or capture intent. Multiplayer work
must move visual creation out of authority rather than importing more UI into
`state.ts`.

## Common tasks → first action
<!-- agent-docs:fill:tasks -->
Trace callers in `src/main.ts`, run the nearest selftest, and preserve existing
event payloads. Keep garage/Studio-safe state in `stateCore.ts`; do not add
simulation or rendering imports there. Keep deterministic roster planning
independent from combat setup so battle intent can preload exact families.
Route Battle preload changes through `battleIntentRuntime.ts`; do not restore
independent map plans, texture generations, or garage timers in `main.ts`.
Route mode-picker and retained-room changes through `playSurfaceRuntime.ts`;
keep menu construction retryable and keep solo entry independent of the menu.
Acquire killcam implementation through `killcamAccess.ts`; do not restore its
promise state in the composition root. Route player shell, consumable, and
special-action policy through `playerBattleActions.ts`; inject combat and
network ports instead of importing either implementation. Route rendered
device polling through `playerFrameInput.ts`; keep the render loop ignorant of
bindings and device modes. Route rendered tank updates through
`battlePresentationRuntime.ts`; never apply the solo interpolation buffer to
already-smoothed network poses. Bot changes require both focused AI tests and
battle probes.
Route mobile battle UI acquisition through `mobileBattleInputAccess.ts`; do not
restore touch/auto-aim promise state or sound-toggle state in `main.ts`.
Route phase-sensitive browser predicates through `battlePhasePolicy.ts`; do not
restate live-battle semantics independently in settings, networking, or input.
Keep solo launch selection and failed-entry recovery in
`soloBattleEntryRuntime.ts`; never fade the loader before a restored Garage
frame has painted.
Route live HUD assembly through `battleHudFrameRuntime.ts`; do not rebuild
spectator focus, spotting, aim, armor-target filtering, or damage presentation
inside `main.ts`.
Route rendered gameplay advancement through `battleFrameRuntime.ts`; do not
retain pause transitions, fixed-step debt, countdown release, or parallel
solo/network authority policy in `main.ts`.
Route every battle/Studio return through `garageReturnRuntime.ts`; do not
recreate replay/tank/network/world teardown order or a leave-transition latch
in `main.ts`.
Route Garage environment selection through
`garageEnvironmentPresentationRuntime.ts`; do not load or activate battle
worlds, retain environment state, or add camera offsets in `main.ts`.
Route covered solo warm changes through `soloBattleDeploymentRuntime.ts`; do
not put shader, effect, shadow, or reveal ordering back into `main.ts`.
Route covered solo entry changes through `soloBattleLoadingRuntime.ts`; do not
recreate its acquisition barrier, progress policy, or reveal handoff in the
composition root.
Route post-acquisition solo round reset and phase activation through
`soloBattleStartRuntime.ts`; preload its access owner before the synchronous
handoff and do not rebuild that transaction in `main.ts`.
Route cold network entry changes through `networkBattlePresentationRuntime.ts`;
keep partial bridges private until roster preparation and initial authority
succeed.
Route result, death-beat, and replay-handoff changes through
`battleResultPresentationRuntime.ts`; keep those latches out of `tick()`.
Garage scene-pack changes must pass the architecture, terrain- and wreck-generation,
transition, persisted-outdoor-entry, and phase-resource gates. Preserve the
two-pack cache, reject stale switch completions, perform shader and texture
warming only after interactive readiness, and keep all environment identity out
of the canonical pose. Static pack scenery receives the settled Garage shadow
but never joins live CSM caster updates. Keep the stable shadowless hero bounce;
do not add small-prop shadow casters or variant-specific Garage lights.

## Gotchas
<!-- agent-docs:fill:gotchas -->
`state.ts` still mixes solo battle orchestration with some visual lifecycle
calls; deepen that seam incrementally through `rosterState.ts` without pulling
the solo graph back into garage boot. Entity IDs historically equal spec IDs
and must not remain so in multiplayer.
