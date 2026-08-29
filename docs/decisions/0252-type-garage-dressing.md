# 0252 — Optional Garage workshop dressing has a strict TypeScript owner

Status: accepted

## Decision

`src/game/garageDressing.ts` owns the optional exact-fleet workshop set-piece
behind explicit engine, existing-rig, runtime, tracked-resource, canvas,
material, assembly-kind, fleet-factory, and chunk contracts.
`garageDressingAccess.ts` imports the runtime type directly, demand-loads the
module without a double-unknown assertion, and prepares only the T-90A Burlak,
Abrams, T-90M, K2, and Leclerc builders behind the existing garage-lull gate.

The migration preserves every mesh, transform, texture, light, wall bay,
variant layout, staged build chunk, optimization call, and disposal operation.
The workshop remains outside the initial application chunk and builds only
through the established idle scheduler. Verdant Motor Pool restores the exact
pre-overhaul four-bay arrangement at 369,886 visible triangles, including its
gantry, jack stands, removed side skirts, welding run, component cradles,
Relikt rack, rolled K2 hull, loose running gear, and weapon table. Its receipt
is `pre-6c7b07533-original`. The nine additive environments retain three
complete high-geometry previews and three resource-sharing turret/gun clones
at 352,762 triangles. Each complete tank receives a force-visible shader
compile before reveal; none of this work occurs while battle owns the renderer.
Verdant also uses the original enclosed ceiling and full truss run. Alternate
background tanks retain their painted-bay axes with a 180-degree facing
correction.

The large south-wall location panel no longer displays a map thumbnail. It is
an environment-independent battle archive monitor backed by the canonical
featured-shot registry. A small shader performs the vertical image scroll and
CRT treatment without per-frame texture uploads. It holds two image textures
only during a transition, disposes the outgoing texture immediately afterward,
and schedules no timer while the Garage root is detached for battle.

## Consequences

- The Garage access layer and optional runtime share one public contract.
- New non-vehicle workshop props must be a registered workshop part kind.
- Vehicle exhibits must come from the first-party fleet factory and reuse
  already-built rigs when only a turret or gun display is required.
- The default Verdant scene is append-only: new garage features may surround
  it, but cannot replace or reposition its original repair set pieces.
- Garage interiors must not use their associated battlefield thumbnails as
  wall decoration; the shared archive screen is the only photographic panel.
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
