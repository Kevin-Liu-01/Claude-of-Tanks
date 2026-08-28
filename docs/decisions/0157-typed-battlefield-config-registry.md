# 0157 — Typed battlefield configuration registry

Status: accepted

## Decision

All twenty first-party battlefield configuration modules and their ordered
registry are TypeScript. The registry exports a literal `MapId` union, a
runtime `isMapId` guard, the inferred configuration union, and total lookup
functions that preserve Verdant Fields and seeded-random fallback behavior.

## Why

Battlefield ids cross garage, solo simulation, private rooms, ranked
matchmaking, dedicated collision, Studio, and release tooling. Keeping that
shared catalog as untyped JavaScript allowed misspelled ids and stale secondary
map lists to survive until runtime. Typing only consumers would still leave the
canonical content boundary implicit.

## Consequences

- `MAP_IDS` remains the one immutable ordering and Random Battle pool.
- Invalid ids still resolve safely; callers can now narrow them explicitly.
- Map content, terrain callbacks, spawn points, lighting, and prop data are
  unchanged, so rendering and deterministic collision manifests are stable.
- Node self-tests and browser bundles import the same `.ts` registry directly.
