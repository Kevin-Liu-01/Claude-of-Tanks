// tools/marketing-shots/encode-featured.mjs — featured-set encoder + OG composite.
//
// Takes the graded winners and produces the shippable art, using headless
// Chrome's canvas as the encoder (no new deps — same puppeteer the capture
// harnesses use):
//
//   1. public/media/featured/f<N>_<name>.webp — 1920-wide WebP, quality
//      auto-tuned per image to stay under --budget KB (default 380 KB).
//      These back BOTH the boot-splash backdrop slideshow and the garage
//      featured panel (one payload, two surfaces).
//   2. public/brand/og-image.png — 1200x630 OpenGraph composite: the chosen
//      wide shot, a dark legibility gradient, and og-logo-transparent.png.
//
// Usage:
//   node tools/marketing-shots/encode-featured.mjs \
//     --featured 06_desert_hero_kf51,09_winter_lake_duel,... \
//     --og 09_winter_lake_duel [--budget 380] [--width 1920]
//
// Reads source PNGs from shots/marketing/final/ (fallback raw/).

import puppeteer from 'puppeteer';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { resolve, join } from 'node:path';

const args = process.argv.slice(2);
function opt(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
}
const ROOT = resolve(new URL('../..', import.meta.url).pathname);
const FINAL_DIR = join(ROOT, 'shots/marketing/final');
const RAW_DIR = join(ROOT, 'shots/marketing/raw');
const OUT_DIR = join(ROOT, 'public/media/featured');
const OG_OUT = join(ROOT, 'public/brand/og-image.png');
const LOGO = join(ROOT, 'public/brand/og-logo-transparent.png');

const featured = (opt('featured', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const ogName = opt('og', featured[0]);
const BUDGET_KB = parseInt(opt('budget', '380'), 10);
const OUT_W = parseInt(opt('width', '1920'), 10);
if (!featured.length) {
  console.error('need --featured name1,name2,...');
  process.exit(1);
}
mkdirSync(OUT_DIR, { recursive: true });

const srcPath = (name) => {
  for (const dir of [FINAL_DIR, RAW_DIR]) {
    const p = join(dir, `${name}.png`);
    if (existsSync(p)) return p;
  }
  throw new Error(`source not found for ${name}`);
};
const dataURI = (file, mime = 'image/png') =>
  `data:${mime};base64,${readFileSync(file).toString('base64')}`;

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setContent('<canvas id="c"></canvas>');

/** draw src cover-fit into w x h, return dataURL for type/quality */
async function render(srcURI, w, h, type, quality, overlay) {
  return page.evaluate(async (src, w2, h2, ty, q, ov) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = src; });
    const c = document.getElementById('c');
    c.width = w2; c.height = h2;
    const ctx = c.getContext('2d');
    // cover-fit
    const s = Math.max(w2 / img.width, h2 / img.height);
    const dw = img.width * s, dh = img.height * s;
    ctx.drawImage(img, (w2 - dw) / 2, (h2 - dh) / 2, dw, dh);
    if (ov && ov.logo) {
      // dark vignette + bottom gradient for wordmark legibility
      let g = ctx.createLinearGradient(0, 0, 0, h2);
      g.addColorStop(0, 'rgba(5,8,11,0.30)');
      g.addColorStop(0.45, 'rgba(5,8,11,0.12)');
      g.addColorStop(1, 'rgba(5,8,11,0.62)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w2, h2);
      const r = ctx.createRadialGradient(w2 / 2, h2 / 2, h2 * 0.3, w2 / 2, h2 / 2, h2 * 1.1);
      r.addColorStop(0, 'rgba(0,0,0,0)');
      r.addColorStop(1, 'rgba(5,8,11,0.55)');
      ctx.fillStyle = r;
      ctx.fillRect(0, 0, w2, h2);
      const lg = new Image();
      await new Promise((res, rej) => { lg.onload = res; lg.onerror = rej; lg.src = ov.logo; });
      // logo centered, ~72% of width, drop shadow
      const lw = w2 * 0.72;
      const lh = lw * (lg.height / lg.width);
      ctx.shadowColor = 'rgba(0,0,0,0.65)';
      ctx.shadowBlur = 28;
      ctx.shadowOffsetY = 6;
      ctx.drawImage(lg, (w2 - lw) / 2, (h2 - lh) / 2 - h2 * 0.02, lw, lh);
    }
    return c.toDataURL(ty, q);
  }, srcURI, w, h, type, quality, overlay || null);
}

const writeFromDataURL = (file, dataURL) => {
  const buf = Buffer.from(dataURL.split(',')[1], 'base64');
  writeFileSync(file, buf);
  return buf.length;
};

// wipe stale featured files so renames don't accumulate
for (const f of readdirSync(OUT_DIR)) {
  if (/^f\d+_.*\.webp$/.test(f)) unlinkSync(join(OUT_DIR, f));
}

const manifest = [];
let total = 0;
for (let i = 0; i < featured.length; i++) {
  const name = featured[i];
  const uri = dataURI(srcPath(name));
  const h = Math.round((OUT_W * 9) / 16);
  let q = 0.80;
  let bytes = 0;
  let dataURL = '';
  // quality ladder: step down until under budget
  for (; q >= 0.4; q -= 0.06) {
    dataURL = await render(uri, OUT_W, h, 'image/webp', q);
    bytes = Buffer.from(dataURL.split(',')[1], 'base64').length;
    if (bytes <= BUDGET_KB * 1024) break;
  }
  const file = join(OUT_DIR, `f${i + 1}_${name}.webp`);
  writeFromDataURL(file, dataURL);
  total += bytes;
  manifest.push(`media/featured/f${i + 1}_${name}.webp`);
  console.log(`[encode] ${file.replace(ROOT + '/', '')}  ${(bytes / 1024).toFixed(0)} KB (q=${q.toFixed(2)})`);
}

// OG composite
const ogURL = await render(dataURI(srcPath(ogName)), 1200, 630, 'image/png', undefined, { logo: dataURI(LOGO) });
const ogBytes = writeFromDataURL(OG_OUT, ogURL);
console.log(`[encode] public/brand/og-image.png  ${(ogBytes / 1024).toFixed(0)} KB (source: ${ogName})`);
console.log(`[encode] featured total ${(total / 1024).toFixed(0)} KB across ${featured.length} images`);
console.log('[encode] manifest:', JSON.stringify(manifest));

await browser.close();
