---
name: src-ui-skill
description: Work on garage, HUD, settings, mobile controls, transitions, and battle presentation UI.
---

# claude-of-tanks / src/ui

## Purpose
<!-- agent-docs:fill:purpose -->
Present game and session state with fast, legible desktop/mobile interactions.

## Mental model & key files
<!-- agent-docs:fill:model -->
`garage.js` owns roster/loadout presentation; `playMenu.ts` owns direct Solo,
Private, LAN, and Ranked deployment; `networkStatus.ts` owns reconnect feedback;
`hud.js` owns live battle chrome; `minimapAssetRuntime.ts` owns baked-map load
coalescing, stale-world rejection, and the procedural cartography fallback;
`perfHud.ts` owns the lazy typed diagnostics surface and its bounded 4 Hz DOM
paint;
`settings.js` and `touchControls.js` own input-facing UI; `transition.ts`,
`battleLoad.ts`, and `endScreen.js` own flow beats.

## Patterns to follow / invariants
<!-- agent-docs:fill:patterns -->
Consume canonical state rather than duplicating policy. Keep large/high-cost
screens lazy. Preserve large touch targets and test desktop plus mobile. Baked
minimap requests must pass through `minimapAssetRuntime.ts`; keep active-world
and prepared-service checks at the asynchronous completion edge.
Decorative metadata such as repository stars must render a release-verified
local value first, then refresh only through a bounded same-origin cache. Never
make boot or Garage presentation depend on a third-party request.
Shared DOM, font, generated-icon, image-preload, featured-media, and map-art
primitives are strict TypeScript owners. Extend their exported contracts rather
than creating screen-local unchecked copies.
The public and Studio capture gallery shares `presentation/mediaArchive.ts`;
keep manifest transfer lazy, pagination bounded, and lightbox cleanup explicit.
`presentation/publicPages.ts` owns typed, save-data-aware hero, screenshot-rail,
deferred-image, and viewport-video lifecycles outside the game runtime.
`presentation/publicNav.ts` owns the responsive public navigation lifecycle;
`presentation/captureRecipes.ts` owns typed lazy recipe lookup for docs and
capture galleries. The top-level public presentation runtime contains no JS.
The technical manual runtime in `src/docs/` is also strict TypeScript: topics,
archive motion, copy controls, and battle reels remain public-entry-only code.
The reusable accessible dialog lifecycle, focus trap, dismissal guard, and body
scroll ownership live in `modal.ts`; feature panels only own dialog content.
Rich contextual dossiers, live image resolution, and JSON-copy controls live in
`contextInfo.ts` and compose the shared modal instead of inventing popovers.
Private/LAN battle chat parsing, keyboard capture, pointer-lock restoration,
bounded history, and DOM lifetime live in `roomChat.ts`.
Keep browser-independent presentation policy in the typed keyboard, glyph,
flag, minimap, telemetry, spectator, preview, and ordering modules so the large
screen renderers do not redeclare those rules.

## Common tasks → first action
<!-- agent-docs:fill:tasks -->
Inspect the live rendered surface, locate event/callback ownership, change the
smallest screen module, then run its selftest and browser verification.

## Gotchas
<!-- agent-docs:fill:gotchas -->
Garage and shared responsive styles are static Vite-managed CSS imported in
responsive-before-Garage cascade order by `src/main.ts`. Do not move them back
into JavaScript or reverse that order. Avoid boot-critical imports and do not
leave XP/currency labels after progression removal.
