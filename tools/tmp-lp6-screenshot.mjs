// Headless screenshot harness for critic agents.
// Usage: node tools/screenshot.mjs [--out shots] [--views name1,name2] [--width 1920] [--height 1080]
// Starts a vite dev server, loads the game in headless Chromium, waits for
// window.__GAME_READY, then iterates window.__SHOTS.views (or --views subset),
// calling window.__SHOTS.set(name) before each capture.
// Exits non-zero and prints page console errors if the game fails to load.

import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { mkdirSync, rmdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

// Exclusive run lock (controls_gunnery r3): parallel harness instances on one
// machine starve each other's vite/Chromium cold starts into spurious
// "Navigation timeout" gate failures. mkdir is the atomic primitive; a lock
// older than 5 min is stale (crashed run) and is reclaimed.
const LOCK_DIR = '/tmp/cot-shots-lp6.lock';
const LOCK_STALE_MS = 5 * 60 * 1000;
let lockHeld = false;
async function acquireLock() {
  const t0 = Date.now();
  for (;;) {
    try { mkdirSync(LOCK_DIR); lockHeld = true; return; } catch (_) { /* held */ }
    try {
      if (Date.now() - statSync(LOCK_DIR).mtimeMs > LOCK_STALE_MS) {
        rmdirSync(LOCK_DIR);
        continue;
      }
    } catch (_) { continue; } // vanished between calls — retry immediately
    if (Date.now() - t0 > 10 * 60 * 1000) throw new Error('cot-shots lock timeout');
    await new Promise((r) => setTimeout(r, 2000 + Math.random() * 1000));
  }
}
function releaseLock() {
  if (!lockHeld) return;
  lockHeld = false;
  try { rmdirSync(LOCK_DIR); } catch (_) { /* fine */ }
}
await acquireLock();
process.on('exit', releaseLock);

const args = process.argv.slice(2);
function opt(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
}
const outDir = resolve(opt('out', 'shots'));
const width = parseInt(opt('width', '1920'), 10);
const height = parseInt(opt('height', '1080'), 10);
const onlyViews = opt('views', '') ? opt('views', '').split(',') : null;
mkdirSync(outDir, { recursive: true });

const port = 5200 + Math.floor(Math.random() * 700);
const server = await createServer({
  root: process.cwd(),
  logLevel: 'error',
  server: { port, strictPort: false, watch: { ignored: ['**/*'] } },
  optimizeDeps: {
    // tank_models r3: pre-bundle the lazy-loaded modules so dep discovery can
    // never trigger a mid-capture page reload / stale-chunk 504
    entries: ['index.html'],
    include: [
      'three',
      'three/examples/jsm/loaders/GLTFLoader.js',
      'three/examples/jsm/utils/SkeletonUtils.js',
      'three/examples/jsm/utils/BufferGeometryUtils.js',
      'three/examples/jsm/geometries/RoundedBoxGeometry.js',
    ],
  },
});
await server.listen();
const actualPort = server.config.server.port;
const url = `http://localhost:${actualPort}/`;
console.log(`[shots] vite up at ${url}`);

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
await page.setViewport({ width, height, deviceScaleFactor: 1 });

const consoleErrors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error' && !msg.text().includes('favicon')) consoleErrors.push(msg.text());
});
page.on('pageerror', (err) => consoleErrors.push(String(err)));

let failed = false;
try {
  // tank_models/terrain_environment/hud_ui r3: one retry on navigation/ready
  // timeout — cold vite transforms under machine load can legitimately exceed
  // the old 30 s budget, and stale-dep 504s from a failed attempt are not
  // capture errors.
  for (let attempt = 0; ; attempt++) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await page.waitForFunction('window.__GAME_READY === true', { timeout: 90000 });
      break;
    } catch (err) {
      if (attempt >= 1) throw err;
      console.warn(`[shots] load attempt ${attempt + 1} failed (${err.message}) — retrying`);
      consoleErrors.length = 0;
    }
  }

  const views = await page.evaluate(() =>
    window.__SHOTS && Array.isArray(window.__SHOTS.views) ? window.__SHOTS.views : []
  );
  const targets = onlyViews ? views.filter((v) => onlyViews.includes(v)) : views;
  if (targets.length === 0) throw new Error('No screenshot views exposed via window.__SHOTS.views');

  for (const view of targets) {
    await page.evaluate((v) => window.__SHOTS.set(v), view);
    // let the scene settle: post-processing, particles, LOD, shadows.
    // Map-switch views rebuild the whole world (terrain bake, props,
    // vegetation) — on cold vite transforms the fixed 1.2 s could capture
    // the PREVIOUS screen (terrain_environment r1), so they get ~3 s.
    const settleMs = view.startsWith('battlefield_') ? 3000 : 1200;
    await new Promise((r) => setTimeout(r, settleMs));
    const file = `${outDir}/${view}.png`;
    await page.screenshot({ path: file });
    console.log(`[shots] captured ${file}`);
  }
} catch (err) {
  failed = true;
  console.error(`[shots] FAILED: ${err.message}`);
} finally {
  if (consoleErrors.length) {
    console.error(`[shots] page console errors (${consoleErrors.length}):`);
    for (const e of consoleErrors.slice(0, 30)) console.error(`  ${e}`);
  }
  await browser.close();
  await server.close();
}
process.exit(failed || consoleErrors.length ? 1 : 0);
