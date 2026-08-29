# 0252 — Optional Garage workshop dressing has a strict TypeScript owner

Status: accepted

## Decision

`src/game/garageDressing.ts` owns the optional exact-fleet workshop set-piece
behind explicit engine, existing-rig, runtime, tracked-resource, canvas,
material, assembly-kind, fleet-factory, and chunk contracts.
`garageDressingAccess.ts` imports the runtime type directly, demand-loads the
module without a double-unknown assertion, and prepares only the Abrams, T-90M,
and Leclerc builders behind the existing garage-lull gate.

The migration preserves every mesh, transform, texture, light, wall bay,
variant layout, staged build chunk, optimization call, and disposal operation.
The workshop remains outside the initial application chunk and builds only
through the established idle scheduler. Three complete high-geometry static
preview tanks are built one per quiet lease. Three exact turret/gun exhibits
clone the turret rigs from those tanks and share their geometry and materials.
The current six displays total 352,762 rendered triangles. Each complete tank
receives a force-visible shader compile before reveal; none of this work occurs
while battle owns the renderer. Verdant Motor Pool uses the original enclosed
ceiling and full truss run, and background tanks retain their painted-bay axes
with a 180-degree facing correction.

## Consequences

- The Garage access layer and optional runtime share one public contract.
- New non-vehicle workshop props must be a registered workshop part kind.
- Vehicle exhibits must come from the first-party fleet factory and reuse
  already-built rigs when only a turret or gun display is required.
- Exact-fleet preparation must remain lazy, cancellable at the scheduler
  boundary, and absent from the initial garage and battle graphs.
- Chunk failures retain their exact owner name and existing diagnostic message
  before the retryable access layer retries the module.

## Verification

    npm run typecheck
    node src/game/garageDressingAccess.selftest.mjs
    node src/game/garageDressingFleet.selftest.mjs
    node src/game/garageDressingLifecycle.selftest.mjs
    node src/game/garageDressingOptimization.selftest.mjs
    node src/game/workshopParts.selftest.mjs
    node src/game/garageVariants.selftest.mjs
    node src/game/garageWallLayout.selftest.mjs
    node tools/local-import-integrity.selftest.mjs
    node tools/public-repo-hygiene.selftest.mjs
    npm run build
