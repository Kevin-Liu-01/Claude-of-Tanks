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
