// Aircraft preview assets (endscreen-modes-275; the owner: "when we select ac 130 game mode the tank previews should have a
// ac 130 presented like the tanks"). Renders every preview aircraft (src/vehicles/previewVehicles.ts) from its real
// airframe through tools/aircraft-assets-page.html into the tanks' own icon files under public/icons (the 3/4 portrait and
// its Garage thumbnail, the side and top views and their silhouettes), and records them in public/icons/aircraft-assets.json.
// The surfaces read an aircraft's files exactly as a tank's (iconUrl, maskIcon, tankThumbUrl); the hero card follows from
// tools/genHeroCards.mjs, whose fleet reads this manifest. Run under the capture lock:
//   node tools/with-capture-lock.mjs --lock-class=render -- node tools/genAircraftAssets.mjs [--ids=ac130] [--out=public/icons]
// First-party tooling: Kevin B. Liu (NOTICE.md).
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';
import { launchGuardedBrowser } from './browser-launch.mjs';
import { filterPublishedImage } from './media-r5/master-filter.mjs';
import { boundOrigin, loadReadyPage, toolServerOptions } from './tool-page-load.mjs';
import { AIRCRAFT_ASSETS_FILE, AIRCRAFT_VIEWS, PREVIEW_AIRCRAFT_IDS } from '../src/vehicles/previewVehicles.ts';
import { TANK_ASSET_VIEWS } from '../src/vehicles/tankAssets.ts';

const arg = (key, fallback = '') => process.argv.find((value) => value.startsWith(`--${key}=`))?.slice(key.length + 3) || fallback;
const outDir = resolve(arg('out', 'public/icons'));
const ids = arg('ids') ? arg('ids').split(',').map((id) => id.trim()).filter(Boolean) : [...PREVIEW_AIRCRAFT_IDS];
for (const id of ids) if (!PREVIEW_AIRCRAFT_IDS.includes(id)) throw new Error(`genAircraftAssets: ${id} is not a preview aircraft`);
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');
const manifestPath = resolve(outDir, AIRCRAFT_ASSETS_FILE);
const previous = (() => { try { return JSON.parse(readFileSync(manifestPath, 'utf8')); } catch { return null; } })();

const viteCacheDir = resolve('/tmp', `cot-aircraft-vite-${process.pid}`);
const server = await createServer({
  root: process.cwd(), configFile: false, cacheDir: viteCacheDir, logLevel: 'error',
  optimizeDeps: { noDiscovery: true }, server: toolServerOptions(7700),
});
const pageErrors = [];
let failed = false;
let browser;
try {
  await server.listen();
  browser = await launchGuardedBrowser(puppeteer, {
    headless: 'new', protocolTimeout: 10 * 60 * 1000,
    args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
  }, { label: 'genAircraftAssets' });
  const page = await browser.newPage();
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  page.on('console', (message) => { if (message.type() === 'error' && !message.text().includes('favicon')) pageErrors.push(message.text()); });
  await loadReadyPage(page, `${boundOrigin(server)}/tools/aircraft-assets-page.html`, { label: 'aircraft-assets', ready: 'window.__AIRCRAFT_READY === true' });
  const result = await page.evaluate((list) => window.__AIRCRAFT_GEN(list), ids);
  const aircraft = { ...(previous?.aircraft ?? {}) };
  for (const [name, dataUrl] of Object.entries(result.files)) {
    if (name.endsWith('.error')) { failed = true; console.error(`[aircraft-assets] ${name}: ${dataUrl}`); continue; }
    const raw = Buffer.from(dataUrl.split(',')[1], 'base64');
    const outputPath = resolve(outDir, name);
    mkdirSync(dirname(outputPath), { recursive: true });
    const buffer = await filterPublishedImage(raw, `icon-${name.replace(/\.[^.]+$/, '')}`,
      { type: name.endsWith('.png') ? 'image/png' : 'image/webp', quality: 90 });
    writeFileSync(outputPath, buffer);
    console.log(`[aircraft-assets] wrote ${name} (${Math.round(buffer.length / 1024)} KB)`);
  }
  if (!failed) {
    for (const [id, meta] of Object.entries(result.aircraft)) {
      const assets = {};
      for (const view of AIRCRAFT_VIEWS) {
        const def = TANK_ASSET_VIEWS[view];
        const file = `${id}_${def.suffix}.${def.ext}`;
        const buffer = readFileSync(resolve(outDir, file));
        assets[view] = { file, width: def.width, height: def.height, mime: def.ext === 'png' ? 'image/png' : 'image/webp', bytes: buffer.length, sha256: sha256(buffer) };
        if (view === 'angle') {
          const thumb = readFileSync(resolve(outDir, 'thumbs', file));
          assets.angle.thumbnail = { file: `thumbs/${file}`, width: 256, height: 256, mime: 'image/webp', bytes: thumb.length, sha256: sha256(thumb) };
        }
      }
      aircraft[id] = { ...meta, assets };
    }
    const sorted = Object.fromEntries(Object.entries(aircraft).filter(([id]) => PREVIEW_AIRCRAFT_IDS.includes(id)).sort(([a], [b]) => a.localeCompare(b)));
    writeFileSync(manifestPath, `${JSON.stringify({ schemaVersion: 1, generator: 'tools/genAircraftAssets.mjs', views: AIRCRAFT_VIEWS, aircraft: sorted }, null, 2)}\n`);
    console.log(`[aircraft-assets] ${Object.keys(result.aircraft).length} aircraft -> ${manifestPath}`);
  }
} catch (error) {
  failed = true;
  console.error(`[aircraft-assets] FAILED: ${error.stack || error.message}`);
} finally {
  if (pageErrors.length) { failed = true; console.error(`[aircraft-assets] page errors:\n  ${pageErrors.slice(0, 20).join('\n  ')}`); }
  await browser?.close();
  await server.close();
  rmSync(viteCacheDir, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
