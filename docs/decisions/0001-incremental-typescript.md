# ADR 0001: Incremental strict TypeScript migration

- Status: accepted
- Date: 2026-08-25

## Context

The game grew as browser-native ES modules. Strong runtime tests protect many
behaviors, but large integration files and implicit object shapes make changes
harder for human and automated contributors to review. Converting the entire
runtime in one operation would combine type discovery, module movement, and
behavior changes into an unsafe diff.

## Decision

Migrate by stable subsystem boundary:

1. Extract one coherent owner from legacy JavaScript.
2. Express its public contract with strict TypeScript types.
3. Keep JavaScript interoperability enabled while migrated modules are sparse.
4. Add a focused behavioral self-test and run `npm run typecheck`.
5. Preserve runtime behavior before expanding the boundary.

New standalone infrastructure modules should be TypeScript. Large visual,
simulation, and vehicle files migrate only when their ownership boundary and
tests are already clear. The first migrated module is
`src/engine/frameScheduler.ts`. The next boundary, `src/game/stateCore.ts`,
owns the dependency-free session container, deterministic RNG, and synchronous
event bus used by garage, Studio, and the legacy solo battle runtime.
The next boundary, `src/game/rosterState.ts`, owns roster entities, lazy battle
visual construction policy, and deterministic participant/camouflage planning.
It deliberately excludes combat initialization so garage boot and battle-intent
preloading can depend on the roster without importing the solo simulation graph.
`src/game/soloBattleRuntime.ts` is the corresponding typed lazy boundary for
that graph: the composition root acquires legacy `state.js` only after solo
Battle or deterministic capture intent, while existing authority functions
remain behaviorally unchanged.
`src/game/soloBattleAccess.ts` owns the retryable dynamic-import lifecycle and
stable delegation surface so `src/main.js` no longer carries loader state.
`src/net/webrtcPeer.ts` is the first transport owner migrated in place. Its
public signal/session contract is explicit, while lobby and match runtimes
continue to consume the same transport seam.
`src/net/predictionCorrection.ts` and `src/net/localTankPrediction.ts` own the
typed local-control boundary: wire input, authority snapshots, shared movement
replay, collision callbacks, presentation correction, and telemetry now have
explicit contracts without moving combat authority into the browser client.
The browser integration sequence now continues through
`src/engine/bootLifecycle.ts`, `src/game/battleModuleAccess.ts`,
`src/net/connectionRecovery.ts`, `src/net/networkFramePump.ts`, and
`src/net/networkRoomCoordinator.ts`. Together they remove stage bookkeeping,
retryable battle imports, reconnect presentation, per-frame match order, and
persistent-room state from the legacy composition root without changing the
renderer or authority contracts.
`src/game/battleEntryAcquisition.ts` continues that sequence by owning the
covered solo/network dependency graph, task timings, browser-host world
dependency, and synchronous cached-rematch handling.
`src/game/garagePedestalRuntime.ts` owns the garage hero's async construction,
shader submission, warm visual LRU, switch convergence, and battle handoff.
The composition root now selects a specification through that typed boundary
instead of carrying the lifecycle state machine itself.
`src/game/soloBattleLoadingRuntime.ts` owns the complete covered solo loading
transition: exact roster/world acquisition, battle-only interface and FX
preparation, visual upload, deployment warm, reveal fallback, countdown, and
timing receipts. The composition root supplies ports instead of retaining that
order-sensitive policy inline.
`src/net/networkBattlePresentationRuntime.ts` owns the corresponding private,
LAN, and dedicated presentation transition. It keeps partial bridges private,
orders first authority and all-peer readiness, and exposes one `present()`
operation while the composition root supplies concrete renderer and transport
adapters.
`src/net/networkBattlePresentationAccess.ts` keeps that deep owner out of
Garage and solo startup until network-mode intent, while retaining retryable
chunk acquisition after a transient first-visit failure.
`src/game/soloBattleStartRuntime.ts` owns the synchronous transaction from an
acquired solo world and roster to a live round, while
`src/game/soloBattleStartAccess.ts` keeps that policy out of ordinary Garage
and multiplayer boot until covered solo entry requests it.
`src/world/worldActivationRuntime.ts` owns active-world selection, atmosphere,
collider/minimap readiness, covered GPU warming, dormancy, and activation
telemetry. The existing build coordinator remains a deeper construction/cache
module; `main.js` now consumes one world-lifecycle interface instead of
retaining parallel world, service, sky, and dormancy state.
`src/game/playSurfaceRuntime.ts` owns the next Garage operation surface:
retryable menu construction, solo bypass, active-room precedence, exact
mode-intent preloads, and non-destructive battle dismissal. This removes the
remaining picker promise and pending-solo state from `main.js`.
`src/game/battleHudFrameRuntime.ts` owns the live HUD transaction: spectator
perspective, spotting disclosure, aim publication, scoped plate-inspection
targets, and damage presentation now leave `tick()` together behind one
retained strict-TypeScript frame interface.
`src/game/battleFrameRuntime.ts` owns pause transitions, retained input
sampling, network cadence, countdown release, bounded fixed-step debt, result
progression, and interpolation. `main.js` retains render composition but no
longer owns gameplay-advance state.
`src/game/garageReturnRuntime.ts` owns the inverse phase transition: replay and
tank cleanup, persistent-room preservation, warm cancellation, world dormancy,
hero adoption, Garage exposure, coalesced leave transitions, and bounded
Battle Again sequencing. `main.js` supplies adapters but retains no return
transaction or transition latch.
The UI migration then converts the existing responsive-layout, shared
responsive stylesheet, boot-screen, battle-loading, and state-transition
modules in place. Their public DOM and lifecycle contracts are now strict
TypeScript while their rendered markup, CSS, timing, and loading behavior stay
unchanged.
Mobile battle input and the demand-loaded camouflage-card painter now follow
the same rule: browser gestures, Canvas2D inputs, fleet specs, and custom-stroke
recipes are checked without moving either module into pristine Garage boot.
Fleet geometry gates follow it too: turret-barrel section measurement now has
typed mesh, lane, contour, receipt, and result boundaries.
Generated combat-anatomy receipts now share that strict graph: the eager
fleet aggregate, 27 demand-loaded family payloads, and loader table are emitted
as TypeScript while the runtime registry remains the narrowing boundary.
Exact vehicle-marking seat receipts use the same pattern: generated TypeScript
payloads retain family-local chunking, and the authored registry validates the
schema before any seat reaches the painter.
Rendered-pixel presentation anchors and orthographic fit envelopes are also
generated as strict TypeScript, keeping Garage framing and combat hit diagrams
on one nullable lookup contract.
The final boot-safe metadata receipts for legacy builder/spec hybrids now emit
strict TypeScript and bind through the shared fleet registry without pulling
their Three.js builders into Garage startup.
`src/app/mainFrameRuntime.ts` now owns the retained rendered-frame transaction
and its time, FOV, cinematic, and Garage-pacing latches. The composition root
supplies live ports and starts the scheduler without reimplementing render
order or allocating a Garage request on every frame.
Ballistic surface marks now use the strict `src/fx/impactDecals.ts` owner. Its
seeded atlas, articulation-local skin clamp, bounded node batches, vehicle ring,
and reset lifecycle retain the exact established presentation behavior.
Deterministic engineering captures now use the strict
`src/dev/shotViews.ts` recipe owner. The 34-view table retains the established
camera, HUD, vehicle, FX, and replay staging while explicit dependency ports
preserve its demand-loaded separation from ordinary player boot.
The first authored family pack migrated in place is
`src/vehicles/profiles/japan.ts`. Its explicit procedural-builder port covers
the STB-1, Type 90A, and Type 10B geometry deltas while the typed fleet loader
retains exact-family demand acquisition.
`src/vehicles/profiles/sweden.ts` follows the same boundary for UDES 03, Strv
103A/B, Strv 81, and Strv 122, including fixed-gun, hydropneumatic, running
gear, and fitted-equipment contracts.
The standalone `src/vehicles/france.ts` AMX-40 builder is also strict. Its
builder port covers geometry buckets, running-gear layers, fitted equipment,
decals, receipts, and nonuniform transforms while retaining one-vehicle demand
loading.

## Consequences

- Type coverage grows monotonically without blocking gameplay work.
- `src/main.ts` shrinks through tested extractions rather than a rename-only
  conversion.
- Mixed `.js` and `.ts` imports are expected during the migration.
- Source imports may use explicit `.ts` extensions; `allowImportingTsExtensions`
  is enabled because Vite and the Node self-tests both consume source modules
  directly and the project does not emit JavaScript through TypeScript.
- A migration commit must not also redesign visuals or gameplay.
- The terminal target is zero runtime JavaScript. Incremental commits describe
  how that target is reached safely; they do not make mixed-language runtime
  ownership a permanent architecture.

## Verification

    npm run typecheck
    node src/engine/frameScheduler.selftest.mjs
    node src/game/rosterPlanning.selftest.mjs
    node src/game/soloBattleRuntime.selftest.mjs
    node src/game/soloBattleAccess.selftest.mjs
    node src/net/localTankPrediction.selftest.mjs
    node src/net/networkFramePump.selftest.mjs
    node src/net/networkRoomCoordinator.selftest.mjs
    node src/net/net.selftest.mjs
    npm test
    npm run build
