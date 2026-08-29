# 0229 — Core combat variants are typed and source-independent

Status: accepted

## Decision

Rename `src/vehicles/variants.js` to `combatVariantSpecs.ts` and type the M1A1,
T-90A, and M1A2 TUSK combat rows, armor transforms, registration ids, and
comparison-source record with shared fleet contracts.

Remove historical source-credit objects from executable specs. Retain the
M1A2 TUSK GLB only as an explicit `candidateGlb` comparison record and keep all
legal attribution in `docs/ATTRIBUTION.md`.

Make `FleetVisualSpec.camoScale` optional because omission intentionally means
"use the established painter-family default" and existing authored fleet rows
already rely on that behavior.

## Why

The old generic filename mixed playable combat data with a retired third-party
model narrative. Roster finalization removed every `community` field before
the ids became selectable, while all three vehicles already resolved through
first-party procedural builders.

An overly strict visual contract also claimed every spec had to store an
explicit camo scale even though the runtime and legacy registry support a
stable default.

## Consequences

- Vehicle ids, order, stats, armor, shells, visuals, and procedural builders
  remain unchanged.
- Source models cannot become playable through this registry.
- TypeScript checks armor overrides and all three complete combat rows.
- Attribution remains complete without leaking obsolete ownership metadata
  into the runtime object graph.
