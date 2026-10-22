// media-page-scan.mjs — what media each public page names, read from its markup (brand-ui BUI-F7).
//
// Shared by the media receipts: media-page-unique (no still twice on a page), media-freshness (every media URL on an
// allowlisted round), media-fallback (every <video> has a playable fallback) and site-video-budget (per-page pre-scroll
// sums). Not a selftest itself. Markup is scanned with the same attribute grammar as tools/bundle-budget.mjs; the topic
// pages' headers and figures, which src/docs/topics.ts writes at load, come from its exported data.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const SITE_ORIGIN = 'https://cot.kevinliu.studio';

/** The public documents: the game, the 404 and every page under site/ (each built to its own route). */
export function publicPages(root = ROOT) {
  const site = readdirSync(join(root, 'site')).filter((name) => name.endsWith('.html')).sort().map((name) => `site/${name}`);
  return ['index.html', '404.html', ...site];
}

/** Attributes of one start tag (names lower-cased; values unquoted). */
export function tagAttributes(tag) {
  const attributes = {};
  const body = tag.replace(/^<[a-zA-Z][\w-]*/, '').replace(/\/?>$/, '');
  for (const match of body.matchAll(/([^\s"'<>/=]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'=<>`]+))?/g)) {
    attributes[match[1].toLowerCase()] = (match[2] ?? '').replace(/^["']|["']$/g, '');
  }
  return attributes;
}

/** A site path for a URL the page names (its own origin's absolute URLs included); null for anything else. */
export function sitePath(url) {
  if (!url) return null;
  const trimmed = url.trim().replace(/&amp;/g, '&');
  if (trimmed.startsWith(SITE_ORIGIN)) return trimmed.slice(SITE_ORIGIN.length).split(/[?#]/)[0] || null;
  return trimmed.startsWith('/') && !trimmed.startsWith('//') ? trimmed.split(/[?#]/)[0] : null;
}

/** srcset candidates as [url, width]. */
export function srcsetCandidates(srcset) {
  return (srcset || '').split(',').map((part) => part.trim().split(/\s+/)).filter(([url]) => url)
    .map(([url, descriptor]) => [url, Number.parseInt(descriptor || '0', 10) || 0]);
}

const RASTER = /\.(?:webp|jpe?g|png|avif|gif)$/i;
const VIDEO = /\.(?:webm|mp4|mov)$/i;
/** A picture worth counting as a still (raster media and map art, never an icon or a logo). */
export const isStill = (path) => !!path && RASTER.test(path) && /^\/(?:media|maps|brand\/og)\//.test(path);
export const isVideo = (path) => !!path && VIDEO.test(path);

/**
 * One still's identity across its rungs: `<name>-thumb`, `-640`, `-1280`, `-1920`, `-2560` and a map's 1280 card are
 * the same picture as `<name>`.
 */
export function stillIdentity(path) {
  return path.replace(/^\/maps\/cards\//, '/maps/').replace(/-(?:thumb|640|1280|1920|2560)(?=\.\w+$)/, '').replace(/\.\w+$/, '');
}

/**
 * The media elements of one HTML document, in order. Each record: { tag, attrs, element, stills: [path], videos:
 * [{ src, type, rung, attrs }], poster, eager } — `eager` when the browser fetches it before any script or scroll
 * (a src without loading="lazy", a poster attribute, a preload link, an inline background).
 */
export function pageMedia(html) {
  const records = [];
  let element = 0;
  // <video>...</video> first (its <source> children belong to it), then everything else outside them
  const videoSpans = [];
  for (const match of html.matchAll(/<video\b[^>]*>([\s\S]*?)<\/video>/gi)) {
    const open = match[0].match(/^<video\b[^>]*>/i)[0];
    const attrs = tagAttributes(open);
    const sources = [...match[1].matchAll(/<source\b[^>]*>/gi)].map((source) => tagAttributes(source[0]));
    const ladder = [];
    for (const source of sources) {
      const src = sitePath(source.src || source['data-src']);
      if (src) ladder.push({ src, type: source.type || source['data-type'] || '', rung: source['data-rung'] || '', deferred: !source.src });
      const fallback = sitePath(source['data-fallback-src']);
      if (fallback) ladder.push({ src: fallback, type: source['data-fallback-type'] || '', rung: '', deferred: true });
      const mobile = sitePath(source['data-mobile-src']);
      if (mobile) ladder.push({ src: mobile, type: source['data-mobile-type'] || '', rung: 'phone', deferred: true });
    }
    const direct = sitePath(attrs.src);
    if (direct) ladder.unshift({ src: direct, type: '', rung: '', deferred: false });
    const poster = sitePath(attrs.poster || attrs['data-poster']);
    records.push({
      tag: 'video', attrs, element: element++, index: match.index, videos: ladder, stills: poster ? [poster] : [],
      poster, eagerPoster: !!attrs.poster,
      autoplay: 'autoplay' in attrs, preload: attrs.preload ?? 'auto',
      eager: !!attrs.poster || ('autoplay' in attrs) || (!!direct && attrs.preload !== 'none'),
    });
    videoSpans.push([match.index, match.index + match[0].length]);
  }
  const inVideo = (index) => videoSpans.some(([start, end]) => index >= start && index < end);
  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    if (inVideo(match.index)) continue;
    const attrs = tagAttributes(match[0]);
    const src = sitePath(attrs.src);
    const deferred = sitePath(attrs['data-src'] || attrs['data-deferred-src']);
    const candidates = srcsetCandidates(attrs.srcset).map(([url]) => sitePath(url)).filter(Boolean);
    const stills = [...new Set([src, deferred, ...candidates].filter(isStill))];
    if (!stills.length) continue;
    records.push({
      tag: 'img', attrs, element: element++, index: match.index, stills, videos: [],
      eager: !!src && attrs.loading !== 'lazy',
      srcset: srcsetCandidates(attrs.srcset).map(([url, width]) => [sitePath(url), width]),
      src, deferred,
    });
  }
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const attrs = tagAttributes(match[0]);
    if (!/\bpreload\b/.test(attrs.rel || '') || !['image', 'video'].includes(attrs.as)) continue;
    const href = sitePath(attrs.href);
    if (!href) continue;
    records.push({ tag: 'link', attrs, element: element++, index: match.index, stills: isStill(href) ? [href] : [],
      videos: isVideo(href) ? [{ src: href, type: attrs.type || '', rung: '' }] : [], eager: true, preload: href });
  }
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = tagAttributes(match[0]);
    const key = attrs.property || attrs.name || '';
    if (!/^(?:og:image|twitter:image)$/.test(key)) continue;
    const content = sitePath(attrs.content);
    if (content) records.push({ tag: 'meta', attrs, element: element++, index: match.index, stills: [], videos: [], og: content, eager: false });
  }
  for (const match of html.matchAll(/\sstyle="([^"]*url\([^"]*)"/gi)) {
    if (inVideo(match.index)) continue;
    const urls = [...match[1].matchAll(/url\((['"]?)([^'")]+)\1\)/g)].map((url) => sitePath(url[2])).filter(isStill);
    if (urls.length) records.push({ tag: 'style', attrs: {}, element: element++, index: match.index, stills: urls, videos: [], eager: true });
  }
  return records.sort((a, b) => a.index - b.index);
}

/** The topic page a site/docs-<slug>.html entry renders (src/docs/topics.ts), or null. */
export const topicSlug = (page) => /^site\/docs-([a-z]+)\.html$/.exec(page)?.[1] ?? null;

let topicModule = null;
/** src/docs/topics.ts, loaded once (it renders nothing without a document). */
export async function topicData() {
  topicModule ??= await import('../src/docs/topics.ts');
  return topicModule;
}

/** The media a topic page's script writes: its header (as markup) and its two figures. */
export async function topicPageMedia(slug) {
  const { topics, topicHeroMarkup, TOPIC_FIGURE_SIZES } = await topicData();
  const topic = topics[slug] ?? topics.simulation;
  const hero = pageMedia(topicHeroMarkup(topic.hero, topic.label, false));
  const saving = pageMedia(topicHeroMarkup(topic.hero, topic.label, true));
  const figures = topic.media.map(([src]) => ({
    tag: 'img', attrs: {}, element: -1, stills: [src], videos: [], eager: false, src, figure: true,
    size: TOPIC_FIGURE_SIZES[src] ?? null,
  }));
  return { topic, hero, saving, figures };
}

/** Bytes of a public path on disk (0 when it is missing). */
export function bytesOf(path, root = ROOT) {
  const file = join(root, 'public', path.replace(/^\//, ''));
  return existsSync(file) ? statSync(file).size : 0;
}

export const existsPublic = (path, root = ROOT) => existsSync(join(root, 'public', path.replace(/^\//, '')));

/** The intrinsic size of a webp, jpeg or png on disk, from its header; null if unknown. */
export function imageSize(path, root = ROOT) {
  const file = join(root, 'public', path.replace(/^\//, ''));
  if (!existsSync(file)) return null;
  const buffer = readFileSync(file);
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = buffer.toString('ascii', 12, 16);
    if (chunk === 'VP8X') return [1 + buffer.readUIntLE(24, 3), 1 + buffer.readUIntLE(27, 3)];
    if (chunk === 'VP8 ') return [buffer.readUInt16LE(26) & 0x3fff, buffer.readUInt16LE(28) & 0x3fff];
    if (chunk === 'VP8L') {
      const bits = buffer.readUInt32LE(21);
      return [1 + (bits & 0x3fff), 1 + ((bits >> 14) & 0x3fff)];
    }
    return null;
  }
  if (buffer[0] === 0x89 && buffer.toString('ascii', 1, 4) === 'PNG') return [buffer.readUInt32BE(16), buffer.readUInt32BE(20)];
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    for (let at = 2; at < buffer.length - 9;) {
      if (buffer[at] !== 0xff) { at++; continue; }
      const marker = buffer[at + 1];
      const length = buffer.readUInt16BE(at + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return [buffer.readUInt16BE(at + 7), buffer.readUInt16BE(at + 5)];
      }
      at += 2 + length;
    }
  }
  return null;
}
