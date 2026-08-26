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
the fixed battle step; `ai.js` owns bot decisions and is
injected into the headless multiplayer authority;
`input.js` normalizes devices; `profile.js` persists real local match history;
`killcam.js` and `studio.js` own separate presentation timelines.

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
Bot changes require both focused AI tests and battle probes.

## Gotchas
<!-- agent-docs:fill:gotchas -->
`state.js` still mixes solo battle orchestration with some visual lifecycle
calls; deepen that seam incrementally through `rosterState.ts` without pulling
the solo graph back into garage boot. Entity IDs historically equal spec IDs
and must not remain so in multiplayer.
