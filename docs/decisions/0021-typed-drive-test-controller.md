# ADR 0021: Rendered drive tests have one typed controller

- Status: accepted
- Date: 2026-08-26

## Context

The composition root contained hundreds of lines of test-only target selection,
fixed-step acceleration, lethal-shell staging, and team-safe victory helpers.
Those helpers intentionally drive the real simulation and rendered vehicle
articulation, but their state and scratch geometry are not production gameplay
ownership.

## Decision

`src/dev/driveTestController.ts` owns the rendered-battle QA controls behind
explicit game, world, rig, aim, input, simulation, and presentation-reset ports.
The browser debug surface keeps its existing synchronous method names and return
values. The controller has private vector scratch, target/lead latches, and no
authority over the live render loop.

## Consequences

- `src/main.js` composes the controller instead of implementing QA gunnery.
- Normal visuals, aiming, ballistics, fixed-step behavior, and debug contracts
  remain unchanged.
- Test-only state cannot accidentally become another composition-root global.
- TypeScript now documents which live systems deterministic browser probes may
  drive.

## Verification

    node src/dev/driveTestController.selftest.mjs
    npm run typecheck
    npm test
    npm run build
