# ADR 0083: Boot and transition UI have strict typed contracts

- Status: accepted
- Date: 2026-08-28

## Context

The responsive layout contract, boot screen, pre-battle loading screen, and
shared state-transition veil were stable runtime owners, but their JavaScript
implementations left DOM requirements, roster rows, progress callbacks, and
viewport classification implicit. They sit on first-visit and battle-entry
paths, so a rename without strict checking would hide exactly the nullability
and sequencing failures the migration is intended to prevent.

## Decision

Move the five existing owners to strict TypeScript in place:

- `src/ui/responsiveLayout.ts`
- `src/ui/responsiveSurfaces.css`
- `src/ui/bootScreen.ts`
- `src/ui/battleLoad.ts`
- `src/ui/transition.ts`

Each module exposes its real caller contract. Required generated DOM nodes are
validated once at construction; optional inline boot nodes remain optional so
stripped and test documents retain the existing no-op behavior. Transition
work remains generic, roster rows are readonly data, and viewport state uses a
closed semantic union rather than stringly typed device guesses.

The markup, CSS, animation timings, loading weights, image policy, and runtime
call order are unchanged. The responsive rules later moved unchanged to a
Vite-managed stylesheet under ADR 0114. No `any`, `@ts-ignore`, or
`@ts-nocheck` escape hatch is introduced.

## Consequences

- First-visit and battle-entry surfaces are compiler-checked through their
  actual public interfaces.
- JavaScript and TypeScript callers use explicit `.ts` source imports while
  the repository remains in the incremental migration period.
- The runtime JavaScript inventory falls by five modules and roughly 1,880
  lines without adding a wrapper or parallel implementation.
- Remaining UI owners can migrate against stable viewport and transition
  contracts instead of redeclaring their shapes.

## Verification

    npm run typecheck
    node src/ui/responsiveLayout.selftest.mjs
    node src/ui/mobileLayout.selftest.mjs
    node src/ui/loadingScreens.selftest.mjs
    node src/game/killcamPresentation.selftest.mjs
    npm test
    npm run build

Browser verification must confirm a fresh Garage boot, an immediately covering
battle-loading screen, and a completed loading-screen exit into live battle
without a Vite overlay or console error.
