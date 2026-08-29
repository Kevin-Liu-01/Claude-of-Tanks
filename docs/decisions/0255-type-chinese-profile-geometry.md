# 0255 — Chinese profile geometry has a strict TypeScript owner

Status: accepted

## Decision

`src/vehicles/profiles/china.ts` owns the ZTZ-85-III, Type 99A, ZTZ-99A2, and
Type 59 authored visual deltas through an explicit procedural-builder port.
The contract covers assembly rigs, roof equipment, ERA clusters, external
armor, module visuals, decals, exact running-gear contact receipts, and the
existing nonuniform mantlet geometry transform.

The profile table satisfies the shared profile registry and stays behind the
existing `modern2` exact-family demand boundary. The migration preserves every
geometry recipe, transform, material slot, receipt, and registration value.

## Consequences

- Chinese family geometry is checked without entering pristine Garage boot.
- Gear receipt scaling is limited to named numeric fields rather than an
  unchecked property bag.
- Nonuniform transforms use an explicit callable contract matching the legacy
  geometry helper's established array-scale behavior.

## Verification

    npm run typecheck
    node src/vehicles/profiles/ztz85iiiAttachment.selftest.mjs
    node src/vehicles/profiles/ztz99a2RearService.selftest.mjs
    node src/vehicles/profiles/type99AAngularTurret.selftest.mjs
    node src/vehicles/profiles/type59Overhaul.selftest.mjs
    node src/vehicles/profiles/type99Armor.selftest.mjs
    node src/vehicles/fleetLazy.selftest.mjs
    node src/vehicles/tankAssets.selftest.mjs
    node tools/local-import-integrity.selftest.mjs
    node tools/public-repo-hygiene.selftest.mjs
    npm run build
