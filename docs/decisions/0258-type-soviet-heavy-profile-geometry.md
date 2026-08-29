# 0258 — Soviet heavy profile geometry has a strict TypeScript owner

Status: accepted

## Decision

`src/vehicles/profiles/soviet-heavy.ts` owns the IS-3, IS-7, Object 279,
IS-6B, IS-3 Bergman, and KV-2 authored visual builds through explicit shared
running-gear, material, fitting, and procedural-builder contracts. The strict
owner covers cast turret sections, articulated mantlets, pike noses, running
gear, fitted equipment, decals, and the KV-2 material readability pass.

The profile table satisfies the shared profile registry and stays behind the
existing Soviet-heavy exact-family demand boundary. The migration preserves
every geometry recipe, transform, material slot, receipt, and registration
value.

## Consequences

- Shared family helpers now reject malformed gear, mantlet, and pike options.
- Material retuning traversals explicitly model mesh, instance, geometry, and
  disposal ownership.
- Nonuniform Object 279 geometry retains the legacy array-scale transform
  through an explicit callable contract.

## Verification

    npm run typecheck
    node src/vehicles/profiles/kv2FrontChamferClosure.selftest.mjs
    node src/vehicles/trackPatterns.selftest.mjs
    node src/vehicles/fleetLazy.selftest.mjs
    node src/vehicles/tankAssets.selftest.mjs
    node tools/local-import-integrity.selftest.mjs
    node tools/public-repo-hygiene.selftest.mjs
    npm run build
