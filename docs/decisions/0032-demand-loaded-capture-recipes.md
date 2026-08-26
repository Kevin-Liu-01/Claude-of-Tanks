# ADR 0032: Deterministic capture recipes are demand loaded

- Status: accepted
- Date: 2026-08-26

## Context

The 32 deterministic marketing and screenshot recipes occupied roughly five
hundred lines in `main.js`. Every player parsed those battle-staging, camera,
effects, and killcam recipes even though only explicit capture tools invoke
them through `window.__SHOTS.set()`.

## Decision

Keep a tiny stable `window.__SHOTS` facade in the entry module and transfer the
recipe factory only on the first explicit `set()` call. The factory receives
its live engine dependencies from the entry owner after the requested world is
ready, so it cannot statically pull the fleet, world, FX, or killcam graphs back
into ordinary boot. Capture-module loading overlaps the existing exhaustive
capture warmup.

## Consequences

- Ordinary players do not transfer or parse capture recipes.
- `main.js` is about 480 lines smaller.
- The public `views` list and asynchronous `set(name)` contract are unchanged.
- Studio and marketing captures retain the exact recipes and visual staging.
- Capture transfer failure is isolated from playable first-visit readiness.

## Verification

    npm run typecheck
    npm run build
    npm run perf:cold -- --url http://127.0.0.1:4173/ --sessions=1 --summary=1

The cold probe fails if an ordinary pristine session requests the capture
chunk. Browser certification also stages both `garage` and `sniper_view` and
confirms the chunk appears only after the first explicit capture.
