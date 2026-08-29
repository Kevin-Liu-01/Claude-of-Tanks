# 0245 — Japanese profile geometry has a strict TypeScript owner

Status: accepted

## Decision

`src/vehicles/profiles/japan.ts` owns the STB-1, Type 90A, and Type 10B
first-party visual deltas behind an explicit procedural-builder contract. The
family stays demand-loaded through `fleetFactory.ts`; eager audit tooling uses
the same profile table through `profiledProcedurals.ts`.

The migration preserves the complete donor assemblies, primitive geometry,
transform values, material buckets, cassettes, equipment, decals, receipts,
and smart running gear. It changes neither vehicle specifications nor runtime
family order.

## Consequences

- Japanese profile helpers and all three builder entry points are checked.
- The family can no longer reintroduce an unchecked JavaScript profile pack.
- Browser boot still acquires this family only for a required Japanese tank.

## Verification

    npm run typecheck
    node src/vehicles/profiles/japaneseCastTurrets.selftest.mjs
    node src/vehicles/profiles/japaneseHydropneumaticSuspension.selftest.mjs
    node src/vehicles/profiles/type10GunSeat.selftest.mjs
    node src/vehicles/profiles/type10RoofEraSeating.selftest.mjs
    node src/vehicles/profiles/type10TrackReseat.selftest.mjs
    node tools/tank-assets-check.mjs --ids=stb1,type90a,type10b
    npm run build
