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
`lazyRuntimeOwner.ts` and `checkedIntegrationPort.ts` guard lazy integration;
a new lazy chunk takes `lazyChunk.ts`'s failure policy (`lazyRuntimeOwner.ts` is
one of its chunks per facade). The older memos that differ are named with their
reasons in `lazyChunkSites.selftest.mjs` KNOWN: stylesheets kept for the
document, memos asked once per lifecycle edge or open, the docs pages that do
not boot the policy and the icon sprite every page's boot holds, the unused HDRI
experiment, initializations and joins over chunks the policy holds (the Studio's
module memo over its opener chunk among them), data fetches and a warm task.
KNOWN fails a new hand-made memo, facade or latch in the spellings it reads, so
a new lazy load starts from `createLazyChunk`.
A caller that asks once per lifecycle edge (a battle's covered entry) may ask
past the backoff with `load({ backoff: false })`; `failures` tells a first ask
from a re-ask. `lazyChunkSites.selftest.mjs` EDGE_ASKS lists the files that may
spell `backoff: false`, a prepare's `{ entry: true }` or a Studio relight (the
option by name, or studio.ts's pass-throughs by their arity), and how often: a
new edge caller is added there with its reason.
`watchRuntime.ts` composes Watch mode (the drone/ride camera, the controller and
its bar) the first time a watched battle loads; main.ts keeps only the lazy owner.

## Patterns to follow / invariants
<!-- agent-docs:fill:patterns -->

- Preserve frame ordering, phase gates, and live getter semantics. Do not
  retain a stale world/player instead of consulting the supplied owner.
- Retain scratch objects across frames; avoid per-frame object allocation.
- Keep optional implementations demand-loaded. Concurrent preloads share
  one request; a failed load follows `lazyChunk.ts` (audit R6): terminal for an
  opener, a stylesheet or a 404 (an opener's trigger's next press reloads;
  `src/ui/components/loadFailure.ts` owns that state), otherwise asked again by
  the next caller with the INFRA-P11 backoff, never offline.
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
