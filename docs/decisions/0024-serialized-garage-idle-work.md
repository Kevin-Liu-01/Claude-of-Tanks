# ADR 0024: Optional garage construction uses one idle lane

- Status: accepted
- Date: 2026-08-26

## Context

Adjacent-vehicle texture painting, exact-map background construction, and the
optional workshop exhibit each used a local frame budget and garage-lull gate.
Those policies did not coordinate with one another. Their slices could overlap
on the same browser frames, turning several cooperative jobs into visible input
and animation stalls even though no individual owner violated its own budget.

## Decision

`src/game/garageIdleWorkCoordinator.ts` owns mutual exclusion and priority for
optional garage construction. Explicit Battle/map intent runs first, followed
by adjacent-vehicle paint and workshop dressing. Producers
retain their existing cancellation, yielding, construction, and visual-quality
contracts. Stale queued requests are discarded before a lease is granted.

The world builder releases its lease at each progress checkpoint and reacquires
before the next generator slice. Neighbor painting and workshop construction
release on completion, cancellation, or failure. Interactive pointer-intent
loading remains outside this passive lane because it is direct user intent.

## Consequences

- Passive garage work cannot saturate the main thread through overlap.
- Map intent still outranks cosmetic preparation.
- No geometry, texture resolution, authored dressing, or simulation behavior
  changes.
- The read-only `window.__GARAGE_IDLE_WORK` receipt exposes current, queued,
  completed, and per-kind counts for browser diagnostics.

## Verification

    node src/game/garageIdleWorkCoordinator.selftest.mjs
    node src/game/garageDressingLifecycle.selftest.mjs
    node src/game/garagePedestalPreloader.selftest.mjs
    node src/world/worldBuildCoordinator.selftest.mjs
    npm run typecheck
    npm run build
    node tools/switch-latency-probe.mjs --cpu 4 --cores 4 --memory 4 --tier mobile
