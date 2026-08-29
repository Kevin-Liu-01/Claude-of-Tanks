# 0247 — AMX-40 geometry has a strict TypeScript owner

Status: accepted

## Decision

`src/vehicles/france.ts` owns the first-party AMX-40 visual build behind an
explicit procedural-builder port. The contract covers assembly groups,
material roles, running-gear layers, fitted equipment, gun extras, decals,
presentation receipts, and bucket scaling. The browser continues to acquire
this module only when an AMX-40 visual is required.

The migration preserves every primitive, coordinate, material bucket, running
gear layer, transform, decal, and receipt. Nonuniform `xform` calls retain the
same `R * S` matrix order through a typed geometry-scale helper; combat data,
family ordering, and loading policy do not change.

## Consequences

- The AMX-40 builder participates in strict checking without widening the
  large legacy tank-factory implementation.
- Malformed wheel-layer, transform, decal, or receipt calls fail typechecking.
- Initial player boot remains free of AMX-40 geometry unless the roster needs
  it.

## Verification

    npm run typecheck
    node src/vehicles/fleetLazy.selftest.mjs
    node src/vehicles/profiles/amx40AttachmentSeat.selftest.mjs
    node src/vehicles/tankAssets.selftest.mjs
    npm run tank:release:check -- --ids=amx40 --gate
    npm run build

The release wrapper passes anatomy, centering, module alignment, asset,
track-deduplication, muzzle-bore, and barrel-circularity checks. Its final
legacy standard census reports `0/0+0/806` without a local comparison oracle;
the identical result is reproduced from the clean pre-migration `origin/main`
tree and is therefore existing fleet-standard debt rather than migration
drift.
