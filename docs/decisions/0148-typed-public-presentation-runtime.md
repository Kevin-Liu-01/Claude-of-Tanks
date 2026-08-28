# 0148: Public presentation runtime is strict TypeScript

## Status

Accepted — 2026-08-28

## Decision

The complete `src/presentation/` browser runtime is strict TypeScript.
`publicNav.ts` owns mobile-menu focus, dismissal, and responsive behavior;
`captureRecipes.ts` owns normalized lazy recipe lookup; `publicPages.ts` and
`mediaArchive.ts` own the media lifecycles described by ADRs 0146–0147.

Every public HTML entry now references the typed navigation module directly.
These modules remain independent entry points and do not join the game or
Garage JavaScript graph.

## Consequences

- The public presentation layer has no remaining unchecked JavaScript runtime.
- Mobile navigation and recipe manifests fail at typed boundaries.
- Landing, docs, gallery, and game bundle residency remain separated.
