# Public page entries

This directory owns the homepage, Tank Gallery and field-manual HTML entries.
Public addresses remain `/home`, `/gallery`, `/docs` and `/docs/<topic>`, with
Simplified Chinese equivalents under `/cn`. Legacy `.html` links still work.

- Page behavior and styles: `src/presentation/`, `src/gallery/`, `src/docs/`.
- Text: paired `src/ui/i18nCatalog.en-US.json` and `.zh-CN.json` catalogs.
- Routes: `src/ui/localeRouting.ts`; dev and output mapping: `vite.config.ts`.
- The build flattens these HTML entries into the output root, preserving host
  rewrites and localized-page generation. Source folders are not public URLs.
- Keep game `index.html`, host `404.html`, package/config files and legal notices
  at the repository root. Add public pages here rather than scattering entries.

Use the existing approved media and map pictures. New promotional material is
owner-directed. Update the relevant public-page tests when adding a route.

## Verify the published page layout

After `npm run build`, serve the output with `npx vite preview --port 5205`
and run `node tools/manual-reference.browser.mjs --url=http://127.0.0.1:5205`.
The committed browser check covers English and Chinese references, search,
desktop and both phone orientations, and legacy page URLs. It requires a local
Playwright installation; `--playwright-module=<absolute-module-path>` can use
an existing tool runtime. Save captures with `--out=.qa-dev/manual-browser`.

Custom dropdown keyboard and pointer behavior is checked by
`tools/custom-select.browser.mjs`. Garage and battle layout probes remain
`tools/mobile-surfaces.browser.mjs`,
`tools/battle-hud-layout.browser.mjs`, and `tools/battle-load-layout.browser.mjs`.
They exercise the actual UI owners in fixtures, including rotation and crowded
rosters; native gameplay and graphics checks are separate.
