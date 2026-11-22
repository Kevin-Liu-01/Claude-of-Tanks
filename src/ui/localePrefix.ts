/**
 * The locale table and each locale's URL prefix, apart from the public route table (localeRouting.ts).
 *
 * General Translation catalogs use BCP 47 locale codes. Public URLs use a short
 * prefix per locale (`/cn`, `/es`, `/ja`, `/de`, `/pt`, `/ru`; English has none),
 * while HTML `lang`, Open Graph locale, and hreflang remain the canonical codes.
 * LOCALE_RECORDS is the one table every owner reads: routing, the build's catalog
 * chunks, the generated pages, the sitemap and the language switchers.
 *
 * (274) The i18n runtime reads only this file, so a page that loads i18n.ts (the icons and centering tools' page) no
 * longer loads the route table: a new public page moved no tool's key (273.1: /brand marked centering and icons on
 * every tank id).
 */

export const DEFAULT_LOCALE = 'en-US' as const;
export const SUPPORTED_LOCALES = ['en-US', 'zh-CN', 'es', 'ja', 'de', 'pt-BR', 'ru'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export interface LocaleRecord {
  readonly locale: SupportedLocale;
  /** The public URL prefix without slashes ('' for the default locale). */
  readonly prefix: string;
  /** The switcher's short mark (in the language itself). */
  readonly mark: string;
  /** The language's own name. */
  readonly name: string;
  /** Open Graph's locale (`og:locale`). */
  readonly og: string;
  /** The primary language subtag a browser preference must start with to choose this locale. */
  readonly browser: string;
}

export const LOCALE_RECORDS: readonly LocaleRecord[] = Object.freeze([
  { locale: 'en-US', prefix: '', mark: 'EN', name: 'English', og: 'en_US', browser: 'en' },
  { locale: 'zh-CN', prefix: 'cn', mark: '中文', name: '简体中文', og: 'zh_CN', browser: 'zh' },
  { locale: 'es', prefix: 'es', mark: 'ES', name: 'Español', og: 'es_ES', browser: 'es' },
  { locale: 'ja', prefix: 'ja', mark: '日本語', name: '日本語', og: 'ja_JP', browser: 'ja' },
  { locale: 'de', prefix: 'de', mark: 'DE', name: 'Deutsch', og: 'de_DE', browser: 'de' },
  { locale: 'pt-BR', prefix: 'pt', mark: 'PT', name: 'Português', og: 'pt_BR', browser: 'pt' },
  { locale: 'ru', prefix: 'ru', mark: 'RU', name: 'Русский', og: 'ru_RU', browser: 'ru' },
] satisfies readonly LocaleRecord[]);

const RECORD_BY_LOCALE = new Map(LOCALE_RECORDS.map((record) => [record.locale, record]));
const LOCALE_BY_PREFIX = new Map(LOCALE_RECORDS.filter(({ prefix }) => prefix).map((record) => [record.prefix, record.locale]));

/** The locales other than the default, in table order (each has its own prefixed routes). */
export const PREFIXED_LOCALES: readonly SupportedLocale[] = Object.freeze(LOCALE_RECORDS
  .filter(({ prefix }) => prefix).map(({ locale }) => locale));

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return typeof value === 'string' && RECORD_BY_LOCALE.has(value as SupportedLocale);
}

export function localeRecord(locale: SupportedLocale): LocaleRecord {
  return RECORD_BY_LOCALE.get(locale) ?? LOCALE_RECORDS[0];
}

/** The locale's URL prefix with its leading slash ('' for the default locale). */
export function localePrefix(locale: SupportedLocale): string {
  const { prefix } = localeRecord(locale);
  return prefix ? `/${prefix}` : '';
}

/** The supported locale a browser language tag asks for (`es-MX` → `es`, `zh-TW` → `zh-CN`), else null. */
export function localeForBrowserTag(tag: string): SupportedLocale | null {
  const primary = String(tag || '').toLowerCase().split(/[-_]/, 1)[0];
  return LOCALE_RECORDS.find(({ browser }) => browser === primary)?.locale ?? null;
}

function normalizePathname(pathname: string): string {
  const raw = (String(pathname || '/').split(/[?#]/, 1)[0] || '/').replace(/^\/{2,}/, '/');
  if (raw === '/') return raw;
  return raw.replace(/\/+$/, '') || '/';
}

/** The locale a path's prefix names (null for the unprefixed default, which is never explicit) and the path without it. */
export function splitLocalePrefix(pathname: string): { readonly locale: SupportedLocale | null; readonly pathname: string } {
  const normalized = normalizePathname(pathname);
  const first = /^\/([^/]+)/.exec(normalized)?.[1] ?? '';
  const locale = LOCALE_BY_PREFIX.get(first) ?? null;
  return {
    locale,
    pathname: locale ? normalizePathname(normalized.slice(first.length + 1) || '/') : normalized,
  };
}
