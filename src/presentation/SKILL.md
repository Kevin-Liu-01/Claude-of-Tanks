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
counts. `publicPages.ts` coordinates hero/shot rails, mounts the page's videos
through the shared player and owns the Play hand-off. `mediaPlayer.ts` is the
site's one playback policy (brand-ui SPEC 8.3: near-margin source, 50/10
visibility, 10 s release, one transfer at a time, 2 desktop / 1 phone, 150 ms
hover, AV1 → VP9 → H.264, nothing by itself under reduced motion or data
saving, `abortPageMedia` before navigating into the game); the fleet takes,
the topic headers and the Filming viewer use it too. `responsivePicture.ts`
writes stills with rungs, sizes, explicit size, LQIP/tone and the 640 rung
under data saving. Both import nothing and never enter the game's boot graph.
`home.css` is the landing's stylesheet in the Vite graph (hashed under
`/assets/`, cached immutably); every public stylesheet lays out at first paint
from media queries at `responsiveLayout.ts`'s band edges, never the
`body[data-cot-*]` hooks the boot module writes after it runs
(`src/ui/viewportQueries.test-support.mjs`, checked by `mobileLayout.selftest.mjs`).
`mediaArchive.ts` renders the packaged showcase manifest and lightbox;
`captureRecipes.ts` links media to reproducible Scene Studio recipes.
`publicShell.ts` renders the public site's one bar and footer; `tools/public-shell.mjs`
writes them, with the inline symbol block, into every public entry (or checks
that each carries exactly that). The landing's blocks between `<!--home:NAME-->`
markers come from `tools/home-premiere.mjs` (run the shell writer after it); the
404 (`notFound.ts`) searches the fleet and the manual's prebuilt index
(`src/docs/docsSearch.ts`). `localizedHtml.ts` makes each `/cn` document at build:
the data-i18n hosts in Chinese, the manual's prerendered chapters
(`src/docs/topicPrerender.zh-CN.json`), body links kept under `/cn`
(`localizeLinks`; hreflang links untouched), the zh-CN type floor
(`src/ui/zhTypeFloor.ts`) and the localized structured data. It also writes every
public page's share clip (`og:video`, its family's from `shareVideoForRoute` in
`siteMetadata.ts`) with `og:type` `video.other`, in both languages; heads name none.
`node tools/share-tags.mjs [--dist=dist] [--json]` lists every page's og:* and
twitter:* tags as a build serves them (diff two builds' lists to review a change).
Adjacent selftests also cover root public HTML, SEO metadata, copy, analytics,
and loading policy; those contracts extend beyond this directory.

## Patterns to follow / invariants
<!-- agent-docs:fill:patterns -->

- Preserve public/game bundle isolation and lazy archive/recipe loading: a sheet
  only a dialog or a wall uses loads with its module at that boundary, never as a
  head `<link>` (the manual's archive sheet, 247).
- The bar and footer are generated: change `publicShell.ts`, then
  `node tools/public-shell.mjs --write`; landing blocks: `node tools/home-premiere.mjs --write`.
- Element colour resets (`a`, `button`, form controls) belong in `@layer base`; in
  `surfaces` they outrank every component's colour (the primary buttons' dark ink).
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
- Loading/motion: run `publicLoading.selftest.mjs`, `mediaPlayer.selftest.mjs`
  and `responsivePicture.selftest.mjs`; the media receipts are
  `tools/media-fallback`, `media-freshness`, `media-page-unique` and
  `media-r5/site-video-budget` (`*.selftest.mjs`); after `npm run build`,
  `npm run media:motion-savedata` proves zero video bytes under reduced motion
  and Save-Data and the Play hand-off in a real browser.
- New media on a page: a `<video data-media-player>` lists `<source data-src
  type [data-rung=phone|wide]>` in ladder order (AV1, VP9, H.264) with
  `data-poster`; a retiring collection goes in media-freshness's RETIRING with
  the replacement that ends it.
- Public copy or discovery: run `publicCopy.selftest.mjs`,
  `seoMetadata.selftest.mjs`, and `analytics.selftest.mjs` as applicable.
- Archive changes: inspect the packaged manifest and recipe mappings before
  changing cards, filters, or their shared manual integration.

## Gotchas
<!-- agent-docs:fill:gotchas -->
Passing a source-contract selftest does not prove the responsive pixels or
media playback lifecycle. The player rides in the fleet takes' chunk
(vite.config.ts group): as its own chunk it adds an entry to the game entry's
preload list; keep it import-free. Do not eagerly fetch the complete archive on the
landing page or import `src/main.ts` to obtain public product information.
`backdrop-filter` (and `transform`, `filter`) on the bar makes it the containing
block of its `position:fixed` descendants: the phone menu sized itself to the
56 px bar until the bar dropped its blur while the menu is open (`publicNav.css`).
