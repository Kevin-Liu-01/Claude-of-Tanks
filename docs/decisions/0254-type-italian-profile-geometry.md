# 0254 — Italian profile geometry has a strict TypeScript owner

Status: accepted

## Decision

`src/vehicles/profiles/italy.ts` owns the C1 and C2 Ariete visual deltas and
the first-party Carro 45t procedural build through an explicit builder port.
The contract covers assembly ownership, fittings, equipment, cupolas,
mudguards, geometry receipts, carrier-sampled ERA placement, decals, and body
bucket offsets. The profile table satisfies the shared vehicle-profile record
and remains in the existing exact-family demand loader.

The migration preserves every geometry recipe, transform, material bucket,
fitting, receipt, and fleet registration value.

## Consequences

- Italian geometry receives strict checks without importing its Three.js graph
  into pristine Garage boot.
- C2 ERA receipt mutation is explicitly nullable and restricted to the C2
  construction path.
- Procedural assembly groups expose their existing metadata record through the
  shared structural port.

## Verification

    npm run typecheck
    node src/vehicles/profiles/arieteProportions.selftest.mjs
    node src/vehicles/profiles/carro45tRoof.selftest.mjs
    node src/vehicles/profiles/fleetEraFinish.selftest.mjs
    node src/vehicles/fleetLazy.selftest.mjs
    node src/vehicles/tankAssets.selftest.mjs
    node tools/local-import-integrity.selftest.mjs
    node tools/public-repo-hygiene.selftest.mjs
    npm run build
