# 0196 — Running-gear families use one typed mechanical vocabulary

Status: accepted

## Decision

`wheelPatterns.ts`, `trackPatterns.ts`, and `suspensionPatterns.ts` define
closed IDs, immutable geometry records, ordered vehicle-family rules, and
deterministic fallbacks. The procedural factory consumes the three resolved
records; individual builders may request an explicit typed override only when
the vehicle's authored geometry requires it.

## Why

Wheels, shoes, and hull-to-wheel links form one mechanical system but remain
useful independent interfaces: a wheel family can select a default shoe and a
suspension family can react to the resolved wheel layout. Collapsing the three
would create a cross-product catalog, while untyped string lookups allow a
misspelled override to survive until procedural construction.

These are in-process, deterministic dependencies. Their tests exercise the
public resolvers across the complete fleet rather than mocking factory
internals.

## Consequences

- Family rule outputs and overrides must be registered keys at compile time.
- Selection order, geometry parameters, shade palettes, and fallback behavior
  remain unchanged.
- The full 127-tank sweep certifies 12 wheel, 12 track, and five suspension
  families; focused Abrams, Japanese, Korean, and MBT-70 geometry checks stay
  on the same resolver interface.
- No per-frame code, geometry count, materials, track deformation, or physics
  behavior changes in this migration.
