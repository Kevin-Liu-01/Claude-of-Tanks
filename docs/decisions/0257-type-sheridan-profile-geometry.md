# 0257 — Sheridan profile geometry has a strict TypeScript owner

Status: accepted

## Decision

`src/vehicles/profiles/sheridan.ts` owns the M551 Sheridan and M551A1 TTS
authored visual builds through explicit geometry and procedural-builder
contracts. The strict owner covers measured ring and station lofts, side and
transverse courses, the articulated M81 assembly, running gear, exact roof
fittings, ERA placement, decals, and the TTS modernization package.

The profile table satisfies the shared profile registry and stays behind the
existing Sheridan exact-family demand boundary. The migration preserves every
geometry recipe, transform, material slot, receipt, and registration value.

## Consequences

- Measured two- and three-dimensional sections can no longer silently mix
  malformed coordinate arrays.
- Nonuniform geometry transforms retain their established array-scale
  behavior through an explicit callable contract.
- The M2, smoke-bank, antenna, and TTS assemblies share one typed vehicle port
  without entering pristine Garage boot.

## Verification

    npm run typecheck
    node src/vehicles/profiles/sheridan.selftest.mjs
    node src/vehicles/profiles/americanModernization.selftest.mjs
    node src/vehicles/fleetLazy.selftest.mjs
    node src/vehicles/tankAssets.selftest.mjs
    node tools/local-import-integrity.selftest.mjs
    node tools/public-repo-hygiene.selftest.mjs
    npm run build
