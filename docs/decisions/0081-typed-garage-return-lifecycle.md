# ADR 0081: Garage return is one typed lifecycle

- Status: accepted
- Date: 2026-08-27

## Context

`src/main.js` directly ordered every battle and Studio return: replay and HUD
cleanup, tank-owned FX reset, retained-room preservation or RTC closure, warm
invalidation, world dormancy, hero adoption, battle-state release, camouflage,
lighting, phase publication, pointer release, Garage UI, camera, audio, and GPU
residency. The same block also retained a transition latch and the bounded
wait-before-rematch policy.

That ordering is correctness-critical. Disposing network presentation before
tank decals, exposing the Garage before the world sleeps, or driving Battle
Again before the old entry lease finishes can respectively leak FX, preserve
stale battlefield work, or clobber the new round.

## Decision

`src/game/garageReturnRuntime.ts` owns the complete return state machine behind
three operations:

1. `enter()` performs an immediate covered return and optionally preserves the
   room;
2. `leave()` coalesces player-facing return requests under the branded
   transition; and
3. `battleAgain()` waits for an old entry lease, returns under the shorter
   regrouping transition, releases its transition latch, then drives the
   canonical Battle action.

The runtime is DOM-, WebGL-, Three.js-, and transport-independent. The
composition root supplies grouped presentation, network, warm, background-work,
world, roster, settings, UI, audio, transition, and GPU-residency ports. A
transition lease is armed before any adapter runs so synchronous phase/UI
events cannot re-enter the transaction.

## Consequences

- Retained multiplayer rooms release only their battle presentation; explicit
  exits close the match.
- Replay DOM and tank-parented effects clear before network or visual ownership
  changes.
- World dormancy precedes Garage hero adoption and exposure.
- Concurrent leave/rematch requests share one transition lease.
- Direct Studio exit still tolerates an unacquired battle HUD.
- `src/main.js` no longer retains Garage-return or transition state and falls
  to 3,001 lines at this checkpoint.

## Verification

    node src/game/garageReturnRuntime.selftest.mjs
    node src/game/garageTankLifecycle.selftest.mjs
    node src/game/garageDressingLifecycle.selftest.mjs
    node src/net/networkBattleLaunchRuntime.selftest.mjs
    node src/net/privateMatchHandoff.selftest.mjs
    node src/ui/loadingScreens.selftest.mjs
    npm run typecheck
    npm test
    npm run build
    npm run perf:resources:gate
