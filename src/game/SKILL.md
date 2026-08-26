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
`state.js` composes legacy solo entities and the fixed battle step; `ai.js` owns
bot decisions and is injected into the headless multiplayer authority;
`input.js` normalizes devices; `profile.js` persists real local match history;
`killcam.js` and `studio.js` own separate presentation timelines.

## Patterns to follow / invariants
<!-- agent-docs:fill:patterns -->
Keep authoritative rules deterministic and Node-runnable. Inject world, bus,
RNG, and presentation dependencies. Multiplayer work must move visual creation
out of authority rather than importing more UI into `state.js`.

## Common tasks → first action
<!-- agent-docs:fill:tasks -->
Trace callers in `src/main.js`, run the nearest selftest, and preserve existing
event payloads. Keep garage/Studio-safe state in `stateCore.ts`; do not add
simulation or rendering imports there. Bot changes require both focused AI
tests and battle probes.

## Gotchas
<!-- agent-docs:fill:gotchas -->
`state.js` currently mixes headless and visual responsibilities; deepen the
simulation seam incrementally. Entity IDs historically equal spec IDs and must
not remain so in multiplayer.
