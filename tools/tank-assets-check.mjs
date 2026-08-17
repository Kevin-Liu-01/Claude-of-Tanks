// Release gate for generated tank assets. It verifies fleet completeness,
// hashes/dimensions, live geometry and metadata freshness, plus a visible
// muzzle-bore marker for every selected vehicle.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync } from 'node:fs';
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

const selected = opt('tanks') || opt('ids');
const onlyTanks = selected ? selected.split(',').map((id) => id.trim()).filter(Boolean) : [];
const outDir = resolve(opt('out', 'public/icons'));
const manifestPath = resolve(outDir, 'tank-assets.json');
const skipBore = args.includes('--skip-bore');
const skipGeometry = args.includes('--skip-geometry');
const liveOnly = args.includes('--live-only');
const selectedViews = opt('views')
  ? opt('views').split(',').map((view) => view.trim()).filter(Boolean)
  : Object.keys(TANK_ASSET_VIEWS);
const failures = [];

for (const view of selectedViews) {
  if (!TANK_ASSET_VIEWS[view]) {
    console.error(`[tank-assets-check] unknown view '${view}'`);
    process.exit(2);
  }
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function imageDimensions(buffer, ext) {
  if (ext === 'png') {
    if (buffer.length < 24 || buffer.toString('hex', 0, 8) !== '89504e470d0a1a0a') return null;
    return [buffer.readUInt32BE(16), buffer.readUInt32BE(20)];
  }
  if (ext !== 'webp' || buffer.length < 30 || buffer.toString('ascii', 0, 4) !== 'RIFF'
      || buffer.toString('ascii', 8, 12) !== 'WEBP') return null;
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const type = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const data = offset + 8;
    if (type === 'VP8X' && data + 10 <= buffer.length) {
      const width = 1 + buffer[data + 4] + (buffer[data + 5] << 8) + (buffer[data + 6] << 16);
      const height = 1 + buffer[data + 7] + (buffer[data + 8] << 8) + (buffer[data + 9] << 16);
      return [width, height];
    }
    if (type === 'VP8 ' && data + 10 <= buffer.length && buffer[data + 3] === 0x9d
        && buffer[data + 4] === 0x01 && buffer[data + 5] === 0x2a) {
      return [buffer.readUInt16LE(data + 6) & 0x3fff, buffer.readUInt16LE(data + 8) & 0x3fff];
    }
    if (type === 'VP8L' && data + 5 <= buffer.length && buffer[data] === 0x2f) {
      const bits = buffer.readUInt32LE(data + 1);
      return [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1];
    }
    offset = data + size + (size & 1);
  }
  return null;
}

if (!liveOnly && !existsSync(manifestPath)) {
  console.error(`[tank-assets-check] missing ${manifestPath}; run npm run tank:assets`);
  process.exit(2);
}

const manifest = liveOnly ? null : JSON.parse(readFileSync(manifestPath, 'utf8'));
if (manifest && manifest.schemaVersion !== TANK_ASSET_SCHEMA_VERSION) {
  failures.push(`manifest schema ${manifest.schemaVersion} != ${TANK_ASSET_SCHEMA_VERSION}`);
}
if (manifest && !onlyTanks.length && manifest.partial) failures.push('manifest is partial; full-fleet release requires a complete manifest');
if (manifest && JSON.stringify(manifest.requiredViews) !== JSON.stringify(Object.keys(TANK_ASSET_VIEWS))) {
  failures.push('manifest required-view contract is stale');
}

const viteCacheDir = resolve('/tmp', `cot-assets-check-vite-${process.pid}`);
const server = await createServer({
  root: process.cwd(), configFile: false, cacheDir: viteCacheDir, logLevel: 'error',
  optimizeDeps: { noDiscovery: true },
  server: { host: '127.0.0.1', port: 7600 + (process.pid % 200), strictPort: true, hmr: false, watch: null },
});
await server.listen();
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

try {
  const address = server.httpServer.address();
  const port = typeof address === 'object' && address ? address.port : server.config.server.port;
  const url = `http://127.0.0.1:${port}/tools/icons-page.html`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction('window.__ICONS_READY === true', { timeout: 60000 });
  await page.evaluate((ids) => window.__WARM(ids), onlyTanks);
  await page.waitForFunction(
    () => {
      window.__ASSET_POLLS = (window.__ASSET_POLLS || 0) + 1;
      const stats = window.__GLB_STATS;
      if (!stats) return window.__ASSET_POLLS >= 10;
      const settled = stats.started === stats.settled;
      window.__ASSET_SETTLE_STREAK = settled ? (window.__ASSET_SETTLE_STREAK || 0) + 1 : 0;
      return window.__ASSET_SETTLE_STREAK >= 2;
    },
    { timeout: 120000, polling: 400 },
  );
  const audit = await page.evaluate((ids) => window.__AUDIT(ids), onlyTanks);
  const liveIds = [...audit.ids].sort();
  const manifestIds = manifest ? Object.keys(manifest.tanks || {}).sort() : [];
  if (manifest && !onlyTanks.length && JSON.stringify(liveIds) !== JSON.stringify(manifestIds)) {
    const missing = liveIds.filter((id) => !manifestIds.includes(id));
    const extra = manifestIds.filter((id) => !liveIds.includes(id));
    failures.push(`fleet mismatch: missing [${missing.join(', ')}], extra [${extra.join(', ')}]`);
  }

  const ids = onlyTanks.length ? onlyTanks : liveIds;
  let checkedFiles = 0;
  for (const id of ids) {
    const live = audit.tanks[id];
    const saved = manifest && manifest.tanks && manifest.tanks[id];
    if (!live || live.error) {
      failures.push(`${id}: live audit failed (${live && live.error || 'missing result'})`);
      continue;
    }
    if (!liveOnly && !saved) {
      failures.push(`${id}: missing manifest entry`);
      continue;
    }
    if (!skipGeometry && saved && saved.geometryHash !== live.geometryHash) failures.push(`${id}: stale geometry ${saved.geometryHash} != ${live.geometryHash}`);
    if (saved && saved.metadataHash !== live.metadataHash) failures.push(`${id}: stale tier/armor/module metadata ${saved.metadataHash} != ${live.metadataHash}`);
    if (!Number.isInteger(live.tier) || live.tier < 1 || live.tier > 10 || !live.tierNumeral) failures.push(`${id}: invalid tier metadata`);
    if (!live.countryCode) failures.push(`${id}: missing country code`);
    if (!live.markings || live.markings.countryCode !== live.countryCode
        || !live.markings.insignia || !live.markings.tacticalNumber || !live.markings.designation) {
      failures.push(`${id}: incomplete or mismatched national marking metadata`);
    }
    const markingCensus = live.vehicleMarkings || {};
    if (!(markingCensus.insignia > 0) || !(markingCensus.designation > 0)
        || !markingCensus.codes?.includes(live.markings?.markingCode)) {
      failures.push(`${id}: visible insignia/designation does not match marking code (${JSON.stringify(markingCensus)})`);
    }
    if (!live.gun || !(live.gun.caliberMm > 0) || !live.gun.shells.length) failures.push(`${id}: incomplete gun/penetration metadata`);
    if (!live.armor || !live.armor.plates.length) failures.push(`${id}: no armor hit areas`);
    if (!live.armor || !live.armor.modules.length) failures.push(`${id}: no module volumes`);
    const stableIds = [
      ...live.armor.plates.map((plate) => plate.hitboxId),
      ...live.armor.modules.map((box) => box.volumeId),
      ...live.armor.crew.map((box) => box.volumeId),
    ];
    if (stableIds.some((stableId) => !stableId) || new Set(stableIds).size !== stableIds.length) {
      failures.push(`${id}: missing or duplicate stable hitbox/module labels`);
    }
    const appearanceIssues = live.appearance?.issues || [];
    if (appearanceIssues.length) {
      failures.push(`${id}: appearance palette issues (${appearanceIssues.slice(0, 4)
        .map((issue) => `${issue.code}:${issue.object}:${issue.color?.hex || 'n/a'}`).join(', ')})`);
    }
    const bore = live.muzzleBore || {};
    if (!skipBore && (bore.tagged !== 1 || bore.rims !== 1 || bore.discs !== 1)) {
      failures.push(`${id}: cannon bore must have one visible tagged rim/disc pair (${JSON.stringify(bore)})`);
    }

    if (liveOnly) continue;
    for (const view of selectedViews) {
      const def = TANK_ASSET_VIEWS[view];
      const asset = saved.assets && saved.assets[view];
      if (!asset) {
        failures.push(`${id}: missing ${view} asset record`);
        continue;
      }
      const filePath = resolve(outDir, asset.file);
      if (!existsSync(filePath)) {
        failures.push(`${id}: missing ${asset.file}`);
        continue;
      }
      const buffer = readFileSync(filePath);
      const hash = sha256(buffer);
      if (hash !== asset.sha256) failures.push(`${id}: ${asset.file} hash drift`);
      if (buffer.length !== asset.bytes) failures.push(`${id}: ${asset.file} byte-size drift`);
      const dimensions = imageDimensions(buffer, def.ext);
      if (!dimensions || dimensions[0] !== def.width || dimensions[1] !== def.height) {
        failures.push(`${id}: ${asset.file} dimensions ${dimensions ? dimensions.join('x') : 'unreadable'} != ${def.width}x${def.height}`);
      }
      checkedFiles++;
    }
  }
  console.log(`[tank-assets-check] audited ${ids.length} tanks / ${checkedFiles} files${liveOnly ? ' (live-only)' : ''}`);
} catch (error) {
  failures.push(`browser audit failed: ${error.message}`);
} finally {
  await browser.close();
  await server.close();
  rmSync(viteCacheDir, { recursive: true, force: true });
}

for (const error of pageErrors) failures.push(`page: ${error}`);
if (failures.length) {
  console.error(`[tank-assets-check] FAIL (${failures.length})`);
  for (const failure of failures.slice(0, 80)) console.error(`  - ${failure}`);
  process.exit(2);
}
if (liveOnly) {
  console.log(`[tank-assets-check] PASS — live registry metadata${skipBore ? '' : ' and muzzle bores'} verified`);
} else {
  const skipped = [skipGeometry ? 'geometry' : '', skipBore ? 'bore' : ''].filter(Boolean);
  console.log(`[tank-assets-check] PASS — ${selectedViews.length} views, assets and metadata are current${skipped.length ? ` (${skipped.join(' + ')} gate skipped)` : '; geometry and muzzle bores verified'}`);
}
