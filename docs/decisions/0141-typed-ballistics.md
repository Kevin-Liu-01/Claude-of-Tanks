# 0141: Ballistics has one strict headless contract

## Status

Accepted — 2026-08-28

## Decision

`src/sim/ballistics.ts` owns typed shell specifications and entities, gravity,
physical gun lay, fixed-step flight, guided steering, penetration falloff, and
dispersion. It remains renderer-free, deterministic, and driven only by fixed
time steps and injected random samples.

Shell creation preserves the caller's concrete specification type. The hot
integration and guidance paths retain module-scoped scratch vectors and add no
per-step allocations.

## Consequences

- Solo, browser-hosted, and dedicated authority share one projectile contract.
- Invalid shell velocity, guidance, or penetration fields fail during typed
  development boundaries.
- Existing flight, reticle, damage, and replay behavior remains unchanged.
