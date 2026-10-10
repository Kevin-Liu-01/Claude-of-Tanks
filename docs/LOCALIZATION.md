# Localization

Claude of Tanks ships English (`en-US`) and Simplified Chinese (`zh-CN`). The
public URL alias for Chinese is `/cn`: `/cn/`, `/cn/home`, `/cn/gallery`,
`/cn/studio`, `/cn/docs`, and every indexed `/cn/docs/*` topic are first-class
routes. The alias is intentionally shorter than the canonical locale code;
HTML `lang`, Open Graph locale, Intl formatting, and hreflang use `zh-CN`.

The language control is available in the shared public navigation, directly in
the Garage navigation (or its compact menu), and under **Settings → Language**.
The selection is stored as `cot.locale`.
Resolution follows explicit URL prefix, saved selection, supported browser
language, then `en-US`. Switching language keeps the current route, query, and
hash while adding or removing `/cn`.

## Current support

The checked-in catalogs contain the same 3,040 keys. Coverage includes the boot
flow, Garage, Settings, equipment, loading screens, battle HUD, killcam and
results, private/LAN room controls, Tank Gallery, Scene Studio, and the public
documentation surfaces. Route-specific titles, descriptions, Open Graph data,
private-room invitation metadata, canonical links, alternate-language links,
the XML sitemap, number/date formatting, and document language also follow the
active locale.

Changing the language navigates to the matching locale route and reloads the
current page. Most game screens are assembled once, so the reload is
intentional: it guarantees one language across the whole surface instead of
leaving stale labels in an already-created Garage or battle. Public links are
localized both when mounted and at click time, covering late-rendered manual
topics as well as static navigation. Unknown `/cn/*` documents retain a real
localized HTTP 404 response.

The following content intentionally remains source-language content:

- player names, room chat, imported Studio content, and other user-authored text;
- nation abbreviations, map names, shell designations, and other proper or
  technical names;
- developer diagnostics, logs, test output, and source code;
- media alternative text that does not already share a translated visible
  label; this remains an accessibility follow-up for the first Chinese release;
- vehicle designations and established product names such as Claude of Tanks,
  Tank Gallery, and Scene Studio where translating the name would be misleading.

## Runtime ownership

- `src/ui/i18n.ts` owns locale detection, persistence, interpolation, events,
  document language, and `Intl` formatting.
- `src/ui/i18nDictionaries.ts` holds the dictionaries the document has loaded
  and ships no catalog itself (see "Page catalogs" below).
- `src/ui/localeRouting.ts` owns the `/cn` alias, route manifest, localized
  links, redirects, and route preservation.
- `src/ui/i18nCatalog.en-US.json` is the source catalog.
- `src/ui/i18nCatalog.zh-CN.json` is the reviewed Simplified Chinese catalog.
- `src/ui/i18nCatalog.en-US.metadata.json` supplies General Translation with
  per-key terminology and placeholder context for discovery and invitation copy.
- `src/ui/i18nCatalog.ts` registers both full catalogs for server and build-time
  code (the middleware, the Vite config, the page generator, receipts); browser
  code never imports it.
- `src/presentation/staticI18n.ts` translates static public-page text and
  attributes. `data-i18n-html` is restricted to source-controlled rich copy.
- `src/presentation/localizedHtml.ts` owns crawl-time language, route metadata,
  canonical/hreflang, Open Graph locale, and JSON-LD route localization.
- `tools/generate-localized-pages.mjs` materializes the `/cn` HTML shells after
  every build; `tools/generate-locale-sitemap.mjs` owns the paired sitemap graph.

## Page catalogs

Each document loads only the catalog it needs. Every HTML entry declares one with
`<meta name="cot-i18n-catalog" content="…">`: the game (`index.html`) declares
`game` and loads the full catalogs (`i18nCatalogEnUS.ts`, and
`i18nCatalogZhCN.ts` on demand); the public pages declare `home`, `docs`,
`docsTopic` (the twelve manual topics and their fallback share one), `notFound`
and `gallery`. The i18n runtime awaits the document's English dictionary and its
boot locale before any module that imports it evaluates, so `t()` stays
synchronous. English is every lookup's fallback: if its chunk fails the page
stops as if a static chunk had failed, while a failed Chinese chunk degrades to
English. Node (servers, tools, receipts) keeps the full English catalog resident.

`tools/i18n-page-catalogs.mjs` derives a page catalog from real usage: every
catalog key that the declaring pages' module scripts, and everything they import
statically or through a literal `import()`, spell as a string literal, a key
prefix ending in `.`, or a template that starts with a key namespace
(`` `docs.guide.${slug}.t` ``), plus the pages' `data-i18n` markup and key strings
in imported JSON. A page boots on the keys of its boot graph (its scripts, their
static imports and its markup); the further keys that only modules it reaches
through a literal `import()` can show are its lazy catalog, and every page boots
on less than a quarter of the keys. `tools/viteI18nPageCatalogs.ts` builds a
chunk per page catalog and locale, and a lazy chunk where the page has lazy
keys; it names them on the page's meta (`data-en-us`, `data-zh-cn`,
`data-en-us-lazy`, `data-zh-cn-lazy`), preloads the English chunk, prefetches the
English lazy one and points the `/cn/` preload at the Chinese one. Each literal
`import()` of a module whose graph can show a lazy key is rewritten to load the
lazy chunk first (`loadLazyCatalog` in `src/ui/i18nDictionaries.ts`, reached
through `globalThis.__cotI18nLazy`), so the module's strings are resident when it
evaluates; a document without a lazy chunk, such as the game, passes straight
through. The dev server serves a page's boot and lazy keys as one subset from
`/@cot-i18n/` and rewrites nothing. The locale runtime, static-markup
localization and responsive layout share one boot chunk so every page keeps its
request count.

A way for a public page to show a raw key fails the build and
`tools/i18n-page-catalogs.selftest.mjs`: a `t()` key template or concatenation
without a leading namespace (`` t(`${area}.title`) ``), a literal or `data-i18n`
key the catalog lacks, a computed `import()` or `import.meta.glob` in a page's
graph, a re-export of `t`, or an HTML entry without a catalog. A key passed to
`t()` as a value (`t(row.labelKey)`) must be spelled as a literal somewhere in
the page's graph. Check a change with:

```bash
node tools/i18n-page-catalogs.mjs --check
```

A new public page declares its catalog in its HTML; nothing else is listed by
hand.

Vercel routing middleware uses the Node.js runtime because its legacy Edge
bundler rejects the JSON import attributes used by the catalogs. Deployment
transpilation uses the TypeScript 6 compatibility API and rewrites relative
`.ts` imports to `.js`; project typechecking remains on native TypeScript 7.
`tools/typescriptToolchain.selftest.mjs` guards these separate toolchain roles.

## General Translation workflow

The repository is bound to its General Translation project through
`gt.config.json`. The official `gt` CLI translates the local JSON catalog,
preserves reviewed local corrections with `options.saveLocal`, supplies keyed
translation context, and requires review. The runtime still loads local JSON,
so production UI does not depend on a translation network request and never
receives a translation API key.

```bash
npm run i18n:validate
GT_API_KEY=... GT_PROJECT_ID=... npm run i18n:translate
npm run i18n:check
```

`i18n:validate` runs `gt translate --dry-run`, the supported offline parser for
this base JSON project, then checks catalog parity, placeholders, rich-markup
parity, static-page bindings, the route/metadata graph, sitemap freshness, and
the GT enforcement contract. The framework-inline-only `gt validate` command
is deliberately not used because GT does not register it for base projects.

`i18n:translate` updates the locale files through General Translation and saves
reviewed local corrections back to the platform. To enforce human approval,
disable **Auto approve translations** in the General Translation project
dashboard; `requiresReview` cannot override that dashboard switch. Credentials
belong in process environment variables—never in `gt.config.json`, browser
code, documentation, generated HTML, or committed `.env` files.

All three build entry points run `i18n:validate` as a prebuild gate,
and `.github/workflows/localization.yml` runs `i18n:check` for pull requests and
pushes to `main`. A catalog, route, sitemap, project binding, secret boundary,
or GT CLI drift therefore fails before deployment.

Before merging translated copy, run:

```bash
npm run i18n:check
npm run typecheck
npm run build
```

`i18n:check` also fails on likely hard-coded, user-visible English strings in
the typed UI source, and on any way for a public page to show a raw key (see
"Page catalogs"). Review Chinese at desktop and compact widths after any
large copy update; key parity does not prove layout quality.
