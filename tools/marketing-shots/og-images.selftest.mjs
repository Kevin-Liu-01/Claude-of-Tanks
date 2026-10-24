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
// The Premiere identity's lockup (src/ui/components/DIRECTION.md, "The identity"): the Bracket Chevron and the outlined
// wordmark, one master; the retired crest and the text wordmark stay off every card.
const lockupSvg = readFileSync(new URL('public/brand/lockup.svg', root), 'utf8');
const lockup = Buffer.from(lockupSvg).toString('base64');
const [, , vbW, vbH] = /viewBox="([^"]+)"/.exec(lockupSvg)[1].split(/\s+/).map(Number);
const LOCKUP_ASPECT = vbW / vbH;
const font = readFileSync(new URL('public/fonts/chakra-petch/ChakraPetch-Bold-Latin.woff2', root)).toString('base64');
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
  assert.ok(html.includes(`<img class="lockup" src="data:image/svg+xml;base64,${lockup}" alt="Claude of Tanks">`),
    `${id}: use the current lockup master verbatim (public/brand/lockup.svg)`);
  assert.doesNotMatch(html, /class="(?:crest|wordmark|wordmark-subtitle)"/, `${id}: the retired crest and text wordmark stay off`);
  assert.ok(html.includes(`data:font/woff2;base64,${font}`), `${id}: embed the approved brand font`);
  assert.match(html, /\.lockup\{position:absolute;left:60px;bottom:52px;height:76px;width:auto;/);
  // the game card's tank fills the lower left: its lockup stands on the right (text never on a tank)
  assert.match(html, /\.game \.lockup\{left:auto;right:48px;bottom:40px;height:64px\}/);
  assert.ok(html.includes(` lang="${locale}">`), `${id}: the card declares its language`);
  if (label) assert.ok(html.includes(`<div class="label">${label}</div>`));

  const path = ogCardPath(id, locale);
  const image = await loadImage(fileURLToPath(new URL(path, root)));
  assert.deepEqual([image.width, image.height], [1200, 630], `${path}: social-card dimensions`);
  context.clearRect(0, 0, 1200, 630);
  context.drawImage(image, 0, 0);
  sheet?.getContext('2d').drawImage(image, (cardIndex % 3) * 400, Math.floor(cardIndex / 3) * 210, 400, 210);
  cardIndex++;
  // Inspect the shipped raster, not just the template: the lockup's tungsten (the chevron and the "of") stands in its
  // box, bottom left, or bottom right on the game card (576 to 803 pixels on the shipped set)
  const h = label ? 76 : 64, w = Math.round(h * LOCKUP_ASPECT);
  const pixels = context.getImageData(label ? 60 : 1200 - 48 - w, 630 - (label ? 52 : 40) - h, w, h).data;
  let amber = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i] > 175 && pixels[i + 1] > 90 && pixels[i + 1] < 195 && pixels[i + 2] < 105) amber++;
  }
  assert.ok(amber > 300, `${path}: regenerate the shipped card with the lockup in its place (${amber} tungsten pixels)`);
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
console.log(`og-images.selftest: all ${OG_IMAGE_CARDS.length} cards and ${renders.length - OG_IMAGE_CARDS.length} Chinese twins use the Premiere lockup master, the brand font and their lockup place; every page shares its own`);
