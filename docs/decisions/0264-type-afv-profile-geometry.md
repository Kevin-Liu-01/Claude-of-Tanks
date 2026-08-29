# 0264 — Shared AFV profile geometry has a strict TypeScript owner

Status: accepted

## Decision

`src/vehicles/profiles/afvFamily.ts` owns the authored visual deltas for the
BMP-3 family, Ukrainian and M3A3 Bradleys, BMPT variants, BWP-1, Marder 1A3,
Puma, and Upior.

The port defines a narrow procedural-builder contract for structural buckets,
equipment, gun followers, decals, ERA clusters, material retuning, nonuniform
transforms, and bucket traversal. The recipes, primitive parameters, donor
selection, profile IDs, and exact-family dynamic import are unchanged.

## Consequences

- AFV fittings must attach to an explicit hull or turret owner.
- ERA callbacks and scale-sensitive bucket traversal have checked shapes.
- The AFV pack stays absent from boot until a selected or fielded vehicle
  requires it.

## Verification

    npm run typecheck
    node src/vehicles/afvBalance.selftest.mjs
    node src/vehicles/profiles/bradleyHullClosure.selftest.mjs
    node src/vehicles/combatAnatomy.selftest.mjs
    node src/vehicles/tankAssets.selftest.mjs
    node tools/local-import-integrity.selftest.mjs
    node tools/public-repo-hygiene.selftest.mjs
    npm run build
