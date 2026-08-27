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
and deterministic participant/camouflage planning; `soloBattleAccess.ts` owns
retryable lazy acquisition while `soloBattleRuntime.ts` is the typed import
boundary for legacy solo authority in `state.js`, which owns battle setup and
the fixed battle step; `battleEntryAcquisition.ts` owns covered solo/network
dependency order and timing; `battleWarmRuntime.ts` owns battle-only terrain,
wreck, Studio/shared FX, and covered deployment-program residency behind a
retryable typed access facade; `ai.js`
owns bot decisions and is injected into the headless multiplayer authority;
`input.js` normalizes devices; `profile.js` persists real local match history;
`playerBattleActions.ts` owns ammunition, consumable, special-action, and
local-versus-network command policy without importing the combat runtime;
`playerFrameInput.ts` owns allocation-free per-frame movement, fire, mouse,
touch, cursor fallback, zoom, free-look, and sniper-mode sampling;
`battlePresentationRuntime.ts` owns solo/network pose selection, spotting
residency, running-gear detail cadence, vehicle FX, and light prop contact;
`killcamAccess.ts` owns retryable replay acquisition and its stable inactive
facade; `killcam.js` and `studio.js` own separate presentation timelines.
`garagePedestalRuntime.ts` owns hero construction, shader submission, warm LRU
residency, switch convergence, and battle visual handoff; it composes
`garagePedestalPreloader.ts` for exact card-intent and quiet neighbor warming.
`battleIntentRuntime.ts` owns the explicit Battle hover/focus lifecycle:
concrete Random-map reservation, exact-roster texture coalescing, stale intent
cancellation, and the camouflage-safe handoff into covered loading. Passive
garage dwell never constructs a battlefield. `battleEntryLifecycle.ts` owns
entry exclusivity across every mode and the covered default-frame reveal gate.

## Patterns to follow / invariants
<!-- agent-docs:fill:patterns -->
Keep authoritative rules deterministic and Node-runnable. Inject world, bus,
RNG, and presentation dependencies. Keep garage-safe session data in
`stateCore.ts`, visual/roster policy in `rosterState.ts`, and combat integration
in `state.js`. Garage boot must not statically import `state.js`; acquire it
through `soloBattleAccess.ts` on Battle or capture intent. Multiplayer work
must move visual creation out of authority rather than importing more UI into
`state.js`.

## Common tasks → first action
<!-- agent-docs:fill:tasks -->
Trace callers in `src/main.js`, run the nearest selftest, and preserve existing
event payloads. Keep garage/Studio-safe state in `stateCore.ts`; do not add
simulation or rendering imports there. Keep deterministic roster planning
independent from combat setup so battle intent can preload exact families.
Route Battle preload changes through `battleIntentRuntime.ts`; do not restore
independent map plans, texture generations, or garage timers in `main.js`.
Acquire killcam implementation through `killcamAccess.ts`; do not restore its
promise state in the composition root. Route player shell, consumable, and
special-action policy through `playerBattleActions.ts`; inject combat and
network ports instead of importing either implementation. Route rendered
device polling through `playerFrameInput.ts`; keep the render loop ignorant of
bindings and device modes. Route rendered tank updates through
`battlePresentationRuntime.ts`; never apply the solo interpolation buffer to
already-smoothed network poses. Bot changes require both focused AI tests and
battle probes.

## Gotchas
<!-- agent-docs:fill:gotchas -->
`state.js` still mixes solo battle orchestration with some visual lifecycle
calls; deepen that seam incrementally through `rosterState.ts` without pulling
the solo graph back into garage boot. Entity IDs historically equal spec IDs
and must not remain so in multiplayer.
