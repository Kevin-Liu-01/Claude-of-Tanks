# 0205 — Fleet combat rows share a strict TypeScript contract

Status: accepted

## Decision

Define the common combat-row schema in `src/vehicles/specContracts.ts` and use
it at boot-light spec registration boundaries. The contract covers mobility,
aiming, gun and shell data, dimensions, armor, and visual identity while
permitting family-specific extension metadata.

Migrate `franceSpecs.ts` and `profiles/miscSpecs.ts` first. They register the
AMX-40 and Type 74 without importing their Three.js builders, and explicitly
adapt the legacy JavaScript registries to typed records at that boundary.

## Why

Boot-light spec packs are authoritative gameplay data but previously mutated
unchecked JavaScript dictionaries. A shared structural contract catches
missing combat fields, malformed hydropneumatic data, and registry/source
shape errors while preserving the demand-loaded builder topology.

## Consequences

- Compact spec packs can migrate without importing a builder or the eager
  fleet facade.
- The legacy registry cast is isolated and visible until `specs.js` itself is
  migrated.
- AMX-40 and Type 74 values, registration order, and runtime chunks are
  unchanged.
