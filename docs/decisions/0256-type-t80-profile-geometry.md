# 0256 — T-80 profile geometry has a strict TypeScript owner

Status: accepted

## Decision

`src/vehicles/profiles/t80.ts` owns the T-80, T-80B, T-80BV, and T-84 Oplot
authored visual deltas through an explicit procedural-builder port. The
contract covers articulated assembly rigs, roof equipment, ERA carriers,
external armor, decals, exact running-gear contact receipts, and resources
whose lifetime follows the assembled vehicle.

The profile table satisfies the shared profile registry and stays behind the
existing `modern2` exact-family demand boundary. The migration preserves every
geometry recipe, transform, material slot, receipt, and registration value.

## Consequences

- T-80-family geometry is checked without entering pristine Garage boot.
- Vehicle-owned materials and geometry expose a concrete disposal contract.
- Surface-seated ERA data and nonuniform transforms no longer rely on implicit
  JavaScript parameter shapes.

## Verification

    npm run typecheck
    node src/vehicles/profiles/t80CastTurretFamily.selftest.mjs
    node src/vehicles/profiles/t80UTurretGlacis.selftest.mjs
    node src/vehicles/profiles/t84OplotTurret.selftest.mjs
    node src/vehicles/profiles/turretEraSurfaceSeating.selftest.mjs
    node src/vehicles/profiles/fleetEraFinish.selftest.mjs
    node src/vehicles/fleetLazy.selftest.mjs
    node src/vehicles/tankAssets.selftest.mjs
    node tools/local-import-integrity.selftest.mjs
    node tools/public-repo-hygiene.selftest.mjs
    npm run build
