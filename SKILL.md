---
name: claude-of-tanks-skill
description: Build and verify Claude of Tanks without crossing simulation, rendering, fleet-generation, or shared-worktree ownership boundaries.
---

# claude-of-tanks — working here

## Purpose
<!-- agent-docs:fill:purpose -->
Ship the browser game while preserving deterministic combat, first-party tank
fidelity, smooth low-end performance, and reproducible visual/test evidence.

## Mental model & key files
<!-- agent-docs:fill:model -->
`src/main.ts` is the shrinking composition root; extracted lifecycle owners
are strict TypeScript modules documented in `docs/SYSTEMS.md` and the ADRs.
`src/game/state.ts` owns solo integration, `src/sim/` owns gameplay
truth, `src/net/` owns transport-independent multiplayer, and `tools/` contains
performance, fleet, screenshot, and release gates. Start with `docs/SYSTEMS.md`
and the nearest directory `SKILL.md`.

## Patterns to follow / invariants
<!-- agent-docs:fill:patterns -->
- Work from the current remote safe boundary in an isolated worktree when the
  shared checkout is dirty or another tank-generation task is active.
- Preserve fixed-step semantics and seeded randomness.
- Keep rendering/presentation out of headless simulation and network modules.
- Make optional/high-cost features dynamically reachable, not boot-critical.
- Verify focused behavior first, then `npm test` and the public build.

## Common tasks → first action
<!-- agent-docs:fill:tasks -->
- Runtime flow: trace `src/main.ts` plus `src/game/state.ts` exports.
- Physics/combat: read `src/sim/SKILL.md`, then its existing selftests.
- UI: read `src/ui/SKILL.md` and inspect the rendered browser surface.
- Multiplayer: read `docs/MULTIPLAYER-ARCHITECTURE.md` and `src/net/SKILL.md`.
- Tank fidelity/assets: read `src/vehicles/SKILL.md` and current program state.
- Performance: capture a baseline with the committed probes before editing.

## Gotchas
<!-- agent-docs:fill:gotchas -->
The root checkout is frequently mixed dirty and may lag hundreds of tank
commits. Do not pull, reset, clean, or blanket-stage it. Public builds strip
quarantined assets; both a green build and runtime provenance checks matter.
