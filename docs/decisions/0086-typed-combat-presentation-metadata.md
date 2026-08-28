# ADR 0086: Combat presentation metadata is strict TypeScript

- Status: accepted
- Date: 2026-08-27

## Context

Module vocabulary, crew labels, Garage dossier rows, hit-event copy, and
schematic impact projection are shared by the simulation, HUD, Garage,
killcam, shot report, gallery, and fleet validation. Their JavaScript shapes
were implicit even after the surrounding lifecycle owners became typed.

## Decision

Move the canonical metadata and pure projection owners to strict TypeScript:

- `src/sim/moduleCatalog.ts`
- `src/ui/moduleRegistry.ts`
- `src/ui/garageDossier.ts`
- `src/ui/hitEventFormat.ts`
- `src/ui/shotDiagramProjection.ts`

Define closed module and crew identifiers where the vocabulary is canonical,
and narrow structural interfaces for the presentation fields consumed from a
vehicle spec or resolved hit. Preserve all labels, ordering, SVG coordinates,
penetration lookup behavior, special-action copy, and projection math.

No `any`, `@ts-ignore`, or `@ts-nocheck` escape hatch is introduced.

## Consequences

- Simulation and presentation now consume one checked module vocabulary.
- Killcam and shot-report diagrams share a checked event/projection contract.
- Garage technical cards expose stable row and special-system shapes.
- The runtime JavaScript inventory falls by five modules and about 400 lines.

## Verification

    npm run typecheck
    node src/ui/garageDossier.selftest.mjs
    node src/ui/hitEventFormat.selftest.mjs
    node src/ui/shotDiagramProjection.selftest.mjs
    node src/gallery/overlays.selftest.mjs
    node src/vehicles/fleetBalance.selftest.mjs
    npm run build
