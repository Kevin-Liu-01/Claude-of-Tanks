# ADR 0080: Rendered gameplay advances through one typed state machine

- Status: accepted
- Date: 2026-08-27

## Context

`src/main.js` retained fixed-step debt and pause-transition state while also
ordering input polling, network pumping, the pre-battle hold, solo authority,
result progression, and rendered pose interpolation. The individual operations
already had owners, but their cross-frame policy did not. Any change to pause,
network authority, or countdown behavior therefore edited the render loop.

The old input call also built a new sample object on every rendered frame.

## Decision

`src/game/battleFrameRuntime.ts` owns the rendered gameplay-advance state
machine. Its single `advance()` operation:

1. resolves live-pause edges and clamps the first resumed frame;
2. fills one retained input sample;
3. pumps non-Garage network authority exactly once;
4. drains or advances the pre-battle hold;
5. integrates at most four 60 Hz solo steps;
6. advances result presentation; and
7. publishes one interpolated tank-presentation update.

The runtime returns one retained receipt containing the frame latches needed by
camera, world, effects, HUD, audio, lighting, and postprocessing. It exposes the
existing pause diagnostic record and one explicit accumulator reset for battle
activation and engineering fast-forward tools.

The composition root continues to own the renderer and the later presentation
order. It supplies grouped input, network, countdown, simulation, and
presentation ports but does not retain their state machine.

## Consequences

- Pause duration can never become fixed-step catch-up debt.
- Solo and network frames cannot both advance authority.
- Countdown release, result progression, and interpolation order have one
  Node-runnable behavioral test surface.
- The frame path allocates neither an input sample nor an advance receipt.
- `src/main.js` no longer owns pause or simulation-accumulator state and falls
  to 3,073 lines at this checkpoint.

## Verification

    node src/game/battleFrameRuntime.selftest.mjs
    node src/game/playerFrameInput.selftest.mjs
    node src/game/preBattleCountdown.selftest.mjs
    node src/game/battleResultPresentationRuntime.selftest.mjs
    node tools/pause-probe.mjs
    npm run typecheck
    npm test
    npm run build
    npm run perf:resources:gate
