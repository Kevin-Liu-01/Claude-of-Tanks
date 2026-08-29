# 0265 — Polish profile geometry has a strict TypeScript owner

Status: accepted

## Decision

`src/vehicles/profiles/poland.ts` owns the authored PL-01, PL-01 105,
T-72M1 Jaguar, and PT-91 Twardy visual geometry.

The module defines narrow contracts for connected assembly groups, Polish
materials, vehicle identity and gun pivots, ERAWA courses, dome-surface seats,
segmented measured strips, gun followers, fitted equipment, and disposable
ghillie resources. Primitive dimensions, recipe order, random seeds, donor
selection, profile IDs, and the exact-family dynamic import stay unchanged.

## Consequences

- ERAWA layout callbacks and dome seats have checked coordinate shapes.
- Every fitted object attaches to an explicit hull or turret owner.
- The Polish pack remains absent from boot until a selected or fielded vehicle
  requires it.

## Verification

    npm run typecheck
    node src/game/matchmaking.selftest.mjs
    node src/vehicles/combatAnatomy.selftest.mjs
    node src/vehicles/tankAssets.selftest.mjs
    node tools/local-import-integrity.selftest.mjs
    node tools/public-repo-hygiene.selftest.mjs
    npm run build
