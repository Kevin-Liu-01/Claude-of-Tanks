# ADR 0002: Cooperative loading without visual degradation

- Status: accepted
- Date: 2026-08-25

## Context

Battlefields, procedural tanks, shaders, effects, and shadows are expensive to
prepare. Synchronous preparation freezes progress UI; yielding every checkpoint
to a full animation frame extends load time. Removing or simplifying visible
content would violate the product's visual contract.

## Decision

Use two cooperative scheduling modes:

- Visible garage and transition work yields on real animation frames after a
  small budget so input and presentation remain fluid.
- Work covered by an opaque loading screen normally yields the current task and
  guarantees a real paint only at a bounded cadence.

Background world and garage builders remain paused until transition overlays
fully leave layout. First-battle GPU initialization runs behind the loader.
Prefetch may resolve intent and download/build exact assets, but it must not
construct unrelated worlds or fleet families.

Boot recovery distinguishes evidence of failure from slow progress. A failed
module download/evaluation may trigger one immediate fresh-document recovery.
Lack of progress first exposes a manual retry without interrupting work; only
a much longer foreground/online stall may use the automatic recovery. The
`_bootretry` URL receipt is authoritative when storage is unavailable, which
prevents refresh loops in private or storage-restricted browsers.

Studio follows the same contract: direct-entry effect atlases, shaders, and
texture uploads use the opaque scheduler, while scene JSON loading yields
between complete procedural actors and refreshes timeline/UI bindings once per
batch. Actor geometry, materials, effect seeds, and final scene state are not
simplified.

## Consequences

- Full-quality geometry, materials, effects, and lighting remain enabled.
- Load progress continues painting under CPU pressure.
- Direct cold battle entry still exposes the real cost of the selected map;
  garage intent can hide part of that cost through bounded prefetch.
- Scheduler behavior is a typed engine contract rather than local boot logic.
- Slow first visits keep their in-flight downloads and shader work instead of
  being mistaken for failed boots and reloaded onto a warm cache.

## Verification

    npm run typecheck
    node src/engine/frameScheduler.selftest.mjs
    node src/ui/chunkRecovery.selftest.mjs
    node src/ui/loadingScreens.selftest.mjs
    npm run perf:cold -- --sessions 4 --cpu 8 --down-kbps 800 --latency 250
    npm run build
