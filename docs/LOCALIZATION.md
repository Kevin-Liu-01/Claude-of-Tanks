# Localization

Claude of Tanks ships English (`en-US`) and Simplified Chinese (`zh-CN`) UI.
The Garage language selector is under **Settings → Graphics → Language**. The
selection is stored as `cot.locale`; first-time visitors otherwise inherit a
supported browser language and fall back to English.

## Current support

The checked-in catalogs contain the same 2,579 keys. Coverage includes the boot
flow, Garage, Settings, equipment, loading screens, battle HUD, killcam and
results, private/LAN room controls, Tank Gallery, Scene Studio, and the public
documentation surfaces. Number and date formatting use the active locale, and
the document `lang` attribute follows it.

Changing the language reloads the current page. Most game screens are assembled
once, so the reload is intentional: it guarantees one language across the whole
surface instead of leaving stale labels in an already-created Garage or battle.

The following content intentionally remains source-language content:

- player names, room chat, imported Studio content, and other user-authored text;
- vehicle designations, nation abbreviations, map names, shell designations, and
  other proper or technical names;
- developer diagnostics, logs, test output, and source code;
- media alternative text that does not already share a translated visible
  label; this remains an accessibility follow-up for the first Chinese release;
- crawl-time title, Open Graph, Twitter, and JSON-LD metadata. Those remain
  English until locale-addressable public routes can expose truthful canonical
  and alternate-language metadata.

## Runtime ownership

- `src/ui/i18n.ts` owns locale detection, persistence, interpolation, events,
  document language, and `Intl` formatting.
- `src/ui/i18nCatalog.en-US.json` is the source catalog.
- `src/ui/i18nCatalog.zh-CN.json` is the reviewed Simplified Chinese catalog.
- `src/ui/i18nCatalog.ts` assembles those JSON files for direct use by the game runtime.
- `src/presentation/staticI18n.ts` translates static public-page text and
  attributes. `data-i18n-html` is restricted to source-controlled rich copy.

## General Translation workflow

The repository uses the General Translation CLI for catalog synchronization.
The runtime still loads local JSON, so production UI does not depend on a
translation network request and never receives a translation API key.

```bash
npm run i18n:validate
GT_API_KEY=... GT_PROJECT_ID=... npm run i18n:translate
npm run i18n:check
```

`i18n:validate` parses the GT configuration without calling the API, then checks
catalog parity, placeholders, rich-markup parity, and static-page bindings.
`i18n:translate` updates the locale files through General Translation and marks
them as requiring review. To enforce that gate, disable **Auto approve** in the
General Translation project dashboard; `requiresReview` does not override that
dashboard setting. Credentials belong in the environment—never in
`gt.config.json`, browser code, or committed `.env` files.

Before merging translated copy, run:

```bash
npm run i18n:check
npm run typecheck
npm run build
```

`i18n:check` also fails on likely hard-coded, user-visible English strings in
the typed UI source. Review Chinese at desktop and compact widths after any
large copy update; key parity does not prove layout quality.
