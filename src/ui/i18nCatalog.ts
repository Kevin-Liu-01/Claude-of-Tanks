/**
 * i18nCatalog.ts — both locale catalogs, synchronously, for server and build-time code.
 *
 * Each locale lives in a General Translation-compatible JSON file under
 * `src/ui/i18nCatalog.<locale>.json`. The middleware, the Vite config,
 * localizedHtml.ts, tools and selftests import this module. Browser code must
 * not (src/ui/i18nLazyCatalog.selftest.mjs): a document loads its own
 * dictionaries on demand through i18nDictionaries.ts (the game the full
 * catalogs, a public page its page catalog). Importing this module registers
 * both locales with that registry, so shared helpers (siteMetadata.ts) resolve
 * both on the server.
 */
import enUS from './i18nCatalog.en-US.json' with { type: 'json' };
import zhCN from './i18nCatalog.zh-CN.json' with { type: 'json' };
import { registerLocaleDictionary, type CatalogLocale } from './i18nDictionaries.ts';

registerLocaleDictionary('en-US', enUS);
registerLocaleDictionary('zh-CN', zhCN);

export { enUS, zhCN };

export const CATALOG: Readonly<Record<CatalogLocale, Readonly<Record<string, string>>>> = {
  'en-US': enUS,
  'zh-CN': zhCN,
} as const;

export function catalogText(
  locale: CatalogLocale,
  key: string,
  vars?: Readonly<Record<string, string | number>>,
): string {
  const source = CATALOG[locale][key] ?? CATALOG['en-US'][key] ?? key;
  if (!vars) return source;
  return source.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match);
}
