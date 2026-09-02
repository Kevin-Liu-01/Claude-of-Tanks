// Fleet tank-asset generator. Each tank receives the five gameplay views plus
// data-driven armor/penetration, module, crew, and markings diagrams. A checked
// manifest binds every file to the exact rendered geometry and gameplay data.
//
// Usage:
//   node tools/genIcons.mjs
//   node tools/genIcons.mjs --tanks m1a2,bmp2
//   node tools/genIcons.mjs --ids=m1a2,bmp2   (compatibility alias)
//   node tools/genIcons.mjs --views armorSide,modulesSide,crewSide
//   node tools/genIcons.mjs --views angle --ids=m1a2,bmp2
//   node tools/genIcons.mjs --metadata-only  (refresh manifest, preserve images)
//   node tools/genIcons.mjs --out /tmp/icons --ids=m1a2 --allow-partial
// Angle generation atomically writes both the 512px source portrait and the
// 256px Garage thumbnail through the same framing policy.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { TANK_ASSET_SCHEMA_VERSION, TANK_ASSET_VIEWS } from '../src/vehicles/tankAssets.ts';

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
const metadataOnly = args.includes('--metadata-only');
const portraitOnly = args.includes('--portraits-only');
let selectedViews = metadataOnly ? [] : opt('views')
  ? opt('views').split(',').map((view) => view.trim()).filter(Boolean)
  : Object.keys(TANK_ASSET_VIEWS);
const allowPartial = args.includes('--allow-partial');
const authoringViews = new Set(['front']);
const manifestPath = resolve(outDir, 'tank-assets.json');
mkdirSync(outDir, { recursive: true });

if (portraitOnly && (metadataOnly
    || selectedViews.length !== 1 || selectedViews[0] !== 'angle')) {
  console.error('[tank-assets] --portraits-only requires --views angle');
  process.exit(1);
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function readManifest() {
  if (!existsSync(manifestPath)) return null;
  return JSON.parse(readFileSync(manifestPath, 'utf8'));
}

let startingManifest = readManifest();
const priorManifest = startingManifest;
for (const view of selectedViews) {
  if (!TANK_ASSET_VIEWS[view] && !(allowPartial && authoringViews.has(view))) {
    console.error(`[tank-assets] Unknown view '${view}'. Expected one of: ${Object.keys(TANK_ASSET_VIEWS).join(', ')}`);
    process.exit(1);
  }
}
if (selectedViews.length < Object.keys(TANK_ASSET_VIEWS).length && !startingManifest && !allowPartial) {
  console.error('[tank-assets] Selective view generation needs an existing complete manifest.');
  process.exit(1);
}
if (onlyTanks.length && !startingManifest && !allowPartial) {
  console.error('[tank-assets] Selective generation needs an existing complete manifest;');
  console.error('[tank-assets] run the full fleet once or pass --allow-partial for scratch output.');
  process.exit(1);
}
if (startingManifest && startingManifest.schemaVersion !== TANK_ASSET_SCHEMA_VERSION) {
  if (metadataOnly) {
    console.log(`[tank-assets] metadata schema ${startingManifest.schemaVersion} -> ${TANK_ASSET_SCHEMA_VERSION}; preserving rendered views`);
  } else if (onlyTanks.length) {
    console.error(`[tank-assets] Manifest schema ${startingManifest.schemaVersion} is incompatible with generator schema ${TANK_ASSET_SCHEMA_VERSION}; regenerate the full fleet.`);
    process.exit(1);
  } else {
    console.log(`[tank-assets] schema ${startingManifest.schemaVersion} -> ${TANK_ASSET_SCHEMA_VERSION}; regenerating the complete fleet`);
    startingManifest = null;
    selectedViews = Object.keys(TANK_ASSET_VIEWS);
  }
}

function assetRecord(file, view) {
  const def = TANK_ASSET_VIEWS[view];
  const buffer = readFileSync(resolve(outDir, file));
  const record = {
    file,
    width: def.width,
    height: def.height,
    mime: def.ext === 'png' ? 'image/png' : 'image/webp',
    bytes: buffer.length,
    sha256: sha256(buffer),
  };
  if (view === 'angle') {
    const thumbnailFile = `thumbs/${file}`;
    const thumbnailBuffer = readFileSync(resolve(outDir, thumbnailFile));
    record.thumbnail = {
      file: thumbnailFile,
      width: 256,
      height: 256,
      mime: 'image/webp',
      bytes: thumbnailBuffer.length,
      sha256: sha256(thumbnailBuffer),
    };
  }
  return record;
}

const viteCacheDir = resolve('/tmp', `cot-icons-vite-${process.pid}`);
const server = await createServer({
  root: process.cwd(), configFile: false, cacheDir: viteCacheDir,
  logLevel: 'error',
  optimizeDeps: { noDiscovery: true },
  server: { host: '127.0.0.1', port: 7400 + (process.pid % 200), strictPort: true, hmr: false, watch: null },
});
await server.listen();
const address = server.httpServer.address();
const port = typeof address === 'object' && address ? address.port : server.config.server.port;
const url = `http://127.0.0.1:${port}/tools/icons-page.html`;
console.log(`[tank-assets] studio ${url}`);

const browser = await puppeteer.launch({
  headless: 'new',
  // A full three-diagram fleet refresh renders hundreds of data-driven views
  // in one deterministic page evaluation and can exceed Puppeteer's 180 s
  // protocol default on shared CI/developer machines.
  protocolTimeout: 15 * 60 * 1000,
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
  // Metadata receipts are just as dependent on the real demand-loaded builder
  // as rendered files. Auditing before this settle gate can fingerprint a
  // lightweight fallback rig and silently poison an otherwise valid manifest.
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

  const generated = await page.evaluate((ids, views, auditOnly) => {
    if (!auditOnly) return window.__GEN(ids, views);
    const audited = window.__AUDIT(ids && ids.length ? ids : window.__FLEET_IDS);
    return { ...audited, files: {} };
  }, onlyTanks, selectedViews, metadataOnly);
  for (const [name, dataUrl] of Object.entries(generated.files)) {
    if (name.endsWith('.error')) {
      failed = true;
      console.error(`[tank-assets] ${name}: ${dataUrl}`);
      continue;
    }
    const buffer = Buffer.from(dataUrl.split(',')[1], 'base64');
    const outputPath = resolve(outDir, name);
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, buffer);
    console.log(`[tank-assets] wrote ${name} (${Math.round(buffer.length / 1024)} KB)`);
  }

  if (!failed) {
    const previous = startingManifest;
    const tanks = onlyTanks.length && previous ? { ...previous.tanks } : {};
    for (const [id, meta] of Object.entries(generated.tanks)) {
      const assets = { ...(previous?.tanks?.[id]?.assets || {}) };
      // Metadata-only schema upgrades can adopt already-rendered atomic angle
      // pairs without spending another fleet render pass.
      if (metadataOnly && assets.angle?.file) {
        assets.angle = assetRecord(assets.angle.file, 'angle');
      }
      for (const [view, file] of Object.entries(meta.requiredFiles)) {
        if (selectedViews.includes(view)) assets[view] = assetRecord(file, view);
      }
      // A portrait-only refresh must not rewrite armor, modules, geometry, or
      // presentation receipts. Those belong to the anatomy pipeline and may
      // intentionally lag work in a separate branch.
      const record = portraitOnly && previous?.tanks?.[id]
        ? previous.tanks[id]
        : meta;
      tanks[id] = { ...record, assets };
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
    // A full generation is also the authoritative fleet-pruning pass. Remove
    // only obsolete files named by the previous manifest; never glob the icon
    // directory, where unrelated UI art may live. This also retires assets
    // removed by a schema migration, such as the former hit-zone duplicate.
    if (!onlyTanks.length && priorManifest?.tanks) {
      const activeFiles = new Set(Object.values(sortedTanks).flatMap((tank) =>
        Object.values(tank.assets || {}).map((asset) => asset?.file).filter(Boolean)));
      for (const prior of Object.values(priorManifest.tanks)) {
        for (const asset of Object.values(prior.assets || {})) {
          if (!asset?.file || activeFiles.has(asset.file)) continue;
          rmSync(resolve(outDir, asset.file), { force: true });
          if (asset.file.endsWith('_angle.webp')) {
            rmSync(resolve(outDir, 'thumbs', asset.file), { force: true });
          }
          console.log(`[tank-assets] pruned obsolete ${asset.file}`);
        }
      }
    }
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
  rmSync(viteCacheDir, { recursive: true, force: true });
}

process.exit(failed ? 1 : 0);
