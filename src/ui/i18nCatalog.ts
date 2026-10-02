/**
 * i18nCatalog.ts — both locale catalogs, synchronously, for server and build-time code.
 *
 * Each locale lives in a General Translation-compatible JSON file under
 * `src/ui/i18nCatalog.<locale>.json`. The middleware, the Vite config,
 * localizedHtml.ts, tools and selftests import this module. Browser code must
 * not (tools/boot-static-closure.selftest.mjs): the runtime keeps English
 * resident and loads zh-CN on demand through i18nDictionaries.ts. Importing
 * this module registers zh-CN with that registry, so shared helpers
 * (siteMetadata.ts) resolve both locales on the server.
 */
import enUS from './i18nCatalog.en-US.json' with { type: 'json' };
import zhCN from './i18nCatalog.zh-CN.json' with { type: 'json' };
import { registerLocaleDictionary, type CatalogLocale } from './i18nDictionaries.ts';

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
