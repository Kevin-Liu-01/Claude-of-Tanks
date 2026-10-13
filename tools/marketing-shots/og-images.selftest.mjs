import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { cardHtml, OG_IMAGE_CARDS, OG_ZH_LABELS, ogCardPath } from './generate-og-images.mjs';
import { localizeHtmlDocument } from '../../src/presentation/localizedHtml.ts';
import { localizedStudioMetadata, privateRoomMetadata, SITE_ORIGIN } from '../../src/presentation/siteMetadata.ts';
import { renderProductStats } from '../../src/productStats.ts';
import { PUBLIC_ROUTE_RECORDS } from '../../src/ui/localeRouting.ts';

const root = new URL('../../', import.meta.url);
const crest = readFileSync(new URL('public/brand/logo-mark.svg', root)).toString('base64');
const font = readFileSync(new URL('public/fonts/abc-monument-grotesk/ABCMonumentGrotesk-Bold.woff2', root)).toString('base64');
assert.equal(OG_IMAGE_CARDS.length, 20, 'default, private rooms, Studio, the 404, and every public page need a card');
assert.equal(new Set(OG_IMAGE_CARDS.map(([id]) => id)).size, 20);
// Every labelled card has a Chinese twin for its /cn page, labelled in that page's own catalog words.
for (const [id, label] of OG_IMAGE_CARDS) {
  assert.equal(Boolean(OG_ZH_LABELS[id]), Boolean(label), `${id}: a zh-CN label exactly when the card carries a label`);
  if (label) assert.match(OG_ZH_LABELS[id], /[一-鿿]/, `${id}: the zh-CN label must be Chinese`);
}
const renders = OG_IMAGE_CARDS.flatMap(([id, label, source, position, fit]) => [
  { id, label, source, position, fit, locale: 'en' },
  ...(label ? [{ id, label: OG_ZH_LABELS[id], source, position, fit, locale: 'zh' }] : []),
]);

const canvas = createCanvas(1200, 630);
const context = canvas.getContext('2d');
const sheetPath = process.argv.find((argument) => argument.startsWith('--sheet='))?.slice(8);
const sheet = sheetPath ? createCanvas(1200, 210 * Math.ceil(renders.length / 3)) : null;
let cardIndex = 0;
for (const { id, label, source, position, fit, locale } of renders) {
  const html = cardHtml(label, source, position, fit, locale);
  assert.ok(html.includes(`data:image/svg+xml;base64,${crest}`), `${id}: use the current shield master verbatim`);
  assert.ok(html.includes(`data:font/woff2;base64,${font}`), `${id}: embed the approved brand font`);
  assert.match(html, /\.crest\{width:150px;height:150px;flex:none;object-fit:contain;/);
  assert.match(html, /\.lockup\{position:absolute;left:64px;bottom:46px;/);
  assert.match(html, /\.lockup\{[^}]*gap:20px;/);
  assert.match(html, /\.wordmark-subtitle\{margin-top:0;/);
  assert.match(html, /class="wordmark">CLAUDE<\/div>/);
  assert.match(html, /class="wordmark-subtitle">OF TANKS<\/div>/);
  assert.match(html, /\.wordmark-subtitle\{[^}]*color:#f0a030/);
  assert.ok(html.includes(` lang="${locale}">`), `${id}: the card declares its language`);
  if (label) assert.ok(html.includes(`<div class="label">${label}</div>`));

  const path = ogCardPath(id, locale);
  const image = await loadImage(fileURLToPath(new URL(path, root)));
  assert.deepEqual([image.width, image.height], [1200, 630], `${path}: social-card dimensions`);
  context.clearRect(0, 0, 1200, 630);
  context.drawImage(image, 0, 0);
  sheet?.getContext('2d').drawImage(image, (cardIndex % 3) * 400, Math.floor(cardIndex / 3) * 210, 400, 210);
  cardIndex++;
  // Inspect the shipped raster, not just the template: the old compact logo
  // has no amber subtitle at the approved bottom-left wordmark location.
  const pixels = context.getImageData(234, 524, 180, 30).data;
  let amber = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i] > 175 && pixels[i + 1] > 90 && pixels[i + 1] < 195 && pixels[i + 2] < 105) amber++;
  }
  assert.ok(amber > 500, `${path}: regenerate the shipped card with the amber OF TANKS subtitle (${amber} pixels)`);
}
if (sheet) writeFileSync(sheetPath, sheet.toBuffer('image/png'));

// Each page shares its own card, and its /cn twin the Chinese one (src/presentation/localizedHtml.ts). The game shell
// keeps the label-free og-image.png in both languages; /studio and room links take theirs from siteMetadata.ts.
const cardOf = (route) => (route.id === 'notFound' ? '404' : route.id.replace(/^docs(?=[A-Z])/, 'docs-').toLowerCase());
const metaImage = (html, key, selector = 'property') =>
  html.match(new RegExp(`<meta ${selector}="${key}" content="([^"]+)"`))?.[1];
for (const route of PUBLIC_ROUTE_RECORDS) {
  if (route.sourceHtml === 'index.html') continue;
  const file = route.sourceHtml === '404.html' ? '404.html' : `site/${route.sourceHtml}`;
  const source = renderProductStats(readFileSync(new URL(file, root), 'utf8'));
  const card = cardOf(route);
  assert.ok(OG_IMAGE_CARDS.some(([id]) => id === card), `${route.id}: no card named ${card}`);
  assert.equal(metaImage(source, 'og:image'), `${SITE_ORIGIN}/brand/og/${card}.jpg`, `${file} shares its own card`);
  const chinese = localizeHtmlDocument(source, route, 'zh-CN');
  assert.equal(metaImage(chinese, 'og:image'), `${SITE_ORIGIN}/brand/og/zh/${card}.jpg`, `/cn ${route.pathname} shares the Chinese card`);
  if (metaImage(source, 'twitter:image', 'name')) {
    assert.equal(metaImage(chinese, 'twitter:image', 'name'), `${SITE_ORIGIN}/brand/og/zh/${card}.jpg`);
  }
  assert.ok(!chinese.includes(`${SITE_ORIGIN}/brand/og/${card}.jpg`), `/cn ${route.pathname} keeps no English card (JSON-LD included)`);
  assert.ok(existsSync(new URL(`public/brand/og/zh/${card}.jpg`, root)), `public/brand/og/zh/${card}.jpg must be rendered`);
  assert.equal(localizeHtmlDocument(source, route, 'en-US').includes(`/brand/og/zh/`), false, `${file}: English keeps the English card`);
}
assert.equal(localizedStudioMetadata('en-US').image, `${SITE_ORIGIN}/brand/og/studio.jpg`);
assert.equal(localizedStudioMetadata('zh-CN').image, `${SITE_ORIGIN}/brand/og/zh/studio.jpg`);
assert.equal(privateRoomMetadata(new URL(`${SITE_ORIGIN}/?room=HKP5XW`))?.image, `${SITE_ORIGIN}/brand/og/private-room.jpg`);
assert.equal(privateRoomMetadata(new URL(`${SITE_ORIGIN}/cn/?room=HKP5XW`), 'zh-CN')?.image,
  `${SITE_ORIGIN}/brand/og/zh/private-room.jpg`);
console.log(`og-images.selftest: all ${OG_IMAGE_CARDS.length} cards and ${renders.length - OG_IMAGE_CARDS.length} Chinese twins use the canonical shield, typography, and bottom-left lockup; every page shares its own`);
