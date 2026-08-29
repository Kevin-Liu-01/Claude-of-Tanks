# 0281 — WWII profile geometry has a strict TypeScript owner

## Decision

Keep the original and recovered WWII/inter-war procedural builds in
`src/vehicles/profiles/ww2.ts`. Express their shared builder surface, mirrored
slab tuples, Panzer III hull options, non-uniform geometry transforms, seeded
randomness, and profile registry through strict local contracts.

## Why

The pack remained a large unchecked geometry boundary even though its browser
loader and profile adapter were typed. Strict local types make ownership and
transform assumptions reviewable without merging the pack into an eager fleet
bundle or changing its authored geometry.

## Consequences

- Existing coordinates, topology, materials, seeds, transforms, decals, and
  profile registration order remain unchanged.
- The `ww2` family remains an exact demand-loaded browser chunk.
- Mirror-safe slab winding and array-valued non-uniform transforms are explicit
  contracts instead of unchecked JavaScript conventions.
- New profile entries must satisfy the shared typed profile record.

## Verification

- `npm run typecheck`
- `node tools/local-import-integrity.selftest.mjs`
- `node src/vehicles/fleetLazy.selftest.mjs`
- `npm run tank:anatomy:check`
- `npm run build`
