/**
 * i18nCatalog.ts — assembles the runtime dictionary from per-locale files.
 *
 * Each locale lives in a General Translation-compatible JSON file under
 * `src/ui/i18nCatalog.<locale>.json`. This dependency-free module can be
 * imported synchronously by the i18n runtime without an initialization cycle.
 */
import enUS from './i18nCatalog.en-US.json' with { type: 'json' };
import zhCN from './i18nCatalog.zh-CN.json' with { type: 'json' };

export { enUS, zhCN };

export type CatalogLocale = 'en-US' | 'zh-CN';

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
