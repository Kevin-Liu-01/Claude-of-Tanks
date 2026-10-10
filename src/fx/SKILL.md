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
Destruction presentation: `volumeMedia.ts` draws baked 3D smoke, fire and dust
(`tools/fx-volume-bake.mjs`; ledgered atlases, loaded at battle warm, desktop
tiers), `blastRecipes.ts` builds each munition x surface burst through it
(`surfaceLooks.ts`, `debrisChunks.ts`), `craterMarks.ts` keeps the ground's marks,
and `structureMask.ts` / `structureStages.ts` / `structureDebris.ts` lay a
building's stages into the world's own geometry through the core's seam
(docs/DESTRUCTION.md §16.4) on every tier.

## Patterns to follow / invariants
<!-- agent-docs:fill:patterns -->
Pool hot objects, bound lifetime/count, use event positions as presentation
inputs only, and respect pause/killcam/shot-mode time scaling.

## Common tasks → first action
<!-- agent-docs:fill:tasks -->
Trace the bus event, confirm the access owner is acquired before the consumer,
confirm pool teardown/reset paths, then test live battle, killcam, and rematch
behavior.

## Gotchas
<!-- agent-docs:fill:gotchas -->
Worlds and tank visuals are reused across matches; decals and emitters must not
survive reset. Network event IDs will be needed for deduplication.
The structure mask patches every props bucket material (its depth materials too)
at world activation: keep its only fragment discard the desktop hole cut (early
depth), and touch the seam's shadows on every frame the GPU moves a building.
