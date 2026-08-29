# 0283 — British profile geometry has a strict TypeScript owner

## Decision

Keep British procedural geometry and the shared Centurion construction path in
`src/vehicles/profiles/uk.ts`. Replace the former dynamic kit proxy with direct,
statically visible helper bindings and describe builder access through narrow
geometry, gun, material, and Centurion capability ports.

## Why

The British pack owns thousands of authored armor, running-gear, turret, gun,
and fitting datums and also supplies the Centurion base used by Sweden. The
JavaScript boundary and dynamic proxy concealed those dependencies from both
TypeScript and the fleet chunk graph, while an all-capabilities builder type
made the Swedish reuse look more coupled than its runtime behavior.

## Consequences

- Coordinates, topology, materials, transforms, profile order, and lazy chunk
  ownership remain unchanged.
- British helpers declare only the builder capabilities they execute.
- The Swedish Strv 81 path satisfies the shared Centurion contract directly.
- The kit surface is statically visible to TypeScript and the bundler.
- New British entries must satisfy the shared typed profile record.

## Verification

- `npm run typecheck`
- `node tools/local-import-integrity.selftest.mjs`
- `node src/vehicles/fleetLazy.selftest.mjs`
- `npm run tank:anatomy:check`
- `npm run build`
