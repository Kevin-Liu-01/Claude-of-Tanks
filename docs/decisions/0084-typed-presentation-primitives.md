# ADR 0084: Shared presentation primitives are strict TypeScript

- Status: accepted
- Date: 2026-08-27

## Context

The typed boot, battle-loading, responsive, and transition owners still
depended on unchecked JavaScript helpers for DOM construction, typography,
generated icon URLs, image request coalescing, repository metadata, featured
captures, map art, and vehicle tier labels. Those small modules are imported
widely, so leaving their contracts implicit weakened every typed screen above
them and made generated asset paths easy to drift.

## Decision

Move the existing shared primitives to strict TypeScript in place:

- `src/ui/dom.ts`
- `src/ui/fonts.ts`
- `src/ui/icons.ts`
- `src/ui/equipIcons.ts`
- `src/ui/imagePreload.ts`
- `src/ui/githubStars.ts`
- `src/ui/featuredShots.ts`
- `src/ui/mapThumbs.ts`
- `src/vehicles/tier.ts`

The migration defines concrete DOM, image-priority, featured-shot, cache,
equipment-glyph, and metadata contracts. It preserves URLs, SVG paths, CSS,
animation inputs, cache ownership, fallback values, gallery order, and tier
data. Headless compatibility is part of the contract: helpers use structural
browser capability checks rather than assuming every Node test shim exposes
DOM constructors.

The map-thumbnail generator now writes the typed canonical module so a future
regeneration cannot silently recreate the deleted JavaScript owner. No `any`,
`@ts-ignore`, or `@ts-nocheck` escape hatch is introduced.

## Consequences

- Typed UI-flow owners now depend on checked primitives end to end.
- Gallery, Garage, HUD, Studio, killcam, and tooling share the same checked
  asset and metadata contracts during the incremental migration.
- The runtime JavaScript inventory falls by nine modules and about 710 lines.
- Remaining UI owners can migrate without redeclaring these cross-screen
  shapes.

## Verification

    npm run typecheck
    node src/ui/dom.selftest.mjs
    node src/ui/imagePreload.selftest.mjs
    node src/ui/icons.selftest.mjs
    node src/ui/loadingScreens.selftest.mjs
    node src/presentation/publicNav.selftest.mjs
    node src/vehicles/tier.selftest.mjs
    node src/vehicles/fleetBalance.selftest.mjs
    npm run build
