---
name: src-presentation-skill
description: Maintain lightweight public navigation, media loading, archive presentation, and public-site contracts.
---

# claude-of-tanks / src/presentation

## Purpose
<!-- agent-docs:fill:purpose -->
Present the game on public landing/manual/gallery surfaces without importing
the heavy game boot graph. Preserve accessible browsing and restrained media cost.

## Mental model & key files
<!-- agent-docs:fill:model -->
`publicNav.ts` and its CSS own responsive public navigation and deferred star
counts. `publicPages.ts` coordinates hero/shot rails and viewport media loading.
`home.css` is the landing's stylesheet in the Vite graph (hashed under
`/assets/`, cached immutably); every public stylesheet lays out at first paint
from media queries at `responsiveLayout.ts`'s band edges, never the
`body[data-cot-*]` hooks the boot module writes after it runs
(`src/ui/viewportQueries.test-support.mjs`, checked by `mobileLayout.selftest.mjs`).
`mediaArchive.ts` renders the packaged showcase manifest and lightbox;
`captureRecipes.ts` links media to reproducible Scene Studio recipes.
Adjacent selftests also cover root public HTML, SEO metadata, copy, analytics,
and loading policy; those contracts extend beyond this directory.

## Patterns to follow / invariants
<!-- agent-docs:fill:patterns -->

- Preserve public/game bundle isolation and lazy archive/recipe loading.
- Every public HTML entry declares its page catalog
  (`<meta name="cot-i18n-catalog">`); keep `node tools/i18n-page-catalogs.mjs
  --check` clean when adding a page or a key pattern (docs/LOCALIZATION.md
  "Page catalogs").
- Respect reduced motion, data-saving preferences, compact layouts, and
  document visibility when deciding autoplay and source retention.
- Keep near-viewport transfer separate from actual visible playback; retain
  media briefly across scroll reversals to avoid repeated downloads/decodes.
- Keep navigation keyboard-accessible with accurate ARIA state and focus
  restoration. Reuse the shared responsive layout owner.
- Keep media paths, manifest entries, alt text, recipes, and attribution aligned.
  Preserve self-hosted telemetry opt-out and locally packaged subresources.
- GA4 (`src/googleAnalytics.ts`) reaches only the public non-game pages,
  lazily after idle through `src/analytics.ts` and the 404 runtime; it never
  reaches the game entry. It sends from the production host only, queues
  Consent Mode first, and strips query strings. `analytics.selftest.mjs`
  enforces all of this.

## Common tasks → first action
<!-- agent-docs:fill:tasks -->

- Navigation: inspect `publicNav.ts` plus affected root HTML, then run
  `node src/presentation/publicNav.selftest.mjs`.
- Loading/motion: run `publicLoading.selftest.mjs`; use the established browser
  workflow to verify viewport entry/exit and reduced-motion behavior.
- Public copy or discovery: run `publicCopy.selftest.mjs`,
  `seoMetadata.selftest.mjs`, and `analytics.selftest.mjs` as applicable.
- Archive changes: inspect the packaged manifest and recipe mappings before
  changing cards, filters, or their shared manual integration.

## Gotchas
<!-- agent-docs:fill:gotchas -->
Passing a source-contract selftest does not prove the responsive pixels or
media playback lifecycle. Do not eagerly fetch the complete archive on the
landing page or import `src/main.ts` to obtain public product information.
