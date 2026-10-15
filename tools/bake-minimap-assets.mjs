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
import { MAP_IDS } from '../src/world/maps/index.ts';
import { requireMinimapCapture } from './map-art-guards.mjs';
import { acquireCaptureLock, refreshCaptureLock, releaseCaptureLock } from './capture-lock.mjs';

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
await acquireCaptureLock(30 * 60 * 1000);
process.on('exit', releaseCaptureLock);
const lockRefresher = setInterval(refreshCaptureLock, 60_000);
lockRefresher.unref();

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

// three.js's compileAsync poll (checkMaterialsReady) can read a material whose program a map switch on the same page
// just disposed: "TypeError: Cannot read properties of undefined (reading 'isReady')" (2026-10-15, desert -> steppe and
// winter -> whiteout). It is an engine race at the switch, not a bad plate, so that map is baked once more on a fresh
// page. Only that error class is retried, once per map; any other browser error, or the race again, fails the bake.
const COMPILE_RACE = /Cannot read properties of undefined \(reading 'isReady'\)/;
const onlyCompileRace = (list) => list.length > 0 && list.every((text) => COMPILE_RACE.test(text));

const errors = [];
let page = null;
async function openPage() {
  if (page) await page.close();
  errors.length = 0;
  const fresh = await browser.newPage();
  page = fresh;
  await fresh.setViewport({ width: 1280, height: 720, deviceScaleFactor: 2 });
  fresh.on('pageerror', (error) => { if (page === fresh) errors.push(String(error)); });
  fresh.on('console', (message) => {
    if (page !== fresh) return;
    if (message.type() === 'error' && !message.text().includes('favicon')) {
      errors.push(message.text());
    }
    if (message.type() === 'warn' && message.text().includes('[sourcedTextures]')) errors.push(message.text());
  });
  await fresh.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await fresh.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });
}
async function bakeMap(mapId) {
  try {
    return await page.evaluate(async (id) => {
      const dataUrl = await window.__DEBUG.bakeMinimapForMap(id);
      return { dataUrl, mapId: window.__DEBUG.world?.mapId,
        capture: window.__HUD_DEBUG.getMinimapState().capture };
    }, mapId);
  } catch (error) {
    if (!COMPILE_RACE.test(String(error))) throw error;
    errors.push(String(error)); // the race rejected the bake itself: same class, same single retry
    return null;
  }
}

let failed = false;
try {
  await openPage();
  for (const id of maps) {
    let result = await bakeMap(id);
    if (onlyCompileRace(errors)) {
      console.warn(`[minimap-assets] ${id}: three.js compileAsync race at the map switch; one retry on a fresh page:\n${errors.join('\n')}`);
      await openPage();
      result = await bakeMap(id);
    }
    if (errors.length) throw new Error(`Browser errors before ${id} export:\n${errors.join('\n')}`);
    requireMinimapCapture(result, id);
    const { dataUrl } = result;
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
  clearInterval(lockRefresher);
  releaseCaptureLock();
}

if (failed) process.exitCode = 1;
