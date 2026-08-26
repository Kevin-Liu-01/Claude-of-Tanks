# 0013 — Battlefield construction has one typed coordinator

## Context

The application entry point owned map-module transfer, concurrent build joins,
background pacing, intent promotion, cancellation, cache residency, GPU
resource disposal, and loading-stage telemetry as one large mutable block.
Those policies are central to first-battle latency and mobile stability, but
could not be tested without booting the full renderer.

## Decision

`src/world/worldBuildCoordinator.ts` owns complete battlefield construction and
residency.

- A map ID has at most one in-flight deterministic build.
- Foreground demand promotes and joins an existing background build.
- Background work runs only during a genuine garage lull unless explicit
  Battle intent requests immediate bounded slices.
- Stale background builds are cancellable; foreground builds are never
  cancelled by a selection change.
- Completed scenes enter one exact cache and remain dormant until activated.
- Device-tier residency limits evict inactive scenes with shared-resource and
  CSM-material release preserved.
- `main.js` retains active-world selection, scene activation, minimap, sky,
  collision, and gameplay-service ownership.

## Consequences

Map geometry, seeds, construction order, fine-slice checkpoints, visual
quality, cache limits, and activation behavior are unchanged. The composition
root loses the build registry and its mutable timing/cancellation state. World
loading policy can now evolve behind a strict TypeScript contract without
coupling it to garage, HUD, multiplayer, or battle setup internals.

## Verification

- `src/world/worldBuildCoordinator.selftest.mjs` covers concurrent joining,
  background promotion, cache reuse, capacity rejection, and exact eviction.
- The production cold-Verdant battle probe must preserve complete stage
  telemetry, finish before the 5.5 s loading and 7.5 s rollout budgets, and
  keep the transition frame gap below 500 ms.
- `npm run typecheck`, `npm test`, and `npm run build` remain release gates.
