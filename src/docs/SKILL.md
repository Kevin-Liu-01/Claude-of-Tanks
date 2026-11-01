---
name: src-docs-skill
description: Maintain the public field manual, indexed topic pages, typed icons, and battle-reel interactions.
---

# claude-of-tanks / src/docs

## Purpose
<!-- agent-docs:fill:purpose -->
Explain the shipped game through lightweight public HTML pages and real
game-rendered evidence, without booting the playable world: the Field Manual's
index (`/docs`) and its fifteen chapters on two shelves (Play, Behind the game),
in English and, under `/cn`, Chinese.

## Mental model & key files
<!-- agent-docs:fill:model -->
- `topics.ts` owns the chapters: `TOPIC_ORDER` and `TOPIC_GROUPS` (the two
  shelves, task-first), each chapter's label, title, lede and hero take, the
  text chapters' sections and figures, and the chapter page's markup
  (`topicPageMarkup`: shelf rail, search, banner, article, on-this-page, pager).
  A chapter with `rich: true` has no sections of its own: it is data-built.
- `chapters/` holds the data-built chapters (Node only; `index.ts` registers each
  builder). A builder returns `RichSection[]` from the game's own tables and
  catalogs — the fleet (`fleet.ts`, rows read tool-side by
  `tools/docsFleetTable.ts`), the sim's constants, the mode rules, the room
  protocol, the audio tables, the Studio's lists — and never retypes a number.
  `charts.ts` draws the SVG line charts; `chapters.css` styles these pages only.
- `tools/docs-prerender.mjs` is the only writer of the generated files: each
  chapter's `<main id="topicRoot">` in `site/docs-<slug>.html`, the Chinese
  markup in `topicPrerender.zh-CN.json` (applied to the `/cn` pages at build by
  `src/presentation/localizedHtml.ts`), the search indexes
  `searchIndex.<locale>.json`, and the index's chapter map between
  `<!--docs:map-->` markers in `site/docs.html`.
- `docs.ts` runs the index (search mount, the archive dialog, which loads
  `mediaArchive.ts` and its sheet on the click, the battle reels).
  `docsSearch.ts` searches the prebuilt index (Cmd K / Ctrl K); the 404 reuses
  its `entriesOf()` and `searchManual()`. `reference.ts` mounts the tanks
  chapter's fleet reference from `reference.generated.json`
  (`tools/generate-manual-reference.mjs`); `referenceTakes.ts` gives each record
  its take. `battleReels.ts` owns the index's reels (names resolve on read and
  follow the catalog when it lands); `docsIcons.ts` maps concepts to the sprite;
  `filming.ts` fills the Filming chapter's take viewer
  (`public/media/filming-r1`, `tools/media-r5/docs-media.mjs`).
- Media: hero loops from `public/media/site50-r14/loops` with their rungs in
  `TOPIC_HERO_RUNGS` (960 and phone); figures from `public/media/docs-r1`
  (its `manifest.json`); a figure that is not 1920x1080 needs a
  `TOPIC_FIGURE_SIZES` row (`tools/media-fallback.selftest.mjs` reads headers).

## Patterns to follow / invariants
<!-- agent-docs:fill:patterns -->
- The chapters say what the code does: read constants, tables and catalog names
  from their owners, pass numbers through catalog templates, and keep both
  catalogs in step (no English in the Chinese pages; names, codes and key caps
  stay as written).
- After a change to a chapter, its copy or a table it reads, run
  `node tools/docs-prerender.mjs --write` and commit what it rewrites
  (`site/docs-*.html`, `site/docs.html`'s map, `topicPrerender.zh-CN.json`,
  `searchIndex.*.json`); without `--write` it exits 1 naming stale files.
- Keep each page's first paint to its own sheet and the banner or hero poster
  (eager, `fetchpriority=high`); everything else waits for its boundary. Size
  every figure, and name a loop hero's picture by its take.
- Keyboard and screen readers: the skip link lands on `.dm-main#main`; focus
  shows a 2px accent outline; element colour resets sit in `@layer base`
  (`tools/surface-element-resets.selftest.mjs`), never in `surfaces`.
- Keep archive and recipe code demand-loaded and the game's module graph out of
  the manual. Share public presentation helpers instead of copying them.

## Common tasks → first action
<!-- agent-docs:fill:tasks -->
- Add a chapter: a `topics.ts` entry (in `TOPIC_ORDER` and a group; `rich: true`
  with a builder in `chapters/` registered in `chapters/index.ts` if it is
  data-built), `site/docs-<slug>.html` from `site/docs-topic.html`, its Vite
  input and `optimizeDeps.entries` line (`vite.config.ts`), the `vercel.json`
  rewrite lists and `PUBLIC_ROUTE_RECORDS` (`src/ui/localeRouting.ts`), the copy
  in both catalogs, then the prerender. Run `topics`, `chapters`,
  `tools/vercel-routes`, `seoMetadata` and `tools/i18n-page-catalogs` selftests.
- Change copy or a chart: edit the catalogs or the builder, prerender, then
  `node src/docs/chapters/chapters.selftest.mjs` and `topics.selftest.mjs`.
- Search, icons, reels, reference: `docsSearch`, `docsIcons`, `battleReels`,
  `referenceTakes` and `tools/generate-manual-reference` selftests.
- Media: `tools/media-fallback`, `tools/media-freshness` and
  `tools/media-r5/site-video-budget` selftests; the reels' static caption and
  the hero takes are wired by `tools/media-r5/site-media-wire.mjs`.
- Visible layout: render desktop and phone, en and `/cn`, from a static build
  (`node tools/vercel-static-preview.mjs --dist=dist`) after the focused tests.

## Gotchas
<!-- agent-docs:fill:gotchas -->
This directory is public application code, not the repository's engineering
`docs/` directory. `chapters/*.ts` read files through `node:fs`: never import
them from a page module. The prerendered blocks are generated — a hand edit is
overwritten, and a stale `topicPrerender.zh-CN.json` ships stale Chinese.
Retired chapters (vehicles, worlds, interface, performance) answer 308 to their
successors in `vercel.json`. Do not name the tank asset manifest (`public/icons/tank-assets/`)
from `src/` (`tools/tool-only-public-files.selftest.mjs`); a catalog change renames
the hashed chunks a page imports, so compressed bundle rows move by a few bytes
with identical raw size.
