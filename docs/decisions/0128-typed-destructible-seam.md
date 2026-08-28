# 0128 — Destructible worlds share one typed event seam

## Status

Accepted — 2026-08-28

## Context

Shell trails and impact FX must reach only the active cached battlefield, while
world props must report break effects and audio events without importing the
heavy combat renderer. The original JavaScript registry left these cross-layer
callbacks structurally implicit.

## Decision

`src/world/destructibles.ts` owns the strict provider, destruction-event,
impact, sweep, and per-world handler contracts. Registration replaces an
existing map key, and dispatch checks active residency before calling a world.
The hot shell path remains a direct bounded loop and performs no allocation.

## Consequences

- Cached dormant worlds cannot receive live shell traffic.
- Rebuilt maps replace stale handlers instead of accumulating callbacks.
- FX, audio, and world layers remain dependency-separated.
- Provider and event sinks can be cleared explicitly during lifecycle teardown.
