# 0268 — T-72 profile geometry has a strict TypeScript owner

Status: accepted

## Decision

`src/vehicles/profiles/t72.ts` owns the T-72 obr. 1987, T-72B3M, and T-72BU
procedural profile family under strict TypeScript. Its internal port explicitly
describes articulation groups, physical materials, geometry disposal, running-
gear layers, ERA clustering, module visuals, mudguards, decals, and
post-assembly material corrections.

The public family boundary continues to accept the transport-neutral profile
builder port. One checked adapter converts that boundary to the complete T-72
builder contract, so Polish Jaguar and BMPT consumers can reuse the family
without widening their own interfaces. Non-uniform geometry transforms are
typed explicitly rather than weakening the whole builder surface.

## Consequences

- Missing T-72 builder capabilities and invalid bucket keys now fail typecheck.
- Mutable post-assembly mesh/material work is narrowed by an explicit mesh
  guard instead of relying on unchecked traversal values.
- Demand-loading groups, procedural geometry, transforms, materials, vehicle
  output, and runtime behavior are unchanged.
- The remaining JavaScript fleet migrations can follow the same narrow-port
  pattern without importing the legacy factory implementation.

## Verification

    npm run typecheck
    node src/vehicles/profiles/t72TrackFinish.selftest.mjs
    node src/vehicles/profiles/t72TurretCleanup.selftest.mjs
    node src/vehicles/profiles/t72B3MFrontAttachment.selftest.mjs
    node src/vehicles/profiles/t72CamoCoverage.selftest.mjs
    node src/vehicles/fleetLazy.selftest.mjs
    node tools/local-import-integrity.selftest.mjs
    npm test
    npm run build
