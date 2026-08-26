# ADR 0017: Boot staging has one typed lifecycle owner

- Status: accepted
- Date: 2026-08-26

## Context

The integration entry point directly managed progress begin/end calls, frame
yields, stage duration, unattributed gaps, and the heavy-stage paint threshold.
That made first-load policy inseparable from WebGL construction and difficult
to verify without launching the full game.

## Decision

`src/engine/bootLifecycle.ts` owns progress and timing for named boot stages.
It attributes work between stages, yields once before every stage, and adds an
after-stage paint only when work exceeds the existing 20 ms threshold. The
renderer remains a manual first stage because it establishes the engine
objects consumed by every later stage, but it completes through the same
owner.

## Consequences

- Boot policy is strict TypeScript and testable without DOM or WebGL.
- `src/main.js` declares startup order but no longer implements the lifecycle.
- Stage order, progress visuals, timing keys, and yield thresholds are
  unchanged.

## Verification

    node src/engine/bootLifecycle.selftest.mjs
    npm run typecheck
    npm run build
