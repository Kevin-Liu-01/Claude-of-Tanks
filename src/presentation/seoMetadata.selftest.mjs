import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRODUCT_STATS, renderProductStats } from '../productStats.ts';
import { privateRoomMetadata, STUDIO_METADATA } from './siteMetadata.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SITE = 'https://cot.kevinliu.studio';
const indexedPages = new Map([
  ['index.html', `${SITE}/`],
  ['home.html', `${SITE}/home`],
  ['gallery.html', `${SITE}/gallery`],
  ['docs.html', `${SITE}/docs`],
  ['docs-build.html', `${SITE}/docs/build`],
  ['docs-models.html', `${SITE}/docs/models`],
  ['docs-simulation.html', `${SITE}/docs/simulation`],
  ['docs-vehicles.html', `${SITE}/docs/vehicles`],
  ['docs-rendering.html', `${SITE}/docs/rendering`],
  ['docs-performance.html', `${SITE}/docs/performance`],
  ['docs-worlds.html', `${SITE}/docs/worlds`],
  ['docs-ai.html', `${SITE}/docs/ai`],
  ['docs-multiplayer.html', `${SITE}/docs/multiplayer`],
  ['docs-audio.html', `${SITE}/docs/audio`],
  ['docs-interface.html', `${SITE}/docs/interface`],
  ['docs-studio.html', `${SITE}/docs/studio`],
]);
const socialCards = new Map([
  ['index.html', 'brand/og-image.png'],
  ['home.html', 'brand/og/home.jpg'],
  ['gallery.html', 'brand/og/gallery.jpg'],
  ['docs.html', 'brand/og/docs.jpg'],
  ...[...indexedPages.keys()]
    .filter((file) => file.startsWith('docs-'))
    .map((file) => [file, `brand/og/${file.replace(/\.html$/, '')}.jpg`]),
]);

function attribute(html, element, key, value, wanted = 'content') {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tag = html.match(new RegExp(`<${element}[^>]+${key}=["']${escaped}["'][^>]*>`, 'i'))?.[0];
  if (!tag) return '';
  return tag.match(new RegExp(`${wanted}=["']([^"']+)["']`, 'i'))?.[1] ?? '';
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
  assert.ok(title.length >= 30 && title.length <= 80, `${file} needs a descriptive title`);
  assert.ok(description.length >= 100 && description.length <= 240, `${file} needs a detailed meta description`);
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

const topicFallback = renderProductStats(readFileSync(join(ROOT, 'docs-topic.html'), 'utf8'));
assert.match(attribute(topicFallback, 'meta', 'name', 'robots'), /noindex, follow/);
assert.equal(attribute(topicFallback, 'link', 'rel', 'canonical', 'href'), `${SITE}/docs`);

const sitemap = readFileSync(join(ROOT, 'public/sitemap.xml'), 'utf8');
const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
assert.deepEqual(sitemapUrls, [
  ...[...indexedPages.values()].slice(0, 3),
  STUDIO_METADATA.canonical,
  ...[...indexedPages.values()].slice(3),
], 'sitemap must exactly match indexed canonicals');
assert.equal(new Set(sitemapUrls).size, sitemapUrls.length, 'sitemap URLs must be unique');
assert.doesNotMatch(sitemap, /<priority>|<changefreq>/, 'sitemap must not invent update priorities');

const robots = readFileSync(join(ROOT, 'public/robots.txt'), 'utf8');
assert.match(robots, new RegExp(`Sitemap: ${SITE.replace(/[.]/g, '\\.')}\/sitemap\\.xml`));
for (const agent of ['OAI-SearchBot', 'ChatGPT-User', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot', 'Perplexity-User']) {
  assert.match(robots, new RegExp(`User-agent: ${agent}`), `robots.txt must name ${agent}`);
}

for (const file of ['llms.txt', 'llms-full.txt', 'docs/llms.txt', 'humans.txt', 'pricing.txt', '.well-known/security.txt', 'site.webmanifest']) {
  assert.ok(existsSync(join(ROOT, 'public', file)), `missing public/${file}`);
}
const llms = readFileSync(join(ROOT, 'public/llms.txt'), 'utf8');
assert.match(llms, /^# Claude of Tanks\n\n>/);
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
  ...indexedPages.keys(), 'docs-topic.html', 'public/robots.txt', 'public/sitemap.xml',
].map((file) => readFileSync(join(ROOT, file), 'utf8')).join('\n');
assert.doesNotMatch(publicMetadata, /https:\/\/claude-of-tanks\.vercel\.app/, 'former deployment must not remain canonical');
const homeVisibleText = renderProductStats(readFileSync(join(ROOT, 'home.html'), 'utf8'))
  .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
assert.doesNotMatch(homeVisibleText, /16 battlefields/);
assert.doesNotMatch(homeVisibleText, /(?:Choose from |Drive )111 tanks|111 production vehicles/);
const currentPublicCopy = [
  'index.html', 'home.html', 'gallery.html', 'docs.html', 'docs-vehicles.html',
  'README.md', 'public/llms.txt', 'public/llms-full.txt', 'public/docs/llms.txt',
].map((file) => renderProductStats(readFileSync(join(ROOT, file), 'utf8'))).join('\n');
assert.doesNotMatch(currentPublicCopy, /111 (?:production|first-party procedural)|148 keyed|150 saved/,
  `public fleet facts must track the canonical ${PRODUCT_STATS.productionVehicles} / ${PRODUCT_STATS.developmentVehicles} / ${PRODUCT_STATS.savedVehicleRecords} roster projections`);
assert.doesNotMatch(renderProductStats(readFileSync(join(ROOT, 'docs.html'), 'utf8')),
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
assert.match(privateRoomMetadata(new URL(`${SITE}/?room=I0O123`))?.description || '', /room LQQL23/,
  'crawler metadata must normalize ambiguous room characters exactly like the lobby');

const vercel = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8'));
for (const [file, canonical] of [...indexedPages].filter(([file]) => file.startsWith('docs-'))) {
  const path = new URL(canonical).pathname;
  assert.ok(vercel.rewrites.some((rewrite) => rewrite.source === path), `${file} must be published at ${path}`);
}

console.log(`SEO metadata selftest passed (${indexedPages.size} indexed pages)`);
