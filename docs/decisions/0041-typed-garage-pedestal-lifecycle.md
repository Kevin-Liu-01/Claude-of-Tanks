# ADR 0041: Garage hero visuals have one typed lifecycle owner

- Status: accepted
- Date: 2026-08-27

## Context

The composition root directly owned garage hero construction, shader
submission, a warm visual LRU, async-switch cancellation, convergence recovery,
and transfer of the selected visual into and out of battle. Those decisions
formed one state machine, but approximately 460 lines of that state machine
lived among unrelated boot, world, UI, and render-loop wiring in `src/main.js`.
Source-shaped tests could inspect individual calls but could not exercise rapid
switches, eviction, or handoff as one unit.

## Decision

`src/game/garagePedestalRuntime.ts` is the sole owner of the garage hero
lifecycle. It receives scene, factory, texture, scheduler, and game lookup ports
at construction and exposes only selection, intent warming, cache trimming,
stage inspection, and battle handoff operations.

The runtime preserves these invariants:

- the outgoing hero covers the stage until the latest requested hero is ready;
- superseded builders and shader submissions cannot reveal a stale vehicle;
- the current, compiling, newly inserted, or visibly staged visual cannot evict
  itself;
- warm selections reuse their resident visual without rebuilding;
- the convergence watchdog repairs only a settled selection mismatch;
- first boot retains preview-quality paint and interactive switches retain the
  existing AI-quality latency policy;
- shader submission uses `compile`, never a forced ANGLE completion query.

`src/main.js` chooses the requested specification and connects lifecycle ports.
It no longer owns pedestal tokens, cache mutation, parking, shader warming, or
battle visual transfer policy.

## Consequences

- The composition root loses 383 lines while the behavior gains a strict public
  contract and direct deterministic coverage.
- Garage boot imports no new vehicle family or battle authority graph; the
  runtime composes the existing pedestal preloader.
- Rendering, paint resolution, camera framing, residency limits, and gameplay
  are unchanged.
- Future garage visual changes must preserve the runtime invariants rather than
  recreating lifecycle state in the composition root.

## Verification

    npm run typecheck
    node src/game/garagePedestalRuntime.selftest.mjs
    node src/game/loadingIntent.selftest.mjs
    node src/game/garageTankLifecycle.selftest.mjs
    node src/ui/loadingScreens.selftest.mjs
    npm test
    npm run build
