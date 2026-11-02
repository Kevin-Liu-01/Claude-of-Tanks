import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { cardHtml, OG_IMAGE_CARDS, OG_TYPE, OG_ZH_LABELS, ogCardPath } from './generate-og-images.mjs';
import { localizeHtmlDocument } from '../../src/presentation/localizedHtml.ts';
import { localizedStudioMetadata, privateRoomMetadata, SITE_ORIGIN } from '../../src/presentation/siteMetadata.ts';
import { renderProductStats } from '../../src/productStats.ts';
import { PUBLIC_ROUTE_RECORDS } from '../../src/ui/localeRouting.ts';

const root = new URL('../../', import.meta.url);
// The identity's lockup (the owner's pick, 2026-10-24): the commander mark and the outlined wordmark, one master
// (tools/brand-marks.mjs); the retired crest, the Bracket Chevron and the text wordmark stay off every card.
const lockupSvg = readFileSync(new URL('public/brand/lockup.svg', root), 'utf8');
const lockup = Buffer.from(lockupSvg).toString('base64');
const [, , vbW, vbH] = /viewBox="([^"]+)"/.exec(lockupSvg)[1].split(/\s+/).map(Number);
const LOCKUP_ASPECT = vbW / vbH;
const font = readFileSync(new URL('public/fonts/chakra-petch/ChakraPetch-Bold-Latin.woff2', root)).toString('base64');
// one card per manual topic (src/ui/localeRouting.ts DOCS_TOPICS), and the seven others: the game, private rooms, the
// Studio, the 404, the landing, the Gallery and the manual's index
const docsCards = /const DOCS_TOPICS = \[([^\]]+)\]/.exec(readFileSync(new URL('src/ui/localeRouting.ts', root), 'utf8'))[1].match(/'[a-z]+'/g)
  .map((topic) => `docs-${topic.slice(1, -1)}`);
assert.deepEqual(OG_IMAGE_CARDS.map(([id]) => id).filter((id) => id.startsWith('docs-')).toSorted(), docsCards.toSorted(), 'every manual topic has its card');
assert.equal(OG_IMAGE_CARDS.length, docsCards.length + 7, 'the game, private rooms, Studio, the 404, and every public page need a card');
assert.equal(new Set(OG_IMAGE_CARDS.map(([id]) => id)).size, OG_IMAGE_CARDS.length, 'one card per id');
// The brand's own cards (the game and the landing) carry the lockup alone; every other card its page's title, with a
// Chinese twin for its /cn page in that page's own catalog words.
for (const [id, title, source, , corner] of OG_IMAGE_CARDS) {
  assert.equal(Boolean(OG_ZH_LABELS[id]), Boolean(title), `${id}: a zh-CN title exactly when the card carries a title`);
  assert.equal(!title, ['game', 'home'].includes(id), `${id}: only the game and the landing are wordless`);
  if (title) assert.match(OG_ZH_LABELS[id], /[一-鿿]/, `${id}: the zh-CN title must be Chinese`);
  assert.ok(['tl', 'tr'].includes(corner), `${id}: its text stands in a top corner (${corner})`);
  assert.ok(existsSync(new URL(source.split('#t=')[0], root)), `${id}: its source ${source} is in the tree`);
}
// legible where a share shows the card at a third of its width (a phone timeline, ~340 px): the title keeps a cap
// of 20 px and more
assert.ok(OG_TYPE.title * 340 / 1200 >= 20 && OG_TYPE.titleZh >= OG_TYPE.title, `the title is set at ${OG_TYPE.title} px`);
const renders = OG_IMAGE_CARDS.flatMap(([id, title, , focus, corner]) => [
  { id, title, focus, corner, locale: 'en' },
  ...(title ? [{ id, title: OG_ZH_LABELS[id], focus, corner, locale: 'zh' }] : []),
]);

const canvas = createCanvas(1200, 630);
const context = canvas.getContext('2d');
const sheetPath = process.argv.find((argument) => argument.startsWith('--sheet='))?.slice(8);
const sheet = sheetPath ? createCanvas(1200, 210 * Math.ceil(renders.length / 3)) : null;
let cardIndex = 0;
for (const { id, title, focus, corner, locale } of renders) {
  const html = cardHtml(title, 'data:image/png;base64,', focus, corner, locale);
  assert.ok(html.includes(`<img class="lockup" src="data:image/svg+xml;base64,${lockup}" alt="Claude of Tanks">`),
    `${id}: use the current lockup master verbatim (public/brand/lockup.svg)`);
  assert.doesNotMatch(html, /class="(?:crest|wordmark|wordmark-subtitle)"/, `${id}: the retired crest and text wordmark stay off`);
  assert.ok(html.includes(`data:font/woff2;base64,${font}`), `${id}: embed the approved brand font`);
  assert.ok(html.includes(` lang="${locale}">`), `${id}: the card declares its language`);
  if (title) assert.ok(html.includes(`<h1>${title.replace(/&/g, '&amp;')}</h1>`), `${id}: the card carries its title`);

  const path = ogCardPath(id, locale);
  const file = fileURLToPath(new URL(path, root));
  const image = await loadImage(file);
  assert.deepEqual([image.width, image.height], [1200, 630], `${path}: social-card dimensions`);
  assert.ok(statSync(file).size <= 300_000, `${path}: at most 300 KB (WhatsApp drops a preview over 600 KB; ${statSync(file).size} bytes)`);
  context.clearRect(0, 0, 1200, 630);
  context.drawImage(image, 0, 0);
  sheet?.getContext('2d').drawImage(image, (cardIndex % 3) * 400, Math.floor(cardIndex / 3) * 210, 400, 210);
  cardIndex++;
  // Inspect the shipped raster, not just the template: the lockup's tungsten (the commander, the pennant and the "of")
  // stands in its box in the card's text corner
  const h = title ? OG_TYPE.lockup : OG_TYPE.brandLockup, w = Math.round(h * LOCKUP_ASPECT);
  const pixels = context.getImageData(corner === 'tr' ? 1200 - OG_TYPE.inset - w : OG_TYPE.inset, OG_TYPE.top, w, h).data;
  let amber = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i] > 175 && pixels[i + 1] > 90 && pixels[i + 1] < 195 && pixels[i + 2] < 105) amber++;
  }
  assert.ok(amber > (title ? 60 : 200), `${path}: regenerate the shipped card with the lockup in its corner (${amber} tungsten pixels)`);
}
if (sheet) writeFileSync(sheetPath, sheet.toBuffer('image/png'));

// Each page shares its own card, and its /cn twin the Chinese one (src/presentation/localizedHtml.ts); the brand's
// wordless cards serve both languages. /studio and room links take theirs from siteMetadata.ts.
const cardOf = (route) => (route.id === 'notFound' ? '404' : route.id === 'game' ? 'game' : route.id.replace(/^docs(?=[A-Z])/, 'docs-').toLowerCase());
const cardUrl = (card, locale) => `${SITE_ORIGIN}/${ogCardPath(card, locale).replace(/^public\//, '')}`;
const metaImage = (html, key, selector = 'property') =>
  html.match(new RegExp(`<meta ${selector}="${key}" content="([^"]+)"`))?.[1];
for (const route of PUBLIC_ROUTE_RECORDS) {
  if (route.id === 'studio') continue;
  const file = ['index.html', '404.html'].includes(route.sourceHtml) ? route.sourceHtml : `site/${route.sourceHtml}`;
  const source = renderProductStats(readFileSync(new URL(file, root), 'utf8'));
  const card = cardOf(route);
  assert.ok(OG_IMAGE_CARDS.some(([id]) => id === card), `${route.id}: no card named ${card}`);
  assert.equal(metaImage(source, 'og:image'), cardUrl(card, 'en'), `${file} shares its own card`);
  const chinese = localizeHtmlDocument(source, route, 'zh-CN');
  assert.equal(metaImage(chinese, 'og:image'), cardUrl(card, 'zh'), `/cn ${route.pathname} shares its Chinese card`);
  if (metaImage(source, 'twitter:image', 'name')) {
    assert.equal(metaImage(chinese, 'twitter:image', 'name'), cardUrl(card, 'zh'));
  }
  if (cardUrl(card, 'zh') !== cardUrl(card, 'en')) {
    assert.ok(!chinese.includes(cardUrl(card, 'en')), `/cn ${route.pathname} keeps no English card (JSON-LD included)`);
  }
  assert.ok(existsSync(new URL(ogCardPath(card, 'zh'), root)), `${ogCardPath(card, 'zh')} must be rendered`);
  assert.equal(localizeHtmlDocument(source, route, 'en-US').includes('/brand/og-r2/zh/'), false, `${file}: English keeps the English card`);
}
assert.equal(localizedStudioMetadata('en-US').image, cardUrl('studio', 'en'));
assert.equal(localizedStudioMetadata('zh-CN').image, cardUrl('studio', 'zh'));
assert.equal(privateRoomMetadata(new URL(`${SITE_ORIGIN}/?room=HKP5XW`))?.image, cardUrl('private-room', 'en'));
assert.equal(privateRoomMetadata(new URL(`${SITE_ORIGIN}/cn/?room=HKP5XW`), 'zh-CN')?.image, cardUrl('private-room', 'zh'));
console.log(`og-images.selftest: all ${OG_IMAGE_CARDS.length} cards and ${renders.length - OG_IMAGE_CARDS.length} Chinese twins use the Premiere lockup master in their text corner, the brand font and a legible title; every page shares its own`);
