# 0251 — The original modern MBT wave has a strict TypeScript owner

Status: accepted

## Decision

`src/vehicles/modern1.ts` owns the T-72B3, dormant Merkava IVm donor, and
Leopard 2A6 combat rows and procedural builders. Explicit contracts cover the
armor envelopes, fleet/model registry writes, geometry operations, ERA
placement callback, decals, and builder quality inputs.

The migration preserves every stat, armor plate, module and crew volume,
geometry recipe, transform, detail-quality branch, marking, roster position,
and demand-loading relationship. It does not make the delisted donor vehicles
selectable and does not move the family pack into pristine Garage boot.

## Consequences

- Combat rows must satisfy the same fleet contract as newer generated packs.
- ERA callbacks cannot silently change placement arity or turret ownership.
- The eager audit facade and demand loader consume one checked builder table.

## Verification

    npm run typecheck
    node src/vehicles/fleetLazy.selftest.mjs
    node src/vehicles/profiles/leopardHullClosure.selftest.mjs
    node src/vehicles/profiles/leopardA6MTurretSeat.selftest.mjs
    node src/vehicles/tankAssets.selftest.mjs
    node tools/local-import-integrity.selftest.mjs
    node tools/public-repo-hygiene.selftest.mjs
    npm run build
