import { readFileSync } from 'node:fs';
import { catalogText, CATALOG } from '../ui/i18nCatalog.ts';
import {
  DEFAULT_LOCALE,
  hrefForLocale,
  publicRouteForEntry,
  resolveLocalePath,
  type PublicRouteRecord,
  type SupportedLocale,
} from '../ui/localeRouting.ts';
import { renderProductStats } from '../productStats.ts';
import { SITE_ORIGIN, shareVideoForRoute, socialCardUrl } from './siteMetadata.ts';
import { zhTypeFloorStyle } from '../ui/zhTypeFloor.ts';

function escapeAttribute(value: string): string {
  return value.replace(/[&<>"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
  })[character] || character);
}

function replaceAttribute(tag: string, attribute: string, value: string): string {
  const encoded = escapeAttribute(value);
  const pattern = new RegExp(`(${attribute}\\s*=\\s*["'])[^"']*(["'])`, 'i');
  return pattern.test(tag)
    ? tag.replace(pattern, `$1${encoded}$2`)
    : tag.replace(/\s*\/?\>$/, ` ${attribute}="${encoded}">`);
}

function replaceMeta(
  html: string,
  selector: 'name' | 'property',
  key: string,
  value: string,
): string {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`<meta\\b[^>]*\\b${selector}\\s*=\\s*["']${escapedKey}["'][^>]*>`, 'i');
  return html.replace(pattern, (tag) => replaceAttribute(tag, 'content', value));
}

/**
 * A localized twin shares its page's picture but not its English label: every
 * /brand/og/<card>.jpg (Open Graph, Twitter and JSON-LD) becomes the locale's
 * card. The default og-image.png carries no label and stays.
 */
function localizeSocialCards(html: string, locale: SupportedLocale): string {
  const origin = SITE_ORIGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return html.replace(new RegExp(`${origin}/brand/og/([a-z0-9-]+)\\.jpg`, 'g'),
    (_, card: string) => socialCardUrl(card, locale));
}

const SHARE_VIDEO_TAG = /<meta\b[^>]*\bproperty\s*=\s*["']og:video(?::[a-z_]+)?["'][^>]*>/gi;
const SHARE_IMAGE_TAG = /<meta\b[^>]*\bproperty\s*=\s*["']og:image(?::[a-z_]+)?["'][^>]*>/gi;

/**
 * A public page's share clip (266): og:video, og:video:url and og:video:secure_url name its family's mp4
 * (siteMetadata.ts shareVideoForRoute) with its type and size, right after the page's one og:image, and og:type is
 * video.other. Apple Messages plays a direct mp4 that og:video names; Discord plays it inline only for that type. The
 * heads name no clip, and one already written (an English page the /cn generator re-localizes, the game's shell under
 * /studio) is replaced, so a document names its own family's clip once.
 */
function addShareVideo(html: string, route: PublicRouteRecord): string {
  const { path, width, height } = shareVideoForRoute(route.id);
  const url = `${SITE_ORIGIN}${path}`;
  const tags = ([
    ['og:video', url], ['og:video:url', url], ['og:video:secure_url', url],
    ['og:video:type', 'video/mp4'], ['og:video:width', String(width)], ['og:video:height', String(height)],
  ] as const).map(([property, content]) => `<meta property="${property}" content="${escapeAttribute(content)}">`).join('');
  const output = replaceMeta(html.replace(SHARE_VIDEO_TAG, ''), 'property', 'og:type', 'video.other');
  const image = [...output.matchAll(SHARE_IMAGE_TAG)].at(-1);
  const at = image ? (image.index ?? 0) + image[0].length : output.search(/<\/head>/i);
  return at < 0 ? output : `${output.slice(0, at)}${tags}${output.slice(at)}`;
}

function translation(locale: SupportedLocale, key: string): string {
  return catalogText(locale, key);
}

/** True when a catalog key actually exists (catalogText falls back to the literal key). */
function localizedHas(key: string): boolean {
  return key in CATALOG['en-US'];
}

function addLocaleLinks(html: string, route: PublicRouteRecord): string {
  if (!route.indexable) return html;
  const english = `${SITE_ORIGIN}${route.pathname}`;
  const chinese = `${SITE_ORIGIN}${hrefForLocale(route.pathname, 'zh-CN')}`;
  const alternates = [
    `<link rel="alternate" hreflang="en-US" href="${english}">`,
    `<link rel="alternate" hreflang="zh-CN" href="${chinese}">`,
    `<link rel="alternate" hreflang="x-default" href="${english}">`,
  ].join('');
  const withoutOld = html.replace(/<link\b[^>]*\brel=["']alternate["'][^>]*\bhreflang=["'][^"']+["'][^>]*>\s*/gi, '');
  return withoutOld.replace(
    /(<link\b[^>]*\brel=["']canonical["'][^>]*>)/i,
    `$1${alternates}`,
  );
}

function localizeStructuredData(
  html: string,
  route: PublicRouteRecord,
  locale: SupportedLocale,
): string {
  const englishCanonical = `${SITE_ORIGIN}${route.pathname}`;
  const localizedCanonical = `${SITE_ORIGIN}${hrefForLocale(route.pathname, locale)}`;

  // Discovery copy inside JSON-LD (TechArticle headline/description and the
  // BreadcrumbList names) is authored in English per source HTML; when
  // materializing a `/cn` document, localize those visible fields so the
  // structured data agrees with the page's declared language. Headlines and
  // descriptions only exist for the documentation routes; render product-stat
  // tokens (`{{COT_*}}`) so descriptions match the built English source.
  const headlineKey = `metadata.${route.id}.headline`;
  const descriptionKey = `metadata.${route.id}.structuredDescription`;
  const hasHeadline = localizedHas(headlineKey);
  const hasDescription = localizedHas(descriptionKey);
  const localizedHeadline = locale !== DEFAULT_LOCALE && hasHeadline
    ? translation(locale, headlineKey)
    : null;
  const englishHeadline = hasHeadline ? translation('en-US', headlineKey) : null;
  const localizedDescription = locale !== DEFAULT_LOCALE && hasDescription
    ? renderProductStats(translation(locale, descriptionKey))
    : null;
  const englishDescription = hasDescription
    ? renderProductStats(translation('en-US', descriptionKey))
    : null;
  const localizedCrumb = locale !== DEFAULT_LOCALE
    ? translation(locale, 'metadata.docs.crumb')
    : null;
  // A node named by the page's title (WebPage, CollectionPage), or by its page part before " · " (a breadcrumb), takes
  // the locale's title the same way.
  const titleKey = route.id === 'notFound' ? 'notFound.metaTitle' : `metadata.${route.id}.title`;
  const englishTitle = locale !== DEFAULT_LOCALE && localizedHas(titleKey) ? renderProductStats(translation('en-US', titleKey)) : null;
  const localizedTitle = englishTitle ? renderProductStats(translation(locale, titleKey)) : null;
  const pagePart = (title: string): string => title.split(' · ')[0];
  // a list the page names (the Gallery's fleet) takes the locale's name from metadata.<route>.listName
  const listKey = `metadata.${route.id}.listName`;
  const englishListName = locale !== DEFAULT_LOCALE && localizedHas(listKey) ? renderProductStats(translation('en-US', listKey)) : null;
  const localizedListName = englishListName ? renderProductStats(translation(locale, listKey)) : null;

  return html.replace(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi,
    (block, source: string) => {
      try {
        // product-stat tokens may stand as bare numbers (the Gallery's numberOfItems): rendered first, the block parses
        const value = JSON.parse(renderProductStats(source)) as unknown;
        const visit = (node: unknown): void => {
          if (!node || typeof node !== 'object') return;
          if (Array.isArray(node)) {
            for (const child of node) visit(child);
            return;
          }
          const record = node as Record<string, unknown>;
          for (const [key, child] of Object.entries(record)) {
            if (key === 'inLanguage') {
              record[key] = locale;
            } else if (localizedHeadline && key === 'headline' && child === englishHeadline) {
              record[key] = localizedHeadline;
            } else if (localizedDescription && key === 'description' && child === englishDescription) {
              record[key] = localizedDescription;
            } else if (englishTitle && localizedTitle && key === 'name' && child === englishTitle) {
              record[key] = localizedTitle;
            } else if (englishTitle && localizedTitle && key === 'name' && englishTitle.includes(' · ')
              && child === pagePart(englishTitle) && child !== 'Claude of Tanks') {
              record[key] = pagePart(localizedTitle);
            } else if (localizedListName && key === 'name' && child === englishListName) {
              record[key] = localizedListName;
            } else if (localizedHeadline && key === 'name' && typeof child === 'string') {
              if (child === englishHeadline) record[key] = localizedHeadline;
              else if (localizedCrumb && child === 'Documentation') record[key] = localizedCrumb;
            } else if (typeof child === 'string' &&
              (child === englishCanonical || child.startsWith(`${englishCanonical}#`))) {
              record[key] = `${localizedCanonical}${child.slice(englishCanonical.length)}`;
            } else {
              visit(child);
            }
          }
        };
        visit(value);
        // `<` as \u003c: a localized headline can never close the script element (security audit 2026-10-22).
        return `<script type="application/ld+json">${JSON.stringify(value).replace(/</g, '\\u003c')}</script>`;
      } catch (_) {
        return block;
      }
    },
  );
}

/** Meta naming a page's zh-CN catalog chunk; the Vite build adds one to every page (tools/viteI18nPageCatalogs.ts). */
export const LOCALE_CATALOG_META = 'cot-locale-catalog';

/**
 * A Chinese document preloads its catalog beside the module entry: the i18n
 * runtime awaits it before the page's UI evaluates, so fetching it with the
 * boot graph keeps that await off the critical path. English documents keep
 * the meta inert and never download the chunk.
 */
function addLocaleCatalogPreload(html: string, locale: SupportedLocale): string {
  if (locale === DEFAULT_LOCALE) return html;
  let href = '';
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    if (new RegExp(`\\bname=["']${LOCALE_CATALOG_META}["']`, 'i').test(tag)
      && new RegExp(`\\bdata-locale=["']${locale}["']`, 'i').test(tag)) {
      href = /\bcontent=["']([^"']+)["']/i.exec(tag)?.[1] ?? '';
      break;
    }
  }
  if (!/^\/assets\/[^"'<>\s]+\.js$/.test(href)) return html;
  const link = `<link rel="modulepreload" crossorigin href="${escapeAttribute(href)}">`;
  if (html.includes(link)) return html;
  const entry = /<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["'][^"']+["'][^>]*>\s*<\/script>/i.exec(html);
  if (entry) {
    const at = entry.index + entry[0].length;
    return `${html.slice(0, at)}\n${link}${html.slice(at)}`;
  }
  return html.replace(/<\/head>/i, `${link}\n</head>`);
}

function addZhTypeFloor(html: string, route: PublicRouteRecord): string {
  if (html.includes('id="cot-zh-type"')) return html;
  const style = zhTypeFloorStyle(route.id);
  const head = html.indexOf('<style id="cot-font-faces">');
  const end = head >= 0 ? html.indexOf('</style>', head) : -1;
  return end >= 0
    ? `${html.slice(0, end + 8)}${style}${html.slice(end + 8)}`
    : html.replace(/<\/head>/i, `${style}\n</head>`);
}

const escapeText = (value: string): string =>
  value.replace(/[&<>]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[character] || character);
const decodeAttribute = (value: string): string => value
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const VOID_ELEMENTS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
/** The static-i18n attributes (src/presentation/staticI18n.ts) that set an attribute, and the attribute they set. */
const ATTRIBUTE_HOSTS: readonly (readonly [string, string])[] = [
  ['data-i18n-placeholder', 'placeholder'], ['data-i18n-title', 'title'], ['data-i18n-alt', 'alt'],
  ['data-i18n-aria-label', 'aria-label'], ['data-i18n-aria', 'aria-label'],
];

/** Set one attribute on an opening tag (a whole-name match: `title` never touches `data-i18n-title`). */
function setTagAttribute(tag: string, name: string, value: string): string {
  const encoded = escapeAttribute(value);
  const pattern = new RegExp(`(\\s${name}\\s*=\\s*)(?:"[^"]*"|'[^']*')`, 'i');
  return pattern.test(tag)
    ? tag.replace(pattern, (_, head: string) => `${head}"${encoded}"`)
    : tag.replace(/\s*\/?>$/, (end) => ` ${name}="${encoded}"${end.trim()}`);
}

function attributeValue(tag: string, name: string): string | null {
  const match = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(tag);
  return match ? decodeAttribute(match[1] ?? match[2] ?? '') : null;
}

/** Index just past the element's matching close tag, counting nested elements of the same name; -1 if unclosed. */
function elementEnd(html: string, name: string, from: number): { contentEnd: number; end: number } | null {
  const pattern = new RegExp(`<(/?)${name}\\b[^>]*>`, 'gi');
  pattern.lastIndex = from;
  for (let depth = 1, match; (match = pattern.exec(html));) {
    if (match[1]) depth--;
    else if (!match[0].endsWith('/>')) depth++;
    if (!depth) return { contentEnd: match.index, end: pattern.lastIndex };
  }
  return null;
}

/**
 * Build-time body localization (BUI-F8, SPEC 15): every static-i18n host in the document takes the locale's text before
 * any script runs, exactly as the runtime pass (staticI18n.ts) would write it: `data-i18n` text (escaped), vetted
 * `data-i18n-html`, and the attribute hosts, with `data-i18n-vars` placeholders and the ICU subset. A /cn page therefore
 * ships Chinese body HTML: crawlers, no-script readers and the first paint see it, and the runtime pass rewrites the
 * same strings.
 */
export function localizeBodyHtml(html: string, locale: SupportedLocale): string {
  const bodyAt = html.search(/<body\b/i);
  if (bodyAt < 0) return html;
  let out = html.slice(0, bodyAt);
  const tagPattern = /<([a-zA-Z][\w-]*)\b[^>]*>/g;
  tagPattern.lastIndex = bodyAt;
  let copied = bodyAt;
  for (let match; (match = tagPattern.exec(html));) {
    let tag = match[0];
    const name = match[1].toLowerCase();
    if (name === 'script' || name === 'style' || name === 'template') {
      // markup inside a script, style or template is code, not the document
      const end = html.toLowerCase().indexOf(`</${name}`, tagPattern.lastIndex);
      if (end >= 0) tagPattern.lastIndex = end;
      continue;
    }
    if (!/\sdata-i18n/i.test(tag)) continue;
    let vars: Record<string, string | number> | undefined;
    const rawVars = attributeValue(tag, 'data-i18n-vars');
    if (rawVars) {
      try { vars = JSON.parse(rawVars) as Record<string, string | number>; } catch (_) { vars = undefined; }
    }
    const text = (key: string): string => renderProductStats(catalogText(locale, key, vars));
    for (const [hostAttribute, target] of ATTRIBUTE_HOSTS) {
      const key = attributeValue(tag, hostAttribute);
      if (key && localizedHas(key)) tag = setTagAttribute(tag, target, text(key));
    }
    out += html.slice(copied, match.index) + tag;
    copied = tagPattern.lastIndex;
    const textKey = attributeValue(tag, 'data-i18n');
    const htmlKey = attributeValue(tag, 'data-i18n-html');
    const key = textKey ?? htmlKey;
    if (!key || !localizedHas(key) || VOID_ELEMENTS.has(name) || tag.endsWith('/>')) continue;
    const close = elementEnd(html, name, copied);
    if (!close) continue;
    out += textKey ? escapeText(text(key)) : text(key);
    copied = close.contentEnd;
    tagPattern.lastIndex = close.contentEnd;
  }
  return out + html.slice(copied);
}

/**
 * Produce a crawl-time locale document: discovery metadata, the canonical alternate-language graph, and (for a
 * non-default locale) the body copy itself (localizeBodyHtml).
 */
/** The Field Manual's chapters prerendered in Chinese (tools/docs-prerender.mjs writes them beside the English ones). */
let zhChapters: Record<string, string> | null = null;
const PRERENDERED_CHAPTER = /<main id="topicRoot" data-prerendered="([a-z]+)" data-prerendered-locale="en-US">[\s\S]*?<\/main>/;

/** A prerendered chapter in the page's own locale; one without Chinese markup renders in the page (topics.ts) instead of
 *  showing English. */
function localizeChapter(html: string, locale: SupportedLocale): string {
  return html.replace(PRERENDERED_CHAPTER, (_whole, slug: string) => {
    zhChapters ??= JSON.parse(readFileSync(new URL('../docs/topicPrerender.zh-CN.json', import.meta.url), 'utf8')) as Record<string, string>;
    const markup = locale === 'zh-CN' ? zhChapters[slug] : undefined;
    return markup
      ? `<main id="topicRoot" data-prerendered="${slug}" data-prerendered-locale="${locale}">${renderProductStats(markup)}</main>`
      : '<main id="topicRoot"></main>';
  });
}

/**
 * A localized document's own links stay in its locale: every public route a body anchor names takes the locale's prefix
 * (hrefForLocale; assets, anchors and other sites are left as they are), and a language link, which names its own
 * locale with hreflang, keeps its href. publicNav.ts still rewrites a link on click, but crawlers, link prefetch and
 * readers without scripts now follow the Chinese routes from a Chinese page.
 */
function localizeLinks(html: string, locale: SupportedLocale): string {
  const bodyAt = html.search(/<body\b/i);
  if (bodyAt < 0) return html;
  return html.slice(0, bodyAt) + html.slice(bodyAt).replace(/<(script|style|template)\b[\s\S]*?<\/\1>|<a\b[^>]*>/gi, (tag) => {
    if (!/^<a\b/i.test(tag) || /\shreflang=/i.test(tag)) return tag;
    const href = attributeValue(tag, 'href');
    if (!href || !href.startsWith('/') || href.startsWith('//')) return tag;
    const localized = hrefForLocale(href, locale);
    return localized === href ? tag : setTagAttribute(tag, 'href', localized);
  });
}

export function localizeHtmlDocument(
  html: string,
  route: PublicRouteRecord,
  locale: SupportedLocale,
): string {
  const canonical = `${SITE_ORIGIN}${hrefForLocale(route.pathname, locale)}`;
  const titleKey = route.id === 'notFound' ? 'notFound.metaTitle' : `metadata.${route.id}.title`;
  const descriptionKey = route.id === 'notFound'
    ? 'notFound.metaDescription'
    : `metadata.${route.id}.description`;
  const title = translation(locale, titleKey);
  const description = translation(locale, descriptionKey);
  const imageAlt = translation(locale, 'metadata.imageAlt');

  let output = html.replace(/<html\b[^>]*>/i, (tag) => replaceAttribute(tag, 'lang', locale));
  if (locale !== DEFAULT_LOCALE || route.id === 'notFound') {
    // Catalog text, not markup (security audit 2026-10-22): escaped, and a function replacer so `$&` stays literal.
    output = output.replace(/<title>[\s\S]*?<\/title>/i, () => `<title>${escapeAttribute(title)}</title>`);
    output = replaceMeta(output, 'name', 'description', description);
    output = replaceMeta(output, 'property', 'og:title', title);
    output = replaceMeta(output, 'property', 'og:description', description);
    output = replaceMeta(output, 'name', 'twitter:title', title);
    output = replaceMeta(output, 'name', 'twitter:description', description);
    output = replaceMeta(output, 'property', 'og:image:alt', imageAlt);
    output = replaceMeta(output, 'name', 'twitter:image:alt', imageAlt);
  }
  if (locale !== DEFAULT_LOCALE) output = localizeSocialCards(output, locale);
  output = output.replace(/<link\b[^>]*\brel=["']canonical["'][^>]*>/i,
    (tag) => replaceAttribute(tag, 'href', canonical));
  output = replaceMeta(output, 'property', 'og:url', canonical);
  output = replaceMeta(output, 'property', 'og:locale', locale.replace('-', '_'));
  output = addShareVideo(output, route);
  output = addLocaleLinks(output, route);
  output = addLocaleCatalogPreload(output, locale);
  if (locale !== DEFAULT_LOCALE) output = localizeBodyHtml(output, locale);
  if (locale !== DEFAULT_LOCALE) output = localizeChapter(output, locale);
  if (locale !== DEFAULT_LOCALE) output = localizeLinks(output, locale);
  // Chinese documents carry the zh-CN label floor (the type rules) right after their type head; English ones never do.
  if (locale === 'zh-CN') output = addZhTypeFloor(output, route);
  return localizeStructuredData(output, route, locale);
}

/**
 * The document an HTML entry becomes (vite.config.ts cot-locale-documents, on the dev server and in `vite build`). On
 * the dev server the request names the route (/studio serves index.html, /cn/gallery serves gallery.html in Chinese);
 * a build has no request, so the entry file names its own route, and an entry no public route owns (the manual's topic
 * fallback, the HUD preview) stays as written. Until 265 the build read its missing request as `/`, the game's route,
 * and shipped /home, /gallery, /docs and every chapter with the site root as canonical, og:url and hreflang links.
 */
export function localizeEntryDocument(html: string, entryFile: string, requestUrl?: string): string {
  const request = requestUrl ? new URL(requestUrl, SITE_ORIGIN) : null;
  const localePath = request ? resolveLocalePath(request.pathname) : null;
  const route = localePath?.route ?? publicRouteForEntry(entryFile.split('/').at(-1) || '');
  if (!route) return html;
  const locale = request?.searchParams.get('_cot_locale') === 'zh-CN' || localePath?.locale === 'zh-CN'
    ? 'zh-CN'
    : DEFAULT_LOCALE;
  return localizeHtmlDocument(html, route, locale);
}
