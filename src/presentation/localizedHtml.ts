import { catalogText } from '../ui/i18nCatalog.ts';
import {
  DEFAULT_LOCALE,
  hrefForLocale,
  type PublicRouteRecord,
  type SupportedLocale,
} from '../ui/localeRouting.ts';
import { SITE_ORIGIN } from './siteMetadata.ts';

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

function translation(locale: SupportedLocale, key: string): string {
  return catalogText(locale, key);
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
  return html.replace(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi,
    (block, source: string) => {
      try {
        const value = JSON.parse(source) as unknown;
        const visit = (node: unknown): void => {
          if (!node || typeof node !== 'object') return;
          if (Array.isArray(node)) {
            for (const child of node) visit(child);
            return;
          }
          const record = node as Record<string, unknown>;
          for (const [key, child] of Object.entries(record)) {
            if (key === 'inLanguage') record[key] = locale;
            else if (typeof child === 'string' &&
              (child === englishCanonical || child.startsWith(`${englishCanonical}#`))) {
              record[key] = `${localizedCanonical}${child.slice(englishCanonical.length)}`;
            } else visit(child);
          }
        };
        visit(value);
        return `<script type="application/ld+json">${JSON.stringify(value)}</script>`;
      } catch (_) {
        return block;
      }
    },
  );
}

/**
 * Produce a crawl-time locale document. Visible body copy is still owned by
 * the runtime data-i18n pass; this owner localizes discovery metadata before
 * JavaScript and adds the canonical alternate-language graph.
 */
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
    output = output.replace(/<title>[\s\S]*?<\/title>/i, `<title>${title}</title>`);
    output = replaceMeta(output, 'name', 'description', description);
    output = replaceMeta(output, 'property', 'og:title', title);
    output = replaceMeta(output, 'property', 'og:description', description);
    output = replaceMeta(output, 'name', 'twitter:title', title);
    output = replaceMeta(output, 'name', 'twitter:description', description);
    output = replaceMeta(output, 'property', 'og:image:alt', imageAlt);
    output = replaceMeta(output, 'name', 'twitter:image:alt', imageAlt);
  }
  output = output.replace(/<link\b[^>]*\brel=["']canonical["'][^>]*>/i,
    (tag) => replaceAttribute(tag, 'href', canonical));
  output = replaceMeta(output, 'property', 'og:url', canonical);
  output = replaceMeta(output, 'property', 'og:locale', locale.replace('-', '_'));
  output = addLocaleLinks(output, route);
  return localizeStructuredData(output, route, locale);
}
