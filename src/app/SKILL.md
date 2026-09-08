---
name: src-app-skill
description: Maintain typed application composition, lazy owner access, frame wiring, and combat warm lifecycle.
---

# claude-of-tanks / src/app

## Purpose
<!-- agent-docs:fill:purpose -->
Extract application-level wiring from `src/main.ts` without moving subsystem
policy into a second owner. Dependencies arrive through explicit typed ports.

## Mental model & key files
<!-- agent-docs:fill:model -->
`mainContracts.ts` adapts existing subsystem types for composition.
`mainFrameRuntime.ts` owns the rendered-frame transaction;
`mainBattleHudRuntime.ts` coordinates lazy HUD acquisition and visibility.
`combatAimComposition.ts` connects camera, reticle, physical aim, and spotting.
`combatWarmComposition.ts` owns renderer-lifetime warm caches and cancellation.
`lazyRuntimeOwner.ts` and `checkedIntegrationPort.ts` guard lazy integration.

## Patterns to follow / invariants
<!-- agent-docs:fill:patterns -->

- Preserve frame ordering, phase gates, and live getter semantics. Do not
  retain a stale world/player instead of consulting the supplied owner.
- Retain scratch objects across frames; avoid per-frame object allocation.
- Keep optional implementations demand-loaded. Concurrent preloads share
  one request; failed lazy construction remains retryable.
- Derive adapter types from their subsystem owner and validate required
  functions before activating a dynamically loaded integration.
- Warm work must honor generation cancellation and the common reset/dispose
  path, including private targets and deferred preparation.

## Common tasks → first action
<!-- agent-docs:fill:tasks -->

- Frame sequencing: read `mainFrameRuntime.ts` and run its adjacent selftest.
- HUD acquisition/veil: use `mainBattleHudRuntime.selftest.mjs`.
- Warm lifecycle: use `combatWarmComposition.selftest.mjs` and the relevant
  engine/game warm-owner tests before browser timing captures.
- Lazy seams: run `lazyRuntimeOwner.selftest.mjs` and
  `checkedIntegrationPort.selftest.mjs`, then `npm run typecheck`.

## Gotchas
<!-- agent-docs:fill:gotchas -->
These modules coordinate owners; they do not replace simulation, HUD, camera,
or world lifecycle policy. A successful import is not proof that warm work
belongs to the current generation or that an adapter's runtime shape is valid.
