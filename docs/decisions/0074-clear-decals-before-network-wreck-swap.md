# 0074 — Network wreck swaps clear decals first

Status: accepted

## Context

Authority snapshots can mark a tank destroyed before the reliable presentation
event reaches the browser. Impact decals are children of the vehicle visual and
deliberately use normal-less geometry. A snapshot-driven wreck swap that walks
the still-attached decals mistakes them for non-patchable tank surfaces,
replaces them with the opaque burnt fallback, and creates physical and depth
shader programs during live play.

## Decision

`browserBattleBridge` owns an optional synchronous decal-clear callback. On the
first alive-to-destroyed snapshot transition it clears the vehicle's decals
before calling `setDestroyed(true)`. The later reliable destruction event may
repeat idempotent FX cleanup, but it is not the correctness owner for snapshot
ordering.

## Consequences

- Impact marks never become opaque wreck plates.
- First destruction does not create the erroneous `cot:burnt` program family.
- Snapshot and reliable-event reordering remains visually correct.
- The bridge remains renderer-independent because the callback is injected.

## Verification

```sh
node src/net/browserBattleBridge.selftest.mjs
npm run test:net:seven:full -- --only=host
npm run perf:resources:gate
```
