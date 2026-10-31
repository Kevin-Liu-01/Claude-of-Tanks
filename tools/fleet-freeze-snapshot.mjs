// Generate or verify the complete first-party fleet's dual geometry ledger.
//
// The historical graduate freeze intentionally hashes mesh topology and world
// transforms. The shipped asset fingerprint additionally hashes instanced
// transforms, which is essential for wheels, tracks and repeated fittings.
// A release record is authoritative only when both fingerprints agree.
//
// Usage:
//   node tools/fleet-freeze-snapshot.mjs
//   node tools/fleet-freeze-snapshot.mjs --check
//   node tools/fleet-freeze-snapshot.mjs [--check] --ids=a,b
//
// --ids (2026-10-16, changed-only): capture only those tanks and keep every other row exactly as recorded (an id with no
// row is always captured), so a scoped run writes the bytes a whole-fleet run would when the other rows are current;
// --check --ids verifies those tanks. The freeze is a nightly or explicit whole-fleet record, not a release step.
import { launchGuardedBrowser } from './browser-launch.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { uniqueIds } from './id-list.mjs';
import { readTankAssets } from './tank-assets-store.mjs';

const check = process.argv.includes('--check');
const root = process.cwd();
const outputPath = resolve(root, 'docs/FLEET-FREEZE-CURRENT.json');
const manifest = readTankAssets(resolve(root, 'public/icons'));
// Every saved record has an icon-manifest row since the hidden fleet retired
// (2026-09-23); the geometry freeze covers exactly the manifest.
const ids = Object.keys(manifest.tanks || {}).sort();
const idsArg = process.argv.find((arg) => arg.startsWith('--ids='))?.slice(6) ?? '';
const scoped = idsArg && idsArg !== 'all' ? new Set(uniqueIds(idsArg.split(',').filter(Boolean), 'fleet-freeze-snapshot --ids')) : null;
if (scoped) for (const id of scoped) if (!ids.includes(id)) throw new Error(`[fleet-freeze] unknown id ${id} (no row in public/icons/tank-assets/)`);
const previous = scoped ? JSON.parse(readFileSync(outputPath, 'utf8')).tanks ?? {} : {};
const capturing = ids.filter((id) => !scoped || scoped.has(id) || !Object.hasOwn(previous, id));

const server = await createServer({
  root,
  logLevel: 'error',
  server: {
    port: 7550 + Math.floor(Math.random() * 100),
    strictPort: false,
    hmr: false,
    watch: null,
  },
});
await server.listen();

const browser = await launchGuardedBrowser(puppeteer, {
  headless: 'new',
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
page.setDefaultTimeout(120000);

const tanks = {};
async function capture(id, seed, assetMode = false) {
  await page.goto(
    `http://localhost:${server.config.server.port}/tools/fleet-freeze-probe.html?id=${encodeURIComponent(id)}&seed=${seed}&asset=${assetMode ? 1 : 0}`,
    { waitUntil: 'domcontentloaded' },
  );
  await page.waitForFunction('window.__HASH_READY === true', { polling: 50 });
  return page.evaluate('window.__GEOHASH');
}

try {
  for (const id of ids) {
    if (!capturing.includes(id)) { tanks[id] = previous[id]; continue; }
    const result = await capture(id, 4242);
    const assetResult = await capture(id, 4100, true);
    const manifestHash = manifest.tanks[id]?.geometryHash;
    if (manifestHash && assetResult.assetHash !== manifestHash) {
      throw new Error(`${id}: asset fingerprint ${assetResult.assetHash} != manifest ${manifestHash}`);
    }
    tanks[id] = {
      freezeHash: result.hash.padStart(8, '0'),
      instanceFreezeHash: result.assetHash,
      assetGeometryHash: assetResult.assetHash,
      meshes: result.meshCount,
      vertices: result.vertCount,
    };
  }
} finally {
  await browser.close();
  await server.close();
}

const snapshot = {
  schemaVersion: 1,
  rosterCount: ids.length,
  provenance: 'first-party-procedural-only',
  camoSeed: 4242,
  assetCamoSeed: 4100,
  quality: 'high',
  algorithms: {
    freezeHash: 'fnv1a(position buffers + world matrices + indices), mesh-order independent',
    instanceFreezeHash: 'fnv1a(position buffers + world matrices + instanced transforms), mesh-order independent',
    assetGeometryHash: 'instanceFreezeHash at the deterministic asset camo seed',
  },
  tanks,
};
const serialized = `${JSON.stringify(snapshot, null, 2)}\n`;

if (check) {
  const existing = readFileSync(outputPath, 'utf8');
  if (existing !== serialized) {
    console.error('[fleet-freeze] FAIL — docs/FLEET-FREEZE-CURRENT.json is stale');
    process.exitCode = 1;
  } else {
    console.log(`[fleet-freeze] PASS — ${capturing.length} first-party tank(s) captured, ${ids.length} rows match both geometry fingerprints`);
  }
} else {
  writeFileSync(outputPath, serialized);
  console.log(`[fleet-freeze] wrote ${ids.length} tanks (${capturing.length} captured) to docs/FLEET-FREEZE-CURRENT.json`);
}
