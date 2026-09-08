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
`mediaArchive.ts` renders the packaged showcase manifest and lightbox;
`captureRecipes.ts` links media to reproducible Scene Studio recipes.
Adjacent selftests also cover root public HTML, SEO metadata, copy, analytics,
and loading policy; those contracts extend beyond this directory.

## Patterns to follow / invariants
<!-- agent-docs:fill:patterns -->

- Preserve public/game bundle isolation and lazy archive/recipe loading.
- Respect reduced motion, data-saving preferences, compact layouts, and
  document visibility when deciding autoplay and source retention.
- Keep near-viewport transfer separate from actual visible playback; retain
  media briefly across scroll reversals to avoid repeated downloads/decodes.
- Keep navigation keyboard-accessible with accurate ARIA state and focus
  restoration. Reuse the shared responsive layout owner.
- Keep media paths, manifest entries, alt text, recipes, and attribution aligned.
  Preserve self-hosted telemetry opt-out and locally packaged subresources.

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
