// Fleet tank-asset generator. Each tank receives the five gameplay views plus
// data-driven hit-zone, armor/penetration and module diagrams. A checked
// manifest binds every file to the exact rendered geometry and gameplay data.
//
// Usage:
//   node tools/genIcons.mjs
//   node tools/genIcons.mjs --tanks m1a2,bmp2
//   node tools/genIcons.mjs --ids=m1a2,bmp2   (compatibility alias)
//   node tools/genIcons.mjs --out /tmp/icons --ids=m1a2 --allow-partial

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { TANK_ASSET_SCHEMA_VERSION, TANK_ASSET_VIEWS } from '../src/vehicles/tankAssets.js';

const args = process.argv.slice(2);
function opt(name, fallback = '') {
  const prefix = `--${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
}

const outDir = resolve(opt('out', 'public/icons'));
const selected = opt('tanks') || opt('ids');
const onlyTanks = selected ? selected.split(',').map((id) => id.trim()).filter(Boolean) : [];
const allowPartial = args.includes('--allow-partial');
const manifestPath = resolve(outDir, 'tank-assets.json');
mkdirSync(outDir, { recursive: true });

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function readManifest() {
  if (!existsSync(manifestPath)) return null;
  return JSON.parse(readFileSync(manifestPath, 'utf8'));
}

const startingManifest = readManifest();
if (onlyTanks.length && !startingManifest && !allowPartial) {
  console.error('[tank-assets] Selective generation needs an existing complete manifest;');
  console.error('[tank-assets] run the full fleet once or pass --allow-partial for scratch output.');
  process.exit(1);
}
if (startingManifest && startingManifest.schemaVersion !== TANK_ASSET_SCHEMA_VERSION) {
  console.error(`[tank-assets] Manifest schema ${startingManifest.schemaVersion} is incompatible with generator schema ${TANK_ASSET_SCHEMA_VERSION}; regenerate the full fleet.`);
  process.exit(1);
}

function assetRecord(file, view) {
  const def = TANK_ASSET_VIEWS[view];
  const buffer = readFileSync(resolve(outDir, file));
  return {
    file,
    width: def.width,
    height: def.height,
    mime: def.ext === 'png' ? 'image/png' : 'image/webp',
    bytes: buffer.length,
    sha256: sha256(buffer),
  };
}

const server = await createServer({
  root: process.cwd(),
  logLevel: 'error',
  server: { port: 5980, strictPort: false, hmr: false, watch: null },
});
await server.listen();
const url = `http://localhost:${server.config.server.port}/tools/icons-page.html`;
console.log(`[tank-assets] studio ${url}`);

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(String(error)));
page.on('console', (message) => {
  if (message.type() === 'error' && !message.text().includes('favicon') && !message.text().includes('404')) {
    pageErrors.push(message.text());
  }
});

let failed = false;
try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction('window.__ICONS_READY === true', { timeout: 60000 });
  await page.evaluate((ids) => window.__WARM(ids), onlyTanks);
  await page.waitForFunction(
    () => {
      window.__GLB_POLLS = (window.__GLB_POLLS || 0) + 1;
      const stats = window.__GLB_STATS;
      if (!stats) return window.__GLB_POLLS >= 10;
      const settled = stats.started === stats.settled;
      window.__GLB_SETTLE_STREAK = settled ? (window.__GLB_SETTLE_STREAK || 0) + 1 : 0;
      return window.__GLB_SETTLE_STREAK >= 2;
    },
    { timeout: 120000, polling: 400 },
  );

  const generated = await page.evaluate((ids) => window.__GEN(ids), onlyTanks);
  for (const [name, dataUrl] of Object.entries(generated.files)) {
    if (name.endsWith('.error')) {
      failed = true;
      console.error(`[tank-assets] ${name}: ${dataUrl}`);
      continue;
    }
    const buffer = Buffer.from(dataUrl.split(',')[1], 'base64');
    writeFileSync(resolve(outDir, name), buffer);
    console.log(`[tank-assets] wrote ${name} (${Math.round(buffer.length / 1024)} KB)`);
  }

  if (!failed) {
    const previous = startingManifest;
    const tanks = onlyTanks.length && previous ? { ...previous.tanks } : {};
    for (const [id, meta] of Object.entries(generated.tanks)) {
      const assets = {};
      for (const [view, file] of Object.entries(meta.requiredFiles)) assets[view] = assetRecord(file, view);
      tanks[id] = { ...meta, assets };
      delete tanks[id].requiredFiles;
    }
    const sortedTanks = Object.fromEntries(Object.entries(tanks).sort(([a], [b]) => a.localeCompare(b)));
    const manifest = {
      schemaVersion: TANK_ASSET_SCHEMA_VERSION,
      partial: onlyTanks.length ? (previous ? !!previous.partial : true) : false,
      generator: 'tools/genIcons.mjs',
      requiredViews: Object.keys(TANK_ASSET_VIEWS),
      tanks: sortedTanks,
    };
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`[tank-assets] ${Object.keys(generated.tanks).length} tanks, ${Object.keys(generated.files).length} files -> ${outDir}`);
    console.log(`[tank-assets] manifest ${manifestPath}`);
  }
} catch (error) {
  failed = true;
  console.error(`[tank-assets] FAILED: ${error.message}`);
} finally {
  if (pageErrors.length) {
    failed = true;
    console.error(`[tank-assets] page errors (${pageErrors.length}):`);
    for (const error of pageErrors.slice(0, 20)) console.error(`  ${error}`);
  }
  await browser.close();
  await server.close();
}

process.exit(failed ? 1 : 0);
