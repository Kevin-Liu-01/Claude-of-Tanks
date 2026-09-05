// tools/marketing-shots/contact.mjs — contact sheets for variant review.
// Groups files sharing a prefix before _vN and tiles them horizontally with
// labels, via headless-Chrome canvas (no new deps).
//
//   node tools/marketing-shots/contact.mjs --dir shots/marketing/preview \
//        --out shots/marketing/sheets [--tile 640]
//   node tools/marketing-shots/contact.mjs --all \
//        --dir shots/marketing-modern/raw --out shots/marketing-modern/sheets \
//        --tile 320 --cols 5 [--rows 2] [--no-labels]

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
const ALL = args.includes('--all');
const COLS = parseInt(opt('cols', '5'), 10);
const ROWS = parseInt(opt('rows', '2'), 10);
const NO_LABELS = args.includes('--no-labels');
const CONTAIN = args.includes('--contain');
const CONTAINS = opt('contains', '');
mkdirSync(out, { recursive: true });

function numericPrefix(file) {
  return Number(/^\d+/.exec(file)?.[0] || Number.MAX_SAFE_INTEGER);
}

const files = readdirSync(dir)
  .filter((f) => ALL ? /\.(?:png|webp|jpe?g)$/i.test(f) : /_v\d+\.(?:png|webp|jpe?g)$/i.test(f))
  .filter((f) => !CONTAINS || f.includes(CONTAINS))
  .sort((a, b) => numericPrefix(a) - numericPrefix(b) || a.localeCompare(b));
const groups = new Map();
if (ALL) {
  const pageSize = Math.max(COLS, COLS * ROWS);
  for (let start = 0; start < files.length; start += pageSize) {
    const page = String(start / pageSize + 1).padStart(2, '0');
    groups.set(`all_${page}`, files.slice(start, start + pageSize));
  }
} else {
  for (const f of files) {
    const base = f.replace(/_v\d+\.png$/, '');
    if (!groups.has(base)) groups.set(base, []);
    groups.get(base).push(f);
  }
}
if (!groups.size) {
  console.error(`[contact] no ${ALL ? 'image' : '_vN image'} files found in`, dir);
  process.exit(1);
}

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setContent('<canvas id="c"></canvas>');

for (const [base, names] of groups) {
  const uris = names.map((n) => {
    const ext = n.split('.').at(-1).toLowerCase();
    const mime = ext === 'jpg' || ext === 'jpeg' ? 'jpeg' : ext;
    return `data:image/${mime};base64,${readFileSync(join(dir, n)).toString('base64')}`;
  });
  const dataURL = await page.evaluate(async (
    srcs, labels, tw, requestedCols, showLabels, contain,
  ) => {
    const imgs = [];
    for (const s of srcs) {
      const im = new Image();
      await new Promise((res, rej) => { im.onload = res; im.onerror = rej; im.src = s; });
      imgs.push(im);
    }
    const th = Math.round((tw * imgs[0].height) / imgs[0].width);
    const c = document.getElementById('c');
    const cols = Math.max(1, Math.min(requestedCols, imgs.length));
    const rows = Math.ceil(imgs.length / cols);
    const labelHeight = showLabels ? 26 : 0;
    c.width = tw * cols;
    c.height = (th + labelHeight) * rows;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, c.width, c.height);
    imgs.forEach((im, i) => {
      const x = (i % cols) * tw;
      const y = Math.floor(i / cols) * (th + labelHeight);
      if (contain) {
        const scale = Math.min(tw / im.width, th / im.height);
        const width = im.width * scale;
        const height = im.height * scale;
        ctx.drawImage(im, x + (tw - width) / 2, y + labelHeight + (th - height) / 2, width, height);
      } else {
        ctx.drawImage(im, x, y + labelHeight, tw, th);
      }
      if (showLabels) {
        ctx.fillStyle = '#ffd27a';
        ctx.font = 'bold 16px monospace';
        ctx.fillText(labels[i], x + 8, y + 18);
      }
    });
    return c.toDataURL('image/png');
  }, uris, names, TILE_W, ALL ? COLS : names.length, !NO_LABELS, CONTAIN);
  const file = join(out, `${base}_SHEET.png`);
  writeFileSync(file, Buffer.from(dataURL.split(',')[1], 'base64'));
  console.log(`[contact] ${file}`);
}
await browser.close();
