# 0259 — The procedural Garage stage has a strict TypeScript owner

Status: accepted

## Decision

`src/ui/garageStage.ts` owns the deterministic procedural hangar presented
behind the vehicle carousel. Its strict contracts cover canvas painting,
texture settings, dimensioned track-scuff lanes, engine shadow setup, tracked
GPU resources, the scene group, environment switching, architecture metrics,
and disposal.

All callers now import the TypeScript owner directly. The migration preserves
the complete geometry, texture recipes, lighting, material values, variant
behavior, and initial Garage load boundary.

## Consequences

- Canvas context availability is validated once at creation rather than
  surfacing as an unrelated null dereference during painting.
- Every tracked texture, material, and geometry carries an explicit disposal
  contract.
- The composition root and optional dressing owner share typed texture helpers
  without duplicating the stage implementation.

## Verification

    npm run typecheck
    node src/ui/garageArchitecture.selftest.mjs
    node src/game/garageVariants.selftest.mjs
    node src/game/garageDressingLifecycle.selftest.mjs
    node src/game/garagePedestalRuntime.selftest.mjs
    node tools/local-import-integrity.selftest.mjs
    node tools/public-repo-hygiene.selftest.mjs
    npm run build
