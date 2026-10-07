---
name: src-fx-skill
description: Work on pooled particles, impacts, destruction effects, decals, and shared FX time.
---

# claude-of-tanks / src/fx

## Purpose
<!-- agent-docs:fill:purpose -->
Render combat feedback from authoritative events without modifying simulation.

## Mental model & key files
<!-- agent-docs:fill:model -->
`fxRuntimeAccess.ts` owns retryable battle-only module/runtime acquisition,
`effects.ts` composes event reactions, `particles.ts` owns typed pools, `clock.ts`
owns presentation time, `effectAttachments.ts` owns continuous emitter anchor
contracts, and `impactDecals.ts` owns bounded surface marks. Scene Studio's
cinematic layer (`cinematicFx.ts` runtime, `cinematicRecipes.ts` recipes) is
Studio-only: it reaches the battle runtime through `effects.cinematicPort()`,
which battle never calls, and its emitters tick on absolute timeline grids so
renders are step-size independent (`cinematicFx.selftest.mjs`).

## Patterns to follow / invariants
<!-- agent-docs:fill:patterns -->
Pool hot objects, bound lifetime/count, use event positions as presentation
inputs only, and respect pause/killcam/shot-mode time scaling.

## Common tasks → first action
<!-- agent-docs:fill:tasks -->
Trace the bus event, confirm the access owner is acquired before the consumer,
confirm pool teardown/reset paths, then test live battle, killcam, and rematch
behavior.

Impact, muzzle-blast, kill and wreck-column media live in `combat/` (lit,
wind-borne, deforming puffs, clods and craters) that `effects.ts` delegates to:
change a recipe there and keep `combat/combatFx.selftest.mjs` green
(docs/ARCHITECTURE.md §3.8.3).

## Gotchas
<!-- agent-docs:fill:gotchas -->
Worlds and tank visuals are reused across matches; decals and emitters must not
survive reset. Network event IDs will be needed for deduplication.
