# 0230 — Challenger combat registration is typed and boot-light

Status: accepted

## Decision

Migrate `src/vehicles/challengerSpecs.js` to TypeScript. Type all six complete
combat rows and four armor-envelope builders with shared fleet contracts, and
make the historical insertion order an explicit readonly id tuple.

Keep geometry in the demand-loaded Challenger profile module. The browser and
release facades continue to register only combat data at boot.

## Why

This module is a stable boundary between the eager roster and the large visual
builder family. Typing it catches incomplete armor, gun, dimensions, and visual
records without pulling Three.js geometry into initial Garage loading.

The previous `Object.entries` loop relied on object property order to preserve
the carousel position before Merkava. The tuple makes that invariant visible
and checked.

## Consequences

- All ids, stats, armor plates, shells, visuals, and roster positions remain
  unchanged.
- TypeScript checks the complete Challenger combat family.
- The large visual builder remains demand-loaded.
