// Deterministic, instancing-aware geometry census for every playable tank.
//
// Examples:
//   node tools/fleet-geometry-audit.mjs
//   node tools/fleet-geometry-audit.mjs --modes=gallery,battle-bot-far
//   node tools/fleet-geometry-audit.mjs --ids=m1a2,t90m --out=/tmp/audit.json
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createServer } from 'vite';
import puppeteer from 'puppeteer';

const args = process.argv.slice(2);
const option = (name, fallback = '') => {
  const inline = args.find((arg) => arg.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};
const selectedIds = option('ids').split(',').map((id) => id.trim()).filter(Boolean);
const modes = option('modes', 'gallery,garage,battle-player,battle-bot-near,battle-bot-far,battle-mobile-player-far')
  .split(',').map((mode) => mode.trim()).filter(Boolean);
const requestedWorkers = Number.parseInt(option('workers', '4'), 10);
const workerCount = Number.isFinite(requestedWorkers)
  ? Math.max(1, Math.min(8, requestedWorkers))
  : 4;
const outputPath = resolve(option('out', '.qa-device/fleet-geometry-audit.json'));
const root = process.cwd();
const cacheDir = resolve('/tmp', `cot-fleet-geometry-vite-${process.pid}`);

const server = await createServer({
  root,
  configFile: false,
  cacheDir,
  logLevel: 'error',
  optimizeDeps: { noDiscovery: true },
  server: { host: '127.0.0.1', port: 7600 + (process.pid % 200), strictPort: true, hmr: false, watch: null },
});
await server.listen();
await server.ssrLoadModule('/src/vehicles/tankFactory.ts');
const { ALL_TANK_IDS } = await server.ssrLoadModule('/src/vehicles/specs.js');
const tankAssets = JSON.parse(readFileSync(resolve(root, 'public/icons/tank-assets.json'), 'utf8'));
const registeredIds = Object.keys(tankAssets.tanks || {});
const ids = selectedIds.length ? selectedIds : registeredIds;
const port = server.httpServer.address().port;

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
});
const rows = [];
const failures = [];
const jobs = modes.flatMap((mode) => ids.map((id) => ({ id, mode })));
let nextJobIndex = 0;
let completedJobs = 0;

try {
  await Promise.all(Array.from({ length: Math.min(workerCount, jobs.length) }, async () => {
    let page = await browser.newPage();
    page.setDefaultTimeout(120000);
    while (nextJobIndex < jobs.length) {
      const { id, mode } = jobs[nextJobIndex++];
      const url = `http://127.0.0.1:${port}/tools/fleet-geometry-audit.html?id=${encodeURIComponent(id)}&mode=${encodeURIComponent(mode)}`;
      let row = null;
      let lastError = null;
      for (let attempt = 0; attempt < 2 && !row; attempt += 1) {
        try {
          await page.goto(url, { waitUntil: 'domcontentloaded' });
          await page.waitForFunction('window.__GEOMETRY_AUDIT_READY === true', { polling: 25 });
          row = await page.evaluate(() => window.__GEOMETRY_AUDIT);
        } catch (error) {
          lastError = error;
          await page.close().catch(() => {});
          page = await browser.newPage();
          page.setDefaultTimeout(120000);
        }
      }
      if (!row) {
        row = {
          id,
          mode,
          error: `audit page failed twice: ${lastError?.message || String(lastError)}`,
        };
      }
      rows.push(row);
      if (row.error) failures.push({ id, mode, error: row.error });
      completedJobs += 1;
      process.stdout.write(`\r[fleet-geometry] ${mode} ${completedJobs}/${jobs.length} ${id}          `);
    }
    await page.close();
  }));
} finally {
  process.stdout.write('\n');
  await browser.close();
  await server.close();
  rmSync(cacheDir, { recursive: true, force: true });
}

const modeOrder = new Map(modes.map((mode, index) => [mode, index]));
const idOrder = new Map(ids.map((id, index) => [id, index]));
rows.sort((a, b) => (modeOrder.get(a.mode) - modeOrder.get(b.mode)) ||
  (idOrder.get(a.id) - idOrder.get(b.id)));

const successful = rows.filter((row) => !row.error);
const byMode = {};
for (const mode of modes) {
  const modeRows = successful.filter((row) => row.mode === mode);
  const total = (field) => modeRows.reduce((sum, row) => sum + row.totals[field], 0);
  const ranked = [...modeRows].sort((a, b) => b.totals.triangles - a.totals.triangles);
  byMode[mode] = {
    tanks: modeRows.length,
    triangles: total('triangles'),
    bufferVertices: total('bufferVertices'),
    points: total('points'),
    objects: total('objects'),
    topTriangleTanks: ranked.slice(0, 20).map((row) => ({
      id: row.id,
      triangles: row.totals.triangles,
      bufferVertices: row.totals.bufferVertices,
      objects: row.totals.objects,
      topObject: row.topObjects[0] || null,
    })),
  };
}

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  sourceRevision: process.env.GIT_COMMIT || null,
  method: 'visible geometry traversal; indexed topology and InstancedMesh/BatchedMesh multiplicity included',
  rosterSource: selectedIds.length ? 'explicit --ids' : 'public/icons/tank-assets.json',
  rosterCount: ids.length,
  playableRosterCount: ALL_TANK_IDS.length,
  modes,
  summary: { failures: failures.length, byMode },
  failures,
  rows,
};
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`[fleet-geometry] wrote ${rows.length} rows for ${ids.length} tanks -> ${outputPath}`);
for (const [mode, summary] of Object.entries(byMode)) {
  console.log(`[fleet-geometry] ${mode}: ${summary.triangles.toLocaleString()} triangles, ` +
    `${summary.bufferVertices.toLocaleString()} buffer vertices, ${summary.objects.toLocaleString()} objects`);
}
if (failures.length) {
  console.error(`[fleet-geometry] FAIL — ${failures.length} tank/mode builds failed`);
  process.exitCode = 1;
}
