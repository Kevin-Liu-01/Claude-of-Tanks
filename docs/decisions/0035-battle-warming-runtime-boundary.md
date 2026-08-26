# ADR 0035: Battle warming is an intent-loaded typed runtime

- Status: accepted
- Date: 2026-08-26

## Context

Terrain residency, roster wreck preparation, and common network effect warming
were implemented inside the composition root even though none can run in the
garage. This kept battle-only orchestration in `main.js`, transferred it on
every first visit, and left its renderer/game contracts untyped.

## Decision

Own those operations in `battleWarmRuntime.ts` behind a retryable typed access
facade. Start the transfer in the existing covered Battle loading barrier, run
the exact previous work before rollout, and invalidate renderer-lifetime
receipts after WebGL context restoration.

## Consequences

- Ordinary garage visits no longer transfer the battle-warming implementation.
- Solo and multiplayer use the same typed terrain residency owner.
- Wreck, effect, terrain, yielding, and context-recovery behavior is unchanged.
- `main.js` loses battle-only implementation without introducing a new global
  service or moving authority into rendering code.

## Verification

    npm run typecheck
    npm run build
    npm run test:net:entry
    npm run test:net:browser
    npm run perf:cold
