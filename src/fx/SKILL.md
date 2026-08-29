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
`effects.js` composes event reactions, `particles.js` owns pools, `clock.ts`
owns presentation time, `effectAttachments.ts` owns continuous emitter anchor
contracts, and `impactDecals.ts` owns bounded surface marks.

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
