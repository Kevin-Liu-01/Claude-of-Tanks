# 0271 — Type the shared procedural profile kit

## Status

Accepted.

## Context

Every profiled vehicle family depends on one shared module for generic hulls,
turrets, guns, muzzle closures, donor variants, and deterministic exterior
fittings. Leaving that module as unchecked JavaScript made malformed profile
dimensions, fitting options, geometry buckets, material sets, and articulation
owners invisible to the compiler across the entire fleet.

## Decision

`src/vehicles/profiles/kit.ts` is the strict TypeScript owner for this shared
machinery. It defines narrow geometry, profile, builder, muzzle, and fitting
contracts; validates the legacy transport-neutral profile boundary at runtime;
and narrows materials before constructing Three.js meshes.

Generic profile and donor contracts remain distinct. A generic profile needs
finite turret-envelope dimensions but may inherit gun length from combat data.
A donor needs only its canonical base and optional family kit callback. Fitting
material inputs remain structurally interoperable with the partially migrated
families, but are validated and narrowed before use.

All importers now name the TypeScript owner explicitly. Geometry formulas,
random seeds, transforms, material selection, demand-loading boundaries, and
rendered output are unchanged.

## Consequences

- Shared profile mistakes fail at typecheck or at the one validated adapter
  edge instead of surfacing as detached or missing tank parts.
- Deterministic fittings expose checked option vocabularies without forcing
  the remaining legacy family files into one broad migration.
- The remaining family-by-family JavaScript conversion can consume one stable
  typed foundation.

## Verification

    npm run typecheck
    node src/vehicles/tankFactoryCore.selftest.mjs
    node src/vehicles/profileBuilderAdapter.selftest.mjs
    node src/vehicles/fleetLazy.selftest.mjs
    node tools/local-import-integrity.selftest.mjs
    npm test
    npm run build
