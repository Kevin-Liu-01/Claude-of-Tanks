/**
 * i18nCatalogEnUS.ts — the full en-US dictionary as a lazily imported module (i18nDictionaries.ts).
 *
 * The game's English catalog. Public pages load generated page catalogs instead
 * (tools/viteI18nPageCatalogs.ts), so no page's static graph holds this file; the
 * game preloads its chunk beside the module entry. A module wrapper for the same
 * reason as i18nCatalogZhCN.ts.
 */
import enUS from './i18nCatalog.en-US.json' with { type: 'json' };

export default enUS;
