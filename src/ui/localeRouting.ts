/**
 * Canonical locale and public-route ownership for the vanilla Vite runtime.
 *
 * General Translation catalogs use BCP 47 locale codes. Public URLs use a short
 * prefix per locale (`/cn`, `/es`, `/ja`, `/de`, `/pt`, `/ru`; English has none),
 * while HTML `lang`, Open Graph locale, and hreflang remain the canonical codes.
 * LOCALE_RECORDS is the one table every owner reads: routing, the build's catalog
 * chunks, the generated pages, the sitemap and the language switchers.
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

type PublicRouteId =
  | 'game'
  | 'home'
  | 'gallery'
  | 'studio'
  | 'docs'
  | 'docsBuild'
  | 'docsModels'
  | 'docsSimulation'
  | 'docsRendering'
  | 'docsAi'
  | 'docsMultiplayer'
  | 'docsAudio'
  | 'docsStudio'
  | 'docsFilming'
  | 'docsModes'
  | 'docsBattlefields'
  | 'docsCombat'
  | 'docsTanks'
  | 'docsStart'
  | 'docsControls'
  | 'docsFleet'
  | 'brand'
  | 'notFound';

export interface PublicRouteRecord {
  readonly id: PublicRouteId;
  readonly pathname: string;
  readonly sourceHtml: string;
  readonly localizedHtml: string;
  readonly indexable: boolean;
}

const DOCS_TOPICS = [
  'build', 'models', 'simulation', 'rendering', 'ai', 'multiplayer', 'audio',
  'studio', 'filming', 'modes', 'battlefields', 'combat', 'tanks', 'start', 'controls', 'fleet',
] as const;

const route = (id: PublicRouteId, pathname: string, sourceHtml: string, localizedHtml = sourceHtml, indexable = true):
  PublicRouteRecord => ({ id, pathname, sourceHtml, localizedHtml, indexable });

/** Every public route (the docs topics expand from DOCS_TOPICS: `/docs/<topic>` served by `docs-<topic>.html`). */
export const PUBLIC_ROUTE_RECORDS: readonly PublicRouteRecord[] = Object.freeze([
  route('game', '/', 'index.html'),
  route('home', '/home', 'home.html'),
  route('gallery', '/gallery', 'gallery.html'),
  route('studio', '/studio', 'index.html', 'studio.html'),
  route('docs', '/docs', 'docs.html'),
  ...DOCS_TOPICS.map((topic) => route(`docs${topic[0].toUpperCase()}${topic.slice(1)}` as PublicRouteId,
    `/docs/${topic}`, `docs-${topic}.html`)),
  route('brand', '/brand', 'brand.html'),
  route('notFound', '/404', '404.html', '404.html', false),
]);

const ROUTE_BY_PATH = new Map(PUBLIC_ROUTE_RECORDS.map((route) => [route.pathname, route]));

interface LocalePathResolution {
  readonly locale: SupportedLocale | null;
  readonly pathname: string;
  readonly route: PublicRouteRecord | null;
}

function normalizePathname(pathname: string): string {
  const raw = (String(pathname || '/').split(/[?#]/, 1)[0] || '/').replace(/^\/{2,}/, '/');
  if (raw === '/') return raw;
  return raw.replace(/\/+$/, '') || '/';
}

/** Resolve the locale prefix without treating the unprefixed default as explicit. */
export function resolveLocalePath(pathname: string): LocalePathResolution {
  const normalized = normalizePathname(pathname);
  const first = /^\/([^/]+)/.exec(normalized)?.[1] ?? '';
  const locale = LOCALE_BY_PREFIX.get(first) ?? null;
  const basePath = locale
    ? normalizePathname(normalized.slice(first.length + 1) || '/')
    : normalized;
  return {
    locale,
    pathname: basePath,
    route: ROUTE_BY_PATH.get(basePath) ?? null,
  };
}

export function publicRouteForEntry(sourceHtml: string): PublicRouteRecord | null {
  const matches = PUBLIC_ROUTE_RECORDS.filter((route) => route.sourceHtml === sourceHtml);
  return matches.find((route) => route.id === 'game') ?? matches[0] ?? null;
}

export function pathForLocale(pathname: string, locale: SupportedLocale): string {
  const basePath = resolveLocalePath(pathname).pathname;
  const prefix = localePrefix(locale);
  if (!prefix) return basePath;
  return basePath === '/' ? `${prefix}/` : `${prefix}${basePath}`;
}

export function hrefForLocale(href: string, locale: SupportedLocale): string {
  const raw = String(href || '');
  if (!raw || raw.startsWith('#') || raw.startsWith('?') || raw.startsWith('//')) return raw;
  if (/^[a-z][a-z\d+.-]*:/i.test(raw)) return raw;
  if (!raw.startsWith('/')) return raw;

  const match = raw.match(/^([^?#]*)([\s\S]*)$/);
  if (!match) return raw;
  const [, pathname, suffix] = match;
  if (pathname.startsWith('/api/')) return raw;
  const resolved = resolveLocalePath(pathname);
  if (!resolved.route && resolved.pathname !== '/surface-studio') return raw;
  return `${pathForLocale(pathname, locale)}${suffix}`;
}

export function currentLocationHrefForLocale(
  location: Pick<Location, 'pathname' | 'search' | 'hash'>,
  locale: SupportedLocale,
): string {
  return `${pathForLocale(location.pathname, locale)}${location.search || ''}${location.hash || ''}`;
}

/** Replace the current document only when persisted/browser locale and URL disagree. */
export function synchronizeLocaleRoute(
  locale: SupportedLocale,
  location: Pick<Location, 'pathname' | 'search' | 'hash' | 'replace'> = window.location,
): boolean {
  const routeLocale = resolveLocalePath(location.pathname).locale;
  if ((routeLocale ?? DEFAULT_LOCALE) === locale) return false;
  location.replace(currentLocationHrefForLocale(location, locale));
  return true;
}

/** A route's alternate-language graph: every locale's path (hreflang order: the table's) and `x-default`, the English one. */
export function localeAlternates(pathname: string): readonly (readonly [string, string])[] {
  const base = resolveLocalePath(pathname).pathname;
  return [...LOCALE_RECORDS.map(({ locale }) => [locale, pathForLocale(base, locale)] as const),
    ['x-default', pathForLocale(base, DEFAULT_LOCALE)] as const];
}

/** Keep static and late-rendered public anchors inside the selected locale. */
export function localizeDocumentLinks(
  root: ParentNode,
  locale: SupportedLocale,
): void {
  for (const anchor of root.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    const href = anchor.getAttribute('href');
    if (!href) continue;
    const localized = hrefForLocale(href, locale);
    if (localized !== href) anchor.setAttribute('href', localized);
  }
}
