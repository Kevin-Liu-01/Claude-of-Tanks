// tools/marketing-shots/contact.mjs — contact sheets for variant review.
// Groups files sharing a prefix before _vN and tiles them horizontally with
// labels, via headless-Chrome canvas (no new deps).
//
//   node tools/marketing-shots/contact.mjs --dir shots/marketing/preview \
//        --out shots/marketing/sheets [--tile 640]

import puppeteer from 'puppeteer';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const args = process.argv.slice(2);
const opt = (n, f) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : f;
};
const dir = resolve(opt('dir', 'shots/marketing/preview'));
const out = resolve(opt('out', 'shots/marketing/sheets'));
const TILE_W = parseInt(opt('tile', '640'), 10);
mkdirSync(out, { recursive: true });

const files = readdirSync(dir).filter((f) => /_v\d+\.png$/.test(f)).sort();
const groups = new Map();
for (const f of files) {
  const base = f.replace(/_v\d+\.png$/, '');
  if (!groups.has(base)) groups.set(base, []);
  groups.get(base).push(f);
}
if (!groups.size) {
  console.error('[contact] no _vN files found in', dir);
  process.exit(1);
}

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setContent('<canvas id="c"></canvas>');

for (const [base, names] of groups) {
  const uris = names.map((n) => `data:image/png;base64,${readFileSync(join(dir, n)).toString('base64')}`);
  const dataURL = await page.evaluate(async (srcs, labels, tw) => {
    const imgs = [];
    for (const s of srcs) {
      const im = new Image();
      await new Promise((res, rej) => { im.onload = res; im.onerror = rej; im.src = s; });
      imgs.push(im);
    }
    const th = Math.round((tw * imgs[0].height) / imgs[0].width);
    const c = document.getElementById('c');
    c.width = tw * imgs.length;
    c.height = th + 26;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, c.width, c.height);
    imgs.forEach((im, i) => {
      ctx.drawImage(im, i * tw, 26, tw, th);
      ctx.fillStyle = '#ffd27a';
      ctx.font = 'bold 16px monospace';
      ctx.fillText(labels[i], i * tw + 8, 18);
    });
    return c.toDataURL('image/png');
  }, uris, names, TILE_W);
  const file = join(out, `${base}_SHEET.png`);
  writeFileSync(file, Buffer.from(dataURL.split(',')[1], 'base64'));
  console.log(`[contact] ${file}`);
}
await browser.close();
