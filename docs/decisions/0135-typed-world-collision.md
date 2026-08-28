# 0135: World collision primitives share a strict contract

## Status

Accepted — 2026-08-28

## Decision

`src/world/collision.ts` defines the shared shape, bounds, vector, broad-phase,
and narrow-phase contracts used by client simulation, browser multiplayer,
dedicated authority, shell traces, props, and vegetation. Its uniform-grid and
SAT/ray routines remain allocation-free in established hot paths.

Headless collision inflation consumes the exported record contract instead of
maintaining a second structural copy.

## Consequences

- Client and server collision shapes now fail type checking when they drift.
- Spatial-grid queries retain caller-owned result arrays and numeric cell keys.
- Exact OBB, circle, and convex footprints remain visually and mechanically
  identical to the prior JavaScript implementation.
