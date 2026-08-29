# 0282 — Russian profile geometry has a strict TypeScript owner

## Decision

Keep the shared Soviet/Russian procedural geometry and the T-44, T-54,
T-62MV-1, and T-64BV-1 builds in `src/vehicles/profiles/russia.ts`. Express
the reusable hull, dome, gun, running-gear, ERA, and Shtora helpers through
capability-specific builder ports instead of one oversized implicit builder.

## Why

This module is both an authored family pack and the geometry vocabulary used
by the typed Chinese, Polish, T-72, T-80, and Ukrainian packs. Its former
JavaScript boundary hid which helpers needed gun-mount, mudguard, material,
ERA, or bucket-offset capabilities and made sibling types appear more coupled
than the runtime actually is.

## Consequences

- Existing coordinates, topology, materials, transforms, profile order, and
  demand-loaded chunk boundaries remain unchanged.
- Shared helpers declare only the builder capabilities they execute.
- Russian ERA and Shtora option grammars are explicit typed contracts.
- Sibling profile ports record the mutable muzzle and specialized builder
  capabilities they already use at runtime.
- New Russian profile entries must satisfy the shared typed profile record.

## Verification

- `npm run typecheck`
- `node tools/local-import-integrity.selftest.mjs`
- `node src/vehicles/fleetLazy.selftest.mjs`
- `npm run tank:anatomy:check`
- `npm run build`
