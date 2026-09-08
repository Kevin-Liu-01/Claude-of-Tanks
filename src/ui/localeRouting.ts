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

export type PublicRouteId =
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
  | 'notFound';

export interface PublicRouteRecord {
  readonly id: PublicRouteId;
  readonly pathname: string;
  readonly sourceHtml: string;
  readonly localizedHtml: string;
  readonly indexable: boolean;
}

export const PUBLIC_ROUTE_RECORDS: readonly PublicRouteRecord[] = Object.freeze([
  { id: 'game', pathname: '/', sourceHtml: 'index.html', localizedHtml: 'index.html', indexable: true },
  { id: 'home', pathname: '/home', sourceHtml: 'home.html', localizedHtml: 'home.html', indexable: true },
  { id: 'gallery', pathname: '/gallery', sourceHtml: 'gallery.html', localizedHtml: 'gallery.html', indexable: true },
  { id: 'studio', pathname: '/studio', sourceHtml: 'index.html', localizedHtml: 'studio.html', indexable: true },
  { id: 'docs', pathname: '/docs', sourceHtml: 'docs.html', localizedHtml: 'docs.html', indexable: true },
  { id: 'docsBuild', pathname: '/docs/build', sourceHtml: 'docs-build.html', localizedHtml: 'docs-build.html', indexable: true },
  { id: 'docsModels', pathname: '/docs/models', sourceHtml: 'docs-models.html', localizedHtml: 'docs-models.html', indexable: true },
  { id: 'docsSimulation', pathname: '/docs/simulation', sourceHtml: 'docs-simulation.html', localizedHtml: 'docs-simulation.html', indexable: true },
  { id: 'docsVehicles', pathname: '/docs/vehicles', sourceHtml: 'docs-vehicles.html', localizedHtml: 'docs-vehicles.html', indexable: true },
  { id: 'docsRendering', pathname: '/docs/rendering', sourceHtml: 'docs-rendering.html', localizedHtml: 'docs-rendering.html', indexable: true },
  { id: 'docsPerformance', pathname: '/docs/performance', sourceHtml: 'docs-performance.html', localizedHtml: 'docs-performance.html', indexable: true },
  { id: 'docsWorlds', pathname: '/docs/worlds', sourceHtml: 'docs-worlds.html', localizedHtml: 'docs-worlds.html', indexable: true },
  { id: 'docsAi', pathname: '/docs/ai', sourceHtml: 'docs-ai.html', localizedHtml: 'docs-ai.html', indexable: true },
  { id: 'docsMultiplayer', pathname: '/docs/multiplayer', sourceHtml: 'docs-multiplayer.html', localizedHtml: 'docs-multiplayer.html', indexable: true },
  { id: 'docsAudio', pathname: '/docs/audio', sourceHtml: 'docs-audio.html', localizedHtml: 'docs-audio.html', indexable: true },
  { id: 'docsInterface', pathname: '/docs/interface', sourceHtml: 'docs-interface.html', localizedHtml: 'docs-interface.html', indexable: true },
  { id: 'docsStudio', pathname: '/docs/studio', sourceHtml: 'docs-studio.html', localizedHtml: 'docs-studio.html', indexable: true },
  { id: 'notFound', pathname: '/404', sourceHtml: '404.html', localizedHtml: '404.html', indexable: false },
] satisfies readonly PublicRouteRecord[]);

const ROUTE_BY_PATH = new Map(PUBLIC_ROUTE_RECORDS.map((route) => [route.pathname, route]));

export interface LocalePathResolution {
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
