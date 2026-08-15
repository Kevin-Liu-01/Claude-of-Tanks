// tools/marketing-shots/encode-modern-showcase.mjs
//
// Encodes the 30 Scene Studio source frames into lazy-loadable WebP assets and
// publishes their presentation manifest. Uses Chromium canvas so the repo does
// not need an additional native image dependency.

import puppeteer from 'puppeteer';
import {
  existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '../..');
const SOURCE = join(ROOT, 'shots/marketing-modern/raw');
const OUT = join(ROOT, 'public/media/modern');
const SOURCE_MANIFEST = join(HERE, 'modern-showcase-manifest.json');
const manifest = JSON.parse(readFileSync(SOURCE_MANIFEST, 'utf8'));
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const WIDTH = Number.parseInt(opt('width', '1600'), 10);
const BUDGET_KB = Number.parseInt(opt('budget', '220'), 10);

mkdirSync(OUT, { recursive: true });
for (const file of readdirSync(OUT)) {
  if (file.endsWith('.webp') || file === 'manifest.json') unlinkSync(join(OUT, file));
}

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setContent('<canvas id="stage"></canvas>');

const encoded = [];
for (const item of manifest) {
  const source = join(SOURCE, `${item.slug}.png`);
  if (!existsSync(source)) throw new Error(`missing Scene Studio frame: ${source}`);
  const sourceUri = `data:image/png;base64,${readFileSync(source).toString('base64')}`;
  let result = null;
  for (let quality = 0.82; quality >= 0.46; quality -= 0.05) {
    const dataUrl = await page.evaluate(async ({ sourceUri: uri, width, quality: q }) => {
      const image = new Image();
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = reject;
        image.src = uri;
      });
      const canvas = document.querySelector('#stage');
      canvas.width = width;
      canvas.height = Math.round(width * 9 / 16);
      const ctx = canvas.getContext('2d', { alpha: false });
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/webp', q);
    }, { sourceUri, width: WIDTH, quality });
    const buffer = Buffer.from(dataUrl.split(',')[1], 'base64');
    result = { buffer, quality };
    if (buffer.byteLength <= BUDGET_KB * 1024) break;
  }
  const file = `${item.slug}.webp`;
  writeFileSync(join(OUT, file), result.buffer);
  encoded.push({
    ...item,
    src: `/media/modern/${file}`,
    width: WIDTH,
    height: Math.round(WIDTH * 9 / 16),
    bytes: result.buffer.byteLength,
  });
  console.log(`[modern-encode] ${file} ${(result.buffer.byteLength / 1024).toFixed(0)} KB q=${result.quality.toFixed(2)}`);
}

writeFileSync(join(OUT, 'manifest.json'), `${JSON.stringify(encoded, null, 2)}\n`);
console.log(`[modern-encode] wrote ${encoded.length} images (${(encoded.reduce((sum, item) => sum + item.bytes, 0) / 1024 / 1024).toFixed(2)} MB total)`);
await browser.close();
