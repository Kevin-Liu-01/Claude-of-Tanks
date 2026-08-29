# 0252 — Optional Garage workshop dressing has a strict TypeScript owner

Status: accepted

## Decision

`src/game/garageDressing.ts` owns the optional low-poly workshop set-piece
behind explicit engine, existing-rig, runtime, tracked-resource, canvas,
material, assembly-kind, and chunk contracts. `garageDressingAccess.ts`
imports the runtime type directly and demand-loads the module without a
double-unknown assertion.

The migration preserves every mesh, transform, texture, light, wall bay,
variant layout, staged build chunk, optimization call, and disposal operation.
The workshop remains outside the initial application chunk and builds only
through the established idle scheduler.

## Consequences

- The Garage access layer and optional runtime share one public contract.
- New workshop assemblies must be a registered low-poly part kind.
- Chunk failures retain their exact owner name and existing diagnostic message
  before the retryable access layer retries the module.

## Verification

    npm run typecheck
    node src/game/garageDressingAccess.selftest.mjs
    node src/game/garageDressingLifecycle.selftest.mjs
    node src/game/garageDressingOptimization.selftest.mjs
    node src/game/workshopParts.selftest.mjs
    node src/game/garageVariants.selftest.mjs
    node src/game/garageWallLayout.selftest.mjs
    node tools/local-import-integrity.selftest.mjs
    node tools/public-repo-hygiene.selftest.mjs
    npm run build
