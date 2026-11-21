/**
 * Public-route ownership for the vanilla Vite runtime: every public page's route, and links kept inside a locale. The
 * locale codes and the `/cn` prefix are localePrefix.ts's (274: the i18n runtime loads them without this table).
 */

import { DEFAULT_LOCALE, splitLocalePrefix, type SupportedLocale } from './localePrefix.ts';

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

/** Resolve the locale prefix without treating the unprefixed default as explicit. */
export function resolveLocalePath(pathname: string): LocalePathResolution {
  const { locale, pathname: basePath } = splitLocalePrefix(pathname);
  return { locale, pathname: basePath, route: ROUTE_BY_PATH.get(basePath) ?? null };
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
