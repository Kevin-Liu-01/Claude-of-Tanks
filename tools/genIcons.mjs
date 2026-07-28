// Tank icon generator: renders every roster tank's FINAL shipped model
// (whatever specs.MODEL_SOURCE says — currently all procedural) in a headless
// Chromium studio scene (tools/icons-page.html) and writes PNGs to
// public/icons/:
//   <id>_top.png              512x512  orthographic top-down, forward = up
//   <id>_top_silhouette.png   128x128  flat white fill (tint at runtime:
//                                      green self / red enemies on minimap)
//   <id>_angle.png            512x512  3/4 hero from above-front-left
//                                      (garage carousel cards, tech tree)
//   <id>_side.png             512x256  orthographic side profile, front right
//   <id>_side_silhouette.png  256x128  flat white fill (team panels,
//                                      kill feed, damage panel)
// Framing is bounding-box normalized with a fixed margin so every tank fills
// the frame identically. Transparent background, neutral studio lighting.
// Usage: node tools/genIcons.mjs [--out public/icons] [--tanks id1,id2]

import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
function opt(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
}
const outDir = resolve(opt('out', 'public/icons'));
const onlyTanks = opt('tanks', '') ? opt('tanks', '').split(',') : [];
mkdirSync(outDir, { recursive: true });

const server = await createServer({
  root: process.cwd(),
  logLevel: 'error',
  server: { port: 5980, strictPort: false },
});
await server.listen();
const url = `http://localhost:${server.config.server.port}/tools/icons-page.html`;
console.log(`[icons] vite up at ${url}`);

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('console', (msg) => {
  // ignore the dev server's missing-favicon 404 (same policy as screenshot.mjs)
  if (msg.type() === 'error' && !msg.text().includes('favicon') &&
      !msg.text().includes('404')) pageErrors.push(msg.text());
});

let failed = false;
try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction('window.__ICONS_READY === true', { timeout: 60000 });
  // GLB warm-up: tanks with MODEL_SOURCE 'glb' load their model async on
  // first createTank. Trigger the loads with a throwaway generation pass,
  // wait until every started load settles (window.__GLB_STATS, maintained by
  // src/vehicles/modelLoader.js), then generate for real — the second pass
  // hits tankFactory's synchronous cached-GLB path so icons show the shipped
  // model. Zero-GLB rosters settle immediately (started === settled === 0).
  await page.evaluate((ids) => window.__GEN(ids), onlyTanks);
  // The load-deferral idle gate (performance_budget r1) made this wait racy
  // in TWO ways: modelLoader.js is dynamic-imported (window.__GLB_STATS may
  // not exist yet on the first poll, so "no stats" used to pass vacuously
  // while loads were still queueing), and the parses themselves now drain
  // through spaced idle slots. Require the stats object to exist and stay
  // settled across two consecutive polls before trusting the cache.
  await page.waitForFunction(
    () => {
      window.__GLB_POLLS = (window.__GLB_POLLS || 0) + 1;
      const s = window.__GLB_STATS;
      // stats object missing: modelLoader.js was never imported — a truly
      // procedural-only roster. Give the dynamic import ~4 s to appear
      // before accepting that read.
      if (!s) return window.__GLB_POLLS >= 10;
      const settled = s.started === s.settled;
      window.__GLB_SETTLE_STREAK = settled ? (window.__GLB_SETTLE_STREAK || 0) + 1 : 0;
      return window.__GLB_SETTLE_STREAK >= 2;
    },
    { timeout: 120000, polling: 400 },
  );
  const files = await page.evaluate((ids) => window.__GEN(ids), onlyTanks);
  let n = 0;
  for (const [name, dataUrl] of Object.entries(files)) {
    if (name.endsWith('.error')) {
      failed = true;
      console.error(`[icons] ${name}: ${dataUrl}`);
      continue;
    }
    const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
    writeFileSync(resolve(outDir, name), buf);
    console.log(`[icons] wrote ${name} (${Math.round(buf.length / 1024)} KB)`);
    n++;
  }
  console.log(`[icons] ${n} icons -> ${outDir}`);
  if (n === 0) failed = true;
} catch (err) {
  failed = true;
  console.error(`[icons] FAILED: ${err.message}`);
} finally {
  if (pageErrors.length) {
    failed = true;
    console.error(`[icons] page errors (${pageErrors.length}):`);
    for (const e of pageErrors.slice(0, 20)) console.error(`  ${e}`);
  }
  await browser.close();
  await server.close();
}
process.exit(failed ? 1 : 0);
