// Headless screenshot harness for critic agents.
// Usage: node tools/screenshot.mjs [--out shots] [--views name1,name2] [--width 1920] [--height 1080]
// Starts a vite dev server, loads the game in headless Chromium, waits for
// window.__GAME_READY, then iterates window.__SHOTS.views (or --views subset),
// calling window.__SHOTS.set(name) before each capture.
// Exits non-zero and prints page console errors if the game fails to load.

import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

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
  server: { port, strictPort: false },
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
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', (err) => consoleErrors.push(String(err)));

let failed = false;
try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 90000 });

  const views = await page.evaluate(() =>
    window.__SHOTS && Array.isArray(window.__SHOTS.views) ? window.__SHOTS.views : []
  );
  const targets = onlyViews ? views.filter((v) => onlyViews.includes(v)) : views;
  if (targets.length === 0) throw new Error('No screenshot views exposed via window.__SHOTS.views');

  for (const view of targets) {
    await page.evaluate((v) => window.__SHOTS.set(v), view);
    // let the scene settle: post-processing, particles, LOD, shadows
    await new Promise((r) => setTimeout(r, 1200));
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
