/**
 * The locale codes and the `/cn` path prefix, apart from the public route table (localeRouting.ts).
 *
 * General Translation catalogs use BCP 47 locale codes. Public URLs use the
 * deliberately shorter `/cn` alias, while HTML `lang`, Open Graph locale, and
 * hreflang remain canonical `zh-CN` values.
 *
 * (274) The i18n runtime reads only the prefix, so a page that loads i18n.ts (the icons and centering tools' page) no
 * longer loads the route table: a new public page moved no tool's key (273.1: /brand marked centering and icons on
 * every tank id).
 */

export const DEFAULT_LOCALE = 'en-US' as const;
export const SUPPORTED_LOCALES = ['en-US', 'zh-CN'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

function normalizePathname(pathname: string): string {
  const raw = (String(pathname || '/').split(/[?#]/, 1)[0] || '/').replace(/^\/{2,}/, '/');
  if (raw === '/') return raw;
  return raw.replace(/\/+$/, '') || '/';
}

/** The locale a path's prefix names (null for the unprefixed default, which is never explicit) and the path without it. */
export function splitLocalePrefix(pathname: string): { readonly locale: SupportedLocale | null; readonly pathname: string } {
  const normalized = normalizePathname(pathname);
  const isChinese = normalized === '/cn' || normalized.startsWith('/cn/');
  return {
    locale: isChinese ? 'zh-CN' : null,
    pathname: isChinese ? normalizePathname(normalized.slice(3) || '/') : normalized,
  };
}
