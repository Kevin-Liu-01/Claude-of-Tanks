// Bake the exact supersampled in-game tactical-map backgrounds once so the
// production client never traverses/renders/reads back the battlefield merely
// to draw its HUD minimap.
//
// Usage:
//   node tools/bake-minimap-assets.mjs
//   node tools/bake-minimap-assets.mjs --maps verdant,desert --out /tmp/minimaps

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { MAP_IDS } from '../src/world/maps/index.js';

const argv = process.argv.slice(2);
function option(name, fallback) {
  const inline = argv.find((arg) => arg.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? argv[index + 1] : fallback;
}

const requested = option('maps', 'all');
const maps = requested === 'all'
  ? [...MAP_IDS]
  : requested.split(',').map((id) => id.trim()).filter(Boolean);
for (const id of maps) {
  if (!MAP_IDS.includes(id)) throw new Error(`Unknown battlefield '${id}'`);
}
const outDir = resolve(option('out', 'public/minimaps'));
await mkdir(outDir, { recursive: true });

const cacheDir = resolve('/tmp', `cot-minimap-vite-${process.pid}`);
const server = await createServer({
  root: process.cwd(),
  configFile: false,
  cacheDir,
  logLevel: 'error',
  optimizeDeps: { noDiscovery: true },
  server: {
    host: '127.0.0.1',
    port: 7600 + (process.pid % 200),
    strictPort: true,
    hmr: false,
    watch: null,
  },
});
await server.listen();
const address = server.httpServer.address();
const port = typeof address === 'object' && address ? address.port : server.config.server.port;
const url = `http://127.0.0.1:${port}/?qa=1`;

const browser = await puppeteer.launch({
  headless: 'new',
  protocolTimeout: 15 * 60 * 1000,
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => {
  if (message.type() === 'error' && !message.text().includes('favicon')) {
    errors.push(message.text());
  }
});

let failed = false;
try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });
  for (const id of maps) {
    const dataUrl = await page.evaluate((mapId) => window.__DEBUG.bakeMinimapForMap(mapId), id);
    if (!dataUrl?.startsWith('data:image/webp;base64,')) {
      throw new Error(`Battlefield '${id}' did not return a WebP tactical map`);
    }
    const bytes = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
    await writeFile(resolve(outDir, `${id}.webp`), bytes);
    console.log(`[minimap-assets] ${id}: ${bytes.length} bytes`);
  }
  if (errors.length) throw new Error(`Browser errors:\n${errors.join('\n')}`);
} catch (error) {
  failed = true;
  console.error(error);
} finally {
  await browser.close();
  await server.close();
}

if (failed) process.exitCode = 1;
