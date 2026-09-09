import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { cardHtml, OG_IMAGE_CARDS } from './generate-og-images.mjs';

const root = new URL('../../', import.meta.url);
const crest = readFileSync(new URL('public/brand/logo-mark.svg', root)).toString('base64');
const font = readFileSync(new URL('public/fonts/abc-monument-grotesk/ABCMonumentGrotesk-Bold.woff2', root)).toString('base64');
assert.equal(OG_IMAGE_CARDS.length, 18, 'default, private rooms, Studio, and every public page need a card');
assert.equal(new Set(OG_IMAGE_CARDS.map(([id]) => id)).size, 18);

const canvas = createCanvas(1200, 630);
const context = canvas.getContext('2d');
const sheetPath = process.argv.find((argument) => argument.startsWith('--sheet='))?.slice(8);
const sheet = sheetPath ? createCanvas(1200, 1260) : null;
let cardIndex = 0;
for (const [id, label, source, position, fit] of OG_IMAGE_CARDS) {
  const html = cardHtml(label, source, position, fit);
  assert.ok(html.includes(`data:image/svg+xml;base64,${crest}`), `${id}: use the current shield master verbatim`);
  assert.ok(html.includes(`data:font/woff2;base64,${font}`), `${id}: embed the approved brand font`);
  assert.match(html, /\.crest\{width:150px;height:150px;flex:none;object-fit:contain;/);
  assert.match(html, /\.lockup\{position:absolute;left:64px;bottom:46px;/);
  assert.match(html, /\.lockup\{[^}]*gap:20px;/);
  assert.match(html, /\.wordmark-subtitle\{margin-top:0;/);
  assert.match(html, /class="wordmark">CLAUDE<\/div>/);
  assert.match(html, /class="wordmark-subtitle">OF TANKS<\/div>/);
  assert.match(html, /\.wordmark-subtitle\{[^}]*color:#f0a030/);
  if (label) assert.ok(html.includes(`<div class="label">${label}</div>`));

  const path = id === 'game' ? 'public/brand/og-image.png' : `public/brand/og/${id}.jpg`;
  const image = await loadImage(fileURLToPath(new URL(path, root)));
  assert.deepEqual([image.width, image.height], [1200, 630], `${id}: social-card dimensions`);
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
  assert.ok(amber > 500, `${id}: regenerate the shipped card with the amber OF TANKS subtitle (${amber} pixels)`);
}
if (sheet) writeFileSync(sheetPath, sheet.toBuffer('image/png'));
console.log('og-images.selftest: all 18 cards use the canonical shield, typography, and bottom-left lockup');
