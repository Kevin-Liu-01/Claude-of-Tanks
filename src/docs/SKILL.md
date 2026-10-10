---
name: src-docs-skill
description: Maintain the public field manual, indexed topic pages, typed icons, and battle-reel interactions.
---

# claude-of-tanks / src/docs

## Purpose
<!-- agent-docs:fill:purpose -->
Explain the shipped game through lightweight public HTML pages and real
game-rendered evidence, without booting the playable world.

## Mental model & key files
<!-- agent-docs:fill:model -->
`docs.ts` owns manual navigation, copy feedback, and archive interaction.
`topics.ts` owns topic order, content, section/media definitions, and rendering.
`docsIcons.ts` maps manual concepts to the shared typed icon vocabulary.
`battleReels.ts` owns selectable recorded battle clips; `docs.css` styles the
manual. `site/docs.html` and `site/docs-*.html` are the corresponding page entries.
`filming.ts` fills the Filming manual's second and third sections with the take
viewer (each take at every stage of the media rounds) and the process; its media
is `public/media/filming-r1`, built by `tools/media-r5/docs-media.mjs`, and
`filming.selftest.mjs` holds the viewer, the manifest and the page's numbers to
the pipeline.

## Patterns to follow / invariants
<!-- agent-docs:fill:patterns -->

- Keep topic IDs, indexed HTML entries, navigation, section icons, and media
  anchors in sync; public explanations must match current implementation.
- Use packaged, attributable media and descriptive captions. A staged capture
  is evidence of that scene, not proof of gameplay or performance claims.
- Preserve keyboard navigation, focus, ARIA state, and narrow-screen topic
  access. Pause archive motion when its dialog closes.
- Keep archive/recipe implementation demand-loaded and heavy game modules out
  of the manual graph. Share public presentation helpers instead of copying them.

## Common tasks → first action
<!-- agent-docs:fill:tasks -->

- Add/update a topic: inspect `topics.ts` and its HTML entry in `site/`; run
  `node src/docs/topics.selftest.mjs`.
- Icons or reels: run `docsIcons.selftest.mjs` or `battleReels.selftest.mjs`.
- Shared navigation, metadata, or media loading: read
  `src/presentation/SKILL.md` and run its related selftests.
- Visible layout changes: inspect desktop and narrow-screen pages through
  the established browser workflow after the focused tests.

## Gotchas
<!-- agent-docs:fill:gotchas -->
This directory is public application code, not the repository's engineering
`docs/` directory. Updating topic data alone does not create an indexed route;
entry HTML, route/build configuration, navigation, and metadata must agree.
