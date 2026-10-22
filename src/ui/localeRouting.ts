/**
 * Canonical locale and public-route ownership for the vanilla Vite runtime.
 *
 * General Translation catalogs use BCP 47 locale codes. Public URLs use the
 * deliberately shorter `/cn` alias, while HTML `lang`, Open Graph locale, and
 * hreflang remain canonical `zh-CN` values.
 */

export const DEFAULT_LOCALE = 'en-US' as const;
export const SUPPORTED_LOCALES = ['en-US', 'zh-CN'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

type PublicRouteId =
  | 'game'
  | 'home'
  | 'gallery'
  | 'studio'
  | 'docs'
  | 'docsBuild'
  | 'docsModels'
  | 'docsSimulation'
  | 'docsVehicles'
  | 'docsRendering'
  | 'docsPerformance'
  | 'docsWorlds'
  | 'docsAi'
  | 'docsMultiplayer'
  | 'docsAudio'
  | 'docsInterface'
  | 'docsStudio'
  | 'docsFilming'
  | 'notFound';

export interface PublicRouteRecord {
  readonly id: PublicRouteId;
  readonly pathname: string;
  readonly sourceHtml: string;
  readonly localizedHtml: string;
  readonly indexable: boolean;
}

const DOCS_TOPICS = [
  'build', 'models', 'simulation', 'vehicles', 'rendering', 'performance', 'worlds', 'ai', 'multiplayer', 'audio',
  'interface', 'studio', 'filming',
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
  route('notFound', '/404', '404.html', '404.html', false),
]);

const ROUTE_BY_PATH = new Map(PUBLIC_ROUTE_RECORDS.map((route) => [route.pathname, route]));

interface LocalePathResolution {
  readonly locale: SupportedLocale | null;
  readonly pathname: string;
  readonly route: PublicRouteRecord | null;
}

function normalizePathname(pathname: string): string {
  const raw = String(pathname || '/').split(/[?#]/, 1)[0] || '/';
  if (raw === '/') return raw;
  return raw.replace(/\/+$/, '') || '/';
}

/** Resolve the locale prefix without treating the unprefixed default as explicit. */
export function resolveLocalePath(pathname: string): LocalePathResolution {
  const normalized = normalizePathname(pathname);
  const isChinese = normalized === '/cn' || normalized.startsWith('/cn/');
  const basePath = isChinese
    ? normalizePathname(normalized.slice(3) || '/')
    : normalized;
  return {
    locale: isChinese ? 'zh-CN' : null,
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
  if (locale === DEFAULT_LOCALE) return basePath;
  return basePath === '/' ? '/cn/' : `/cn${basePath}`;
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
  if ((locale === 'zh-CN' && routeLocale === 'zh-CN') ||
      (locale === DEFAULT_LOCALE && routeLocale === null)) return false;
  location.replace(currentLocationHrefForLocale(location, locale));
  return true;
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
