import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRODUCT_STATS, renderProductStats } from '../productStats.ts';
// The server-side catalog (as middleware.ts loads it): both locales resident for the metadata helpers.
import '../ui/i18nCatalog.ts';
import { privateRoomMetadata, STUDIO_METADATA } from './siteMetadata.ts';
import { hrefForLocale, PUBLIC_ROUTE_RECORDS } from '../ui/localeRouting.ts';
import { localizeHtmlDocument } from './localizedHtml.ts';
import { resolveVercelRequest, vercelJsonRoutes } from '../../tools/vercelRoutes.test-support.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SITE = 'https://cot.kevinliu.studio';
const indexedPages = new Map([
  ['index.html', `${SITE}/`],
  ['site/home.html', `${SITE}/home`],
  ['site/gallery.html', `${SITE}/gallery`],
  ['site/docs.html', `${SITE}/docs`],
  // every manual chapter is its own indexed page (src/ui/localeRouting.ts PUBLIC_ROUTE_RECORDS)
  ...PUBLIC_ROUTE_RECORDS.filter((route) => /^\/docs\/[a-z]+$/.test(route.pathname))
    .map((route) => [`site/${route.sourceHtml}`, `${SITE}${route.pathname}`]),
]);
const socialCards = new Map([
  ['index.html', 'brand/og-image.png'],
  ['site/home.html', 'brand/og/home.jpg'],
  ['site/gallery.html', 'brand/og/gallery.jpg'],
  ['site/docs.html', 'brand/og/docs.jpg'],
  ...[...indexedPages.keys()]
    .filter((file) => file.startsWith('site/docs-'))
    .map((file) => [file, `brand/og/${file.replace(/^site\//, '').replace(/\.html$/, '')}.jpg`]),
]);

function attribute(html, element, key, value, wanted = 'content') {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tag = html.match(new RegExp(`<${element}[^>]+${key}=["']${escaped}["'][^>]*>`, 'i'))?.[0];
  if (!tag) return '';
  // the value runs to its own closing quote: an apostrophe inside a double-quoted attribute is text
  return tag.match(new RegExp(`${wanted}=(["'])(.*?)\\1`, 'i'))?.[2] ?? '';
}

const titles = new Set();
const descriptions = new Set();
const images = new Set();
const openGraphTitles = new Set();
const openGraphDescriptions = new Set();
for (const [file, canonical] of indexedPages) {
  const html = renderProductStats(readFileSync(join(ROOT, file), 'utf8'));
  const title = html.match(/<title>([^<]+)<\/title>/i)?.[1] ?? '';
  const description = attribute(html, 'meta', 'name', 'description');
  assert.ok(title.length <= 80 && title.includes('Claude of Tanks'), `${file} needs a title that names the game`);
  // one title form (coordinator, 248): the manual's pages read "<page> · Claude of Tanks" in the tab and in both share
  // titles; the "Field Manual" wording belongs in the description
  if (/^site\/docs/.test(file)) {
    assert.match(title, /^[^·]+ · Claude of Tanks$/, `${file} title "${title}" is "<page> · Claude of Tanks"`);
    assert.equal(attribute(html, 'meta', 'property', 'og:title'), title, `${file} Open Graph title repeats the tab title`);
    assert.equal(attribute(html, 'meta', 'name', 'twitter:title'), title, `${file} Twitter title repeats the tab title`);
  }
  assert.ok(description.length >= 100 && description.length <= 240, `${file} needs a detailed meta description`);
  const head = html.match(/<head>([\s\S]*?)<\/head>/i)?.[1] ?? '';
  for (const [, total] of head.matchAll(/\b(\d+)\s+(?:authored\s+)?battlefields\b/gi)) {
    assert.equal(Number(total), PRODUCT_STATS.battlefields,
      `${file} head battlefield counts must match the canonical total, including title/social/JSON-LD`);
  }
  if (file === 'index.html') assert.match(title, new RegExp(`\\b${PRODUCT_STATS.battlefields} Battlefields\\b`));
  assert.ok(!titles.has(title), `${file} duplicates a title`);
  assert.ok(!descriptions.has(description), `${file} duplicates a meta description`);
  titles.add(title);
  descriptions.add(description);

  assert.equal(attribute(html, 'link', 'rel', 'canonical', 'href'), canonical, `${file} canonical drifted`);
  assert.equal(attribute(html, 'meta', 'property', 'og:url'), canonical, `${file} Open Graph URL drifted`);
  const socialCard = socialCards.get(file);
  const socialImage = `${SITE}/${socialCard}`;
  assert.equal(attribute(html, 'meta', 'property', 'og:image'), socialImage, `${file} Open Graph image drifted`);
  assert.ok(!images.has(socialImage), `${file} must have a route-specific Open Graph image`);
  images.add(socialImage);
  const openGraphTitle = attribute(html, 'meta', 'property', 'og:title');
  const openGraphDescription = attribute(html, 'meta', 'property', 'og:description');
  assert.ok(!openGraphTitles.has(openGraphTitle), `${file} duplicates an Open Graph title`);
  assert.ok(!openGraphDescriptions.has(openGraphDescription), `${file} duplicates an Open Graph description`);
  openGraphTitles.add(openGraphTitle);
  openGraphDescriptions.add(openGraphDescription);
  assert.equal(attribute(html, 'meta', 'property', 'og:image:width'), '1200');
  assert.equal(attribute(html, 'meta', 'property', 'og:image:height'), '630');
  assert.equal(attribute(html, 'meta', 'property', 'og:image:type'), socialCard.endsWith('.png') ? 'image/png' : 'image/jpeg');
  assert.ok(attribute(html, 'meta', 'property', 'og:image:alt'), `${file} needs Open Graph image alt text`);
  assert.equal(attribute(html, 'meta', 'name', 'twitter:card'), 'summary_large_image');
  assert.ok(attribute(html, 'meta', 'name', 'twitter:title'), `${file} needs a Twitter title`);
  assert.ok(attribute(html, 'meta', 'name', 'twitter:description'), `${file} needs a Twitter description`);
  assert.equal(attribute(html, 'meta', 'name', 'twitter:image'), socialImage);
  assert.ok(attribute(html, 'meta', 'name', 'twitter:image:alt'), `${file} needs Twitter image alt text`);
  assert.match(attribute(html, 'meta', 'name', 'robots'), /index, follow/);
  assert.match(attribute(html, 'meta', 'name', 'robots'), /max-image-preview:large/);
  assert.equal(attribute(html, 'link', 'rel', 'describedby', 'href'), '/llms.txt');
  assert.equal(attribute(html, 'link', 'rel', 'manifest', 'href'), '/site.webmanifest');
  assert.match(html, /<meta name="author" content="Kevin B\. Liu"/);

  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  assert.ok(blocks.length > 0, `${file} needs JSON-LD`);
  for (const [, json] of blocks) assert.doesNotThrow(() => JSON.parse(json), `${file} has invalid JSON-LD`);
}

// /cn: the manual's pages carry the Chinese title in the tab and both share titles, and their JSON-LD names and
// headlines are the zh catalog's (the localizer renders product-stat tokens first, so every block parses)
for (const route of PUBLIC_ROUTE_RECORDS.filter((record) => record.id === 'docs' || /^docs[A-Z]/.test(record.id))) {
  const file = `site/${route.sourceHtml}`;
  const zh = localizeHtmlDocument(readFileSync(join(ROOT, file), 'utf8'), route, 'zh-CN');
  const title = zh.match(/<title>([^<]+)<\/title>/i)?.[1] ?? '';
  assert.match(title, /^[^·]*[一-鿿][^·]* · Claude of Tanks$/, `/cn ${file} title "${title}" is "<页面> · Claude of Tanks"`);
  assert.equal(attribute(zh, 'meta', 'property', 'og:title'), title, `/cn ${file} Open Graph title repeats the tab title`);
  const english = [];
  for (const [, json] of zh.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    const visit = (node) => {
      if (!node || typeof node !== 'object') return;
      for (const [key, value] of Object.entries(node)) {
        if ((key === 'name' || key === 'headline') && typeof value === 'string' && !/[一-鿿]/.test(value)
          && !['Claude of Tanks', 'Kevin B. Liu'].includes(value)) english.push(`${key} "${value}"`);
        else visit(value);
      }
    };
    visit(JSON.parse(json));
  }
  assert.deepEqual(english, [], `/cn ${file} JSON-LD names and headlines are Chinese`);
}

// /cn: the landing's and the Gallery's JSON-LD names are the zh catalog's too (the landing's page names itself by its
// catalog title; the Gallery's fleet list by metadata.gallery.listName)
for (const route of PUBLIC_ROUTE_RECORDS.filter((record) => record.id === 'home' || record.id === 'gallery')) {
  const zh = localizeHtmlDocument(readFileSync(join(ROOT, `site/${route.sourceHtml}`), 'utf8'), route, 'zh-CN');
  const english = [];
  for (const [, json] of zh.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    const visit = (node) => {
      if (!node || typeof node !== 'object') return;
      for (const [key, value] of Object.entries(node)) {
        if (key === 'name' && typeof value === 'string' && !/[一-鿿]/.test(value)
          && !['Claude of Tanks', 'Kevin B. Liu'].includes(value)) english.push(`name "${value}"`);
        else visit(value);
      }
    };
    visit(JSON.parse(json));
  }
  assert.deepEqual(english, [], `/cn ${route.sourceHtml} JSON-LD names are Chinese`);
}

function imageDimensions(path) {
  const buffer = readFileSync(path);
  if (buffer.length >= 24 && buffer.toString('ascii', 12, 16) === 'IHDR') {
    return [buffer.readUInt32BE(16), buffer.readUInt32BE(20)];
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 8 < buffer.length) {
      if (buffer[offset] !== 0xff) { offset += 1; continue; }
      const marker = buffer[offset + 1];
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return [buffer.readUInt16BE(offset + 7), buffer.readUInt16BE(offset + 5)];
      }
      if (marker === 0xd8 || marker === 0xd9) { offset += 2; continue; }
      offset += 2 + buffer.readUInt16BE(offset + 2);
    }
  }
  return [0, 0];
}

for (const card of socialCards.values()) {
  const cardPath = join(ROOT, 'public', card);
  assert.ok(existsSync(cardPath), `missing public/${card}`);
  assert.deepEqual(imageDimensions(cardPath), [1200, 630], `public/${card} must be 1200x630`);
}

const topicFallback = renderProductStats(readFileSync(join(ROOT, 'site/docs-topic.html'), 'utf8'));
assert.match(attribute(topicFallback, 'meta', 'name', 'robots'), /noindex, follow/);
assert.equal(attribute(topicFallback, 'link', 'rel', 'canonical', 'href'), `${SITE}/docs`);

const sitemap = readFileSync(join(ROOT, 'public/sitemap.xml'), 'utf8');
const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
const expectedLocaleUrls = PUBLIC_ROUTE_RECORDS.filter(({ indexable }) => indexable)
  .flatMap(({ pathname }) => [`${SITE}${pathname}`, `${SITE}${hrefForLocale(pathname, 'zh-CN')}`]);
assert.deepEqual(sitemapUrls, expectedLocaleUrls, 'sitemap must exactly match both locale route sets');
assert.equal(new Set(sitemapUrls).size, sitemapUrls.length, 'sitemap URLs must be unique');
assert.doesNotMatch(sitemap, /<priority>|<changefreq>/, 'sitemap must not invent update priorities');
assert.match(sitemap, /xmlns:xhtml="http:\/\/www\.w3\.org\/1999\/xhtml"/);
assert.equal((sitemap.match(/hreflang="en-US"/g) || []).length, sitemapUrls.length);
assert.equal((sitemap.match(/hreflang="zh-CN"/g) || []).length, sitemapUrls.length);
assert.equal((sitemap.match(/hreflang="x-default"/g) || []).length, sitemapUrls.length);

const robots = readFileSync(join(ROOT, 'public/robots.txt'), 'utf8');
assert.match(robots, new RegExp(`Sitemap: ${SITE.replace(/[.]/g, '\\.')}\/sitemap\\.xml`));
for (const agent of ['OAI-SearchBot', 'ChatGPT-User', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot', 'Perplexity-User']) {
  assert.match(robots, new RegExp(`User-agent: ${agent}`), `robots.txt must name ${agent}`);
}

for (const file of ['llms.txt', 'llms-full.txt', 'docs/llms.txt', 'humans.txt', 'pricing.txt', '.well-known/security.txt', 'site.webmanifest']) {
  assert.ok(existsSync(join(ROOT, 'public', file)), `missing public/${file}`);
}
const llms = readFileSync(join(ROOT, 'public/llms.txt'), 'utf8');
assert.match(llms, /^# Claude of Tanks\r?\n\r?\n>/);
assert.match(llms, new RegExp(`${PRODUCT_STATS.productionVehicles} first-party procedural vehicles`));
assert.match(llms, new RegExp(`${PRODUCT_STATS.battlefields} authored battlefields`));
assert.match(llms, /## Technical documentation/);
assert.match(llms, new RegExp(`${SITE.replace(/[.]/g, '\\.')}\/llms-full\\.txt`));
const llmsFull = readFileSync(join(ROOT, 'public/llms-full.txt'), 'utf8');
assert.ok(llmsFull.length > 7000, 'llms-full.txt must remain a substantive public reference');
assert.match(llmsFull, /## Source hierarchy and citation guidance/);
assert.match(llmsFull, /not real-world protection, engineering, or survivability assessments/);

const manifest = JSON.parse(readFileSync(join(ROOT, 'public/site.webmanifest'), 'utf8'));
assert.equal(manifest.name, 'Claude of Tanks');
assert.equal(manifest.start_url, '/');
assert.equal(manifest.scope, '/');
for (const icon of manifest.icons) assert.ok(existsSync(join(ROOT, 'public', icon.src.replace(/^\//, ''))), `missing manifest icon ${icon.src}`);

const publicMetadata = [
  ...indexedPages.keys(), 'site/docs-topic.html', 'public/robots.txt', 'public/sitemap.xml',
].map((file) => readFileSync(join(ROOT, file), 'utf8')).join('\n');
assert.doesNotMatch(publicMetadata, /https:\/\/claude-of-tanks\.vercel\.app/, 'former deployment must not remain canonical');
const homeVisibleText = renderProductStats(readFileSync(join(ROOT, 'site/home.html'), 'utf8'))
  .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
assert.doesNotMatch(homeVisibleText, /16 battlefields/);
assert.doesNotMatch(homeVisibleText, /(?:Choose from |Drive )111 tanks|111 production vehicles/);
const currentPublicCopy = [
  'index.html', 'site/home.html', 'site/gallery.html', 'site/docs.html', 'site/docs-tanks.html',
  'README.md', 'public/llms.txt', 'public/llms-full.txt', 'public/docs/llms.txt',
].map((file) => renderProductStats(readFileSync(join(ROOT, file), 'utf8'))).join('\n');
assert.doesNotMatch(currentPublicCopy, /111 (?:production|first-party procedural)|148 keyed|150 saved/,
  `public fleet facts must track the canonical ${PRODUCT_STATS.productionVehicles} / ${PRODUCT_STATS.developmentVehicles} / ${PRODUCT_STATS.savedVehicleRecords} roster projections`);
assert.doesNotMatch(renderProductStats(readFileSync(join(ROOT, 'site/docs.html'), 'utf8')),
  /16 (?:maps|authored battlefields)/);
assert.doesNotMatch(readFileSync(join(ROOT, 'src/docs/topics.ts'), 'utf8'), /Sixteen battlefields/);

assert.equal(STUDIO_METADATA.image, `${SITE}/brand/og/studio.jpg`);
assert.match(STUDIO_METADATA.description, /maps, cameras, weather/);
const privateMetadata = privateRoomMetadata(new URL(`${SITE}/?room=HKP5XW&mode=lan&host=Commander+09HY`));
assert.ok(privateMetadata, 'valid private-room links need crawler metadata');
assert.match(privateMetadata.title, /Commander 09HY’s LAN Battle/);
assert.match(privateMetadata.description, /room HKP5XW/);
assert.match(privateMetadata.robots, /noindex, nofollow, noarchive/);
assert.equal(privateMetadata.image, `${SITE}/brand/og/private-room.jpg`);
assert.equal(privateMetadata.canonical, `${SITE}/`, 'temporary room codes must never become indexed canonicals');
const chinesePrivateMetadata = privateRoomMetadata(
  new URL(`${SITE}/cn/?room=HKP5XW&mode=lan&host=Commander+09HY`),
  'zh-CN',
);
assert.match(chinesePrivateMetadata?.title || '', /加入 Commander 09HY 的 LAN 对战/);
assert.match(chinesePrivateMetadata?.description || '', /HKP5XW/,
  'localized metadata must preserve the dynamic room-code placeholder');
assert.equal(chinesePrivateMetadata?.canonical, `${SITE}/cn/`);
// (boot r23, 4921a457c5: the Chinese title spaces a Latin host name on its sides only, '加入' + (...) + hostName)
assert.match(readFileSync(join(ROOT, 'index.html'), 'utf8'),
  /chineseRoute \? '加入 ?'[^:]*hostName/,
  'the pre-boot private-room banner must not flash English on a Chinese route');
assert.match(privateRoomMetadata(new URL(`${SITE}/?room=I0O123`))?.description || '', /room LQQL23/,
  'crawler metadata must normalize ambiguous room characters exactly like the lobby');

// vercel.json publishes the docs topics through pattern rewrites (INFRA-P20, 2026-10-01): resolve each canonical path
// (and its /cn twin) through the routes `vercel build` derives, and require the page's own document.
const vercelRoutes = vercelJsonRoutes(JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8')));
for (const [file, canonical] of [...indexedPages].filter(([file]) => file.startsWith('site/docs-'))) {
  const path = new URL(canonical).pathname;
  const document = `/${file.slice('site/'.length)}`;
  for (const [requestPath, served] of [[path, document], [`/cn${path}`, `/cn${document}`]]) {
    const resolved = resolveVercelRequest(vercelRoutes, { path: requestPath }, new Set([served]));
    assert.deepEqual([resolved.status, resolved.file], [200, served], `${file} must be published at ${requestPath}`);
  }
}

// og:url (265): every public page shares its own canonical URL, in both languages, as a visitor gets it. The heads above
// are sources; production serves the build's. The English pages here are the Vite entry transform run as `vite build`
// runs it (vite.config.ts cot-locale-documents, with no request URL: read as `/`, that once gave /home, /gallery, /docs
// and every chapter the site root as canonical, og:url and hreflang links); the /cn pages are
// tools/generate-localized-pages.mjs's over those; /studio, /cn/studio and an unknown /cn path's 404 are middleware.ts's
// over the built shells. The build's other HTML transforms never touch these tags.
/** Every content value a document gives one meta key, in order: a duplicated tag shows twice. */
function metaValues(html, selector, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...html.matchAll(new RegExp(`<meta\\b[^>]*\\b${selector}=["']${escaped}["'][^>]*>`, 'gi'))]
    .map(([tag]) => tag.match(/\bcontent=(["'])(.*?)\1/i)?.[2] ?? '');
}

/** What an mp4 says of itself: its top-level box order, length, and each track's handler, size and codec. */
function mp4Facts(file) {
  const bytes = readFileSync(file);
  const facts = { topLevel: [], seconds: 0, tracks: [] };
  const walk = (start, end, depth, track) => {
    for (let at = start; at + 8 <= end;) {
      let size = bytes.readUInt32BE(at);
      const type = bytes.toString('latin1', at + 4, at + 8);
      let body = at + 8;
      if (size === 1) { size = Number(bytes.readBigUInt64BE(at + 8)); body += 8; } else if (size === 0) size = end - at;
      const next = at + size;
      if (size < 8) break;
      if (depth === 0) facts.topLevel.push(type);
      const v1 = bytes[body] === 1;
      if (type === 'trak') {
        const child = {};
        facts.tracks.push(child);
        walk(body, next, depth + 1, child);
      } else if (['moov', 'mdia', 'minf', 'stbl'].includes(type)) walk(body, next, depth + 1, track);
      else if (type === 'mvhd') {
        const timescale = bytes.readUInt32BE(body + (v1 ? 20 : 12));
        facts.seconds = (v1 ? Number(bytes.readBigUInt64BE(body + 24)) : bytes.readUInt32BE(body + 16)) / timescale;
      } else if (type === 'tkhd' && track) {
        const at16 = body + (v1 ? 88 : 76); // 16.16 fixed point, after the matrix
        track.width = bytes.readUInt32BE(at16) / 65536;
        track.height = bytes.readUInt32BE(at16 + 4) / 65536;
      } else if (type === 'hdlr' && track) track.handler = bytes.toString('latin1', body + 8, body + 12);
      else if (type === 'stsd' && track) walk(body + 8, next, depth + 1, track);
      else if (type === 'avc1' && track) {
        track.codec = type;
        walk(body + 78, next, depth + 1, track); // past the visual sample entry: its avcC
      } else if (type === 'avcC' && track) [track.profile, track.level] = [bytes[body + 1], bytes[body + 3]];
      at = next;
    }
  };
  walk(0, bytes.length, 0, null);
  return facts;
}

// The share clips (266): the owner's media election (2026-10-30) gave each page family one published clip, used as it
// is. Each must stay inside the limits it was chosen under: H.264 High at level 4.0 or lower, faststart (moov before
// mdat), one video track and no audio, at most 10 s and 3 MB (Apple Messages caps a preview's video and image at
// 10 MB together, TN3156).
const SHARE_CLIPS = {
  game: '/media/home-r2/vs03-reservoir-k2-vt4a1-1280.mp4',
  gallery: '/media/home-r2/fleet-montage.mp4',
  docs: '/media/docs-hero-r2/verdant-challenger3-t80u-mobile.mp4',
  studio: '/media/home-r2/studio-246.mp4',
};
/** The game's clip on the game, the landing and the 404; the manual's on its index and every chapter. */
const clipFamily = (route) => (route.id === 'gallery' || route.id === 'studio' ? route.id
  : route.id.startsWith('docs') ? 'docs' : 'game');
const shareClips = new Map();
for (const [family, path] of Object.entries(SHARE_CLIPS)) {
  const file = join(ROOT, 'public', path);
  assert.ok(existsSync(file), `the ${family} share clip public${path} is published`);
  const facts = mp4Facts(file);
  const video = facts.tracks.filter((track) => track.handler === 'vide');
  assert.equal(video.length, 1, `${path} has one video track`);
  assert.deepEqual(facts.tracks.map((track) => track.handler), ['vide'], `${path} carries no audio or other track`);
  assert.deepEqual([video[0].codec, video[0].profile], ['avc1', 100], `${path} is H.264 High`);
  assert.ok(video[0].level <= 40, `${path} is level 4.0 or lower (${video[0].level / 10})`);
  assert.ok(facts.topLevel.indexOf('moov') >= 0 && facts.topLevel.indexOf('moov') < facts.topLevel.indexOf('mdat'),
    `${path} is faststart (${facts.topLevel.join(' ')})`);
  assert.ok(facts.seconds > 0 && facts.seconds <= 10, `${path} runs at most 10 s (${facts.seconds} s)`);
  assert.ok(statSync(file).size <= 3e6, `${path} is at most 3 MB (${statSync(file).size} bytes)`);
  assert.ok(video[0].width >= 640 && Number.isInteger(video[0].width) && Number.isInteger(video[0].height),
    `${path} names whole-pixel dimensions (${video[0].width}x${video[0].height})`);
  shareClips.set(family, { url: `${SITE}${path}`, width: String(video[0].width), height: String(video[0].height) });
}

const viteConfig = (await import('../../vite.config.ts')).default;
const localeDocuments = viteConfig.plugins.flat(Infinity).find((plugin) => plugin?.name === 'cot-locale-documents');
assert.ok(localeDocuments, 'vite.config.ts names its locale-document transform cot-locale-documents');
const transformEntry = typeof localeDocuments.transformIndexHtml === 'function'
  ? localeDocuments.transformIndexHtml : localeDocuments.transformIndexHtml.handler;
/** One entry as the build emits it: Vite's build context names the entry file and carries no request URL. */
const buildEntry = (file) => transformEntry(renderProductStats(readFileSync(join(ROOT, file), 'utf8')),
  { path: `/${file}`, filename: join(ROOT, file) });
const built = mkdtempSync(join(tmpdir(), 'cot-og-url-'));
const originalFetch = globalThis.fetch;
const pageUrls = [];
try {
  for (const sourceHtml of new Set(PUBLIC_ROUTE_RECORDS.map((route) => route.sourceHtml))) {
    // the build's output names (cot-site-entry-output moves site/<page>.html to the root)
    writeFileSync(join(built, sourceHtml), buildEntry(existsSync(join(ROOT, sourceHtml)) ? sourceHtml : `site/${sourceHtml}`));
  }
  mkdirSync(join(built, 'cn'));
  const generated = spawnSync(process.execPath, [join(ROOT, 'tools/generate-localized-pages.mjs'), `--dir=${built}`],
    { encoding: 'utf8' });
  assert.equal(generated.status, 0, `tools/generate-localized-pages.mjs failed: ${generated.stderr}`);
  const { default: middleware } = await import('../../middleware.ts');
  globalThis.fetch = async (url) => new Response(readFileSync(join(built, new URL(String(url)).pathname), 'utf8'),
    { headers: { 'content-type': 'text/html' } });
  const served = async (path) => (await middleware(new Request(`${SITE}${path}`, { headers: { accept: 'text/html' } }))).text();
  const pages = [];
  for (const route of PUBLIC_ROUTE_RECORDS) {
    for (const locale of ['en-US', 'zh-CN']) {
      const path = hrefForLocale(route.pathname, locale);
      const html = route.id === 'studio'
        ? await served(path)
        : readFileSync(join(built, locale === 'en-US' ? route.sourceHtml : `cn/${route.localizedHtml}`), 'utf8');
      pages.push({ label: path, html, route, canonical: `${SITE}${path}` });
    }
  }
  const notFound = PUBLIC_ROUTE_RECORDS.find((route) => route.id === 'notFound');
  pages.push({ label: '/cn/no-such-page', html: await served('/cn/no-such-page'), route: notFound,
    canonical: `${SITE}${hrefForLocale(notFound.pathname, 'zh-CN')}` });
  const failures = [];
  for (const { label, html, route, canonical } of pages) {
    const ogUrl = attribute(html, 'meta', 'property', 'og:url');
    const link = attribute(html, 'link', 'rel', 'canonical', 'href');
    pageUrls.push(`${label} ${ogUrl}`);
    if (ogUrl !== canonical) failures.push(`${label}: og:url ${ogUrl || '(missing)'} is not ${canonical}`);
    // the 404 is noindex and answers every unknown path: it may name no canonical, never another page's
    if (route.indexable ? link !== canonical : link && link !== canonical) {
      failures.push(`${label}: canonical ${link || '(missing)'} is not ${canonical}`);
    }
    if (!route.indexable) continue;
    const english = `${SITE}${route.pathname}`;
    for (const [hreflang, href] of [['en-US', english], ['zh-CN', `${SITE}${hrefForLocale(route.pathname, 'zh-CN')}`],
      ['x-default', english]]) {
      const alternate = attribute(html, 'link', 'hreflang', hreflang, 'href');
      if (alternate !== href) failures.push(`${label}: hreflang ${hreflang} ${alternate || '(missing)'} is not ${href}`);
    }
  }
  assert.deepEqual(failures, [], 'every public page, as served, shares its own canonical URL');
  // the manual's noindex topic fallback keeps its own canonical (the index) through the build
  assert.equal(attribute(buildEntry('site/docs-topic.html'), 'link', 'rel', 'canonical', 'href'), `${SITE}/docs`,
    'the built topic fallback keeps the manual index as its canonical');

  // og:video (266): the same pages, as served, each share their family's clip. Apple Messages plays a direct mp4 that
  // og:video names; Discord plays one inline only for og:type video.other, an https video/mp4 and exactly one og:image
  // (a second turns the embed into a gallery). X, Slack, Bluesky and Mastodon never play og:video, so twitter:card
  // stays summary_large_image and no twitter:player is named. Each tag appears once, and its size is the file's own.
  const videoFailures = [];
  const expectOne = (label, html, selector, key, wanted) => {
    const values = metaValues(html, selector, key);
    if (values.length !== 1 || values[0] !== wanted) {
      videoFailures.push(`${label}: ${key} ${values.length ? values.join(' + ') : '(missing)'} is not ${wanted}`);
    }
  };
  const expectClip = (label, html, clip) => {
    expectOne(label, html, 'property', 'og:type', 'video.other');
    for (const key of ['og:video', 'og:video:url', 'og:video:secure_url']) expectOne(label, html, 'property', key, clip.url);
    expectOne(label, html, 'property', 'og:video:type', 'video/mp4');
    expectOne(label, html, 'property', 'og:video:width', clip.width);
    expectOne(label, html, 'property', 'og:video:height', clip.height);
    const images = metaValues(html, 'property', 'og:image');
    if (images.length !== 1) videoFailures.push(`${label}: ${images.length} og:image tags, not one`);
    expectOne(label, html, 'name', 'twitter:card', 'summary_large_image');
    if (/<meta\b[^>]*\bname=["']twitter:player/i.test(html)) videoFailures.push(`${label}: names a twitter:player`);
    return images[0];
  };
  for (const { label, html, route } of pages) expectClip(label, html, shareClips.get(clipFamily(route)));
  // a room invite is the game's document under middleware.ts: it plays the game's clip and keeps its invite card
  const inviteImage = expectClip('room invite', await served('/?room=HKP5XW&mode=lan&host=Commander+09HY'),
    shareClips.get('game'));
  if (inviteImage !== `${SITE}/brand/og/private-room.jpg`) videoFailures.push(`room invite: og:image ${inviteImage}`);
  assert.deepEqual(videoFailures, [], 'every public page, as served, shares its family clip as a playable og:video');
} finally {
  globalThis.fetch = originalFetch;
  rmSync(built, { recursive: true, force: true });
}

console.log(`SEO metadata selftest passed (${indexedPages.size} indexed pages; og:url and og:video as served on ${pageUrls.length} pages, en and zh, and a room invite; ${shareClips.size} share clips within their limits)`);
