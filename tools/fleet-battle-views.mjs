// Deterministic low-geometry tank renders at representative battle distances.
// These images make LOD changes reviewable at the exact screen scale where
// they are intended to operate.
//
// Usage:
//   node tools/fleet-battle-views.mjs --out=/tmp/fleet-before
//   node tools/fleet-battle-views.mjs --ids=m1a2,t90m --distances=40,60,90
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import puppeteer from 'puppeteer';

const args = process.argv.slice(2);
const option = (name, fallback = '') => {
  const inline = args.find((arg) => arg.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};
const root = process.cwd();
const outDir = resolve(option('out', '.qa-device/fleet-battle-views'));
const selectedIds = option('ids').split(',').map((id) => id.trim()).filter(Boolean);
const distances = option('distances', '40,60,90,180').split(',')
  .map(Number).filter((distance) => Number.isFinite(distance) && distance > 0);
const requestedWorkers = Number.parseInt(option('workers', '4'), 10);
const workerCount = Number.isFinite(requestedWorkers)
  ? Math.max(1, Math.min(6, requestedWorkers)) : 4;
const sourceManifest = JSON.parse(readFileSync(resolve(root, 'public/icons/tank-assets.json'), 'utf8'));
const ids = selectedIds.length ? selectedIds : Object.keys(sourceManifest.tanks || {});
const cacheDir = resolve('/tmp', `cot-fleet-battle-views-vite-${process.pid}`);

const server = await createServer({
  root,
  configFile: false,
  cacheDir,
  logLevel: 'error',
  optimizeDeps: { noDiscovery: true },
  server: {
    host: '127.0.0.1',
    port: 7800 + (process.pid % 100),
    strictPort: true,
    hmr: false,
    watch: null,
  },
});
await server.listen();
const port = server.httpServer.address().port;
const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
});
const jobs = ids.flatMap((id) => distances.map((distance) => ({ id, distance })));
const assets = Object.fromEntries(ids.map((id) => [id, { assets: {} }]));
let nextJob = 0;
let completed = 0;
mkdirSync(resolve(outDir, 'views'), { recursive: true });

try {
  await Promise.all(Array.from({ length: Math.min(workerCount, jobs.length) }, async () => {
    const page = await browser.newPage();
    page.setDefaultTimeout(120000);
    await page.goto(`http://127.0.0.1:${port}/tools/fleet-battle-views.html`, {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForFunction('window.__BATTLE_VIEW_READY === true');
    while (nextJob < jobs.length) {
      const { id, distance } = jobs[nextJob++];
      const rendered = await page.evaluate(
        (tankId, distanceM) => window.__RENDER_BATTLE_VIEW(tankId, distanceM),
        id,
        distance,
      );
      const view = `battle${distance}`;
      const file = `views/${id}-${view}.png`;
      const encoded = rendered.dataUrl.replace(/^data:image\/png;base64,/, '');
      writeFileSync(resolve(outDir, file), Buffer.from(encoded, 'base64'));
      assets[id].assets[view] = {
        file,
        mime: 'image/png',
        width: rendered.width,
        height: rendered.height,
        distanceM: distance,
      };
      completed++;
      process.stdout.write(`\r[fleet-battle-views] ${completed}/${jobs.length} ${id} @ ${distance} m          `);
    }
    await page.close();
  }));
} finally {
  process.stdout.write('\n');
  await browser.close();
  await server.close();
  rmSync(cacheDir, { recursive: true, force: true });
}

const manifest = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  method: 'procedural low-geometry battle render; deterministic camo seed 4242',
  distancesM: distances,
  tanks: assets,
};
writeFileSync(resolve(outDir, 'tank-assets.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`[fleet-battle-views] wrote ${jobs.length} images for ${ids.length} tanks -> ${outDir}`);
