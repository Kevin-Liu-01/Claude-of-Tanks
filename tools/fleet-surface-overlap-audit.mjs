// Detects positive-area, same-facing, coplanar visible triangles belonging to
// different tank surfaces. These are depth-ambiguous and can flicker or swap
// textures as the camera moves even when a frozen frame looks acceptable.
//
// Examples:
//   node tools/fleet-surface-overlap-audit.mjs --ids=type10b --report-only
//   node tools/fleet-surface-overlap-audit.mjs --check --out=/tmp/surface-overlaps.json
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
const requestedWorkers = Number.parseInt(option('workers', '4'), 10);
const workerCount = Number.isFinite(requestedWorkers)
  ? Math.max(1, Math.min(8, requestedWorkers))
  : 4;
const outputPath = resolve(option('out', '.qa-device/fleet-surface-overlap-audit.json'));
const check = args.includes('--check') && !args.includes('--report-only');
const root = process.cwd();
const cacheDir = resolve('/tmp', `cot-fleet-overlap-vite-${process.pid}`);

const server = await createServer({
  root,
  configFile: false,
  cacheDir,
  logLevel: 'error',
  optimizeDeps: { noDiscovery: true },
  server: { host: '127.0.0.1', port: 7800 + (process.pid % 150), strictPort: true, hmr: false, watch: null },
});
await server.listen();
await server.ssrLoadModule('/src/vehicles/tankFactory.ts');
const tankAssets = JSON.parse(readFileSync(resolve(root, 'public/icons/tank-assets.json'), 'utf8'));
const registeredIds = Object.keys(tankAssets.tanks || {});
const ids = selectedIds.length ? selectedIds : registeredIds;
const port = server.httpServer.address().port;
const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
});
const rows = [];
let nextIndex = 0;

try {
  await Promise.all(Array.from({ length: Math.min(workerCount, ids.length) }, async () => {
    let page = await browser.newPage();
    page.setDefaultTimeout(120000);
    while (nextIndex < ids.length) {
      const id = ids[nextIndex++];
      const url = `http://127.0.0.1:${port}/tools/fleet-surface-overlap-audit.html?id=${encodeURIComponent(id)}`;
      let row = null;
      let lastError = null;
      for (let attempt = 0; attempt < 2 && !row; attempt += 1) {
        try {
          await page.goto(url, { waitUntil: 'domcontentloaded' });
          await page.waitForFunction('window.__SURFACE_OVERLAP_AUDIT_READY === true', { polling: 25 });
          row = await page.evaluate(() => window.__SURFACE_OVERLAP_AUDIT);
        } catch (error) {
          lastError = error;
          await page.close().catch(() => {});
          page = await browser.newPage();
          page.setDefaultTimeout(120000);
        }
      }
      rows.push(row || { id, error: `audit page failed twice: ${lastError?.message || String(lastError)}` });
      process.stdout.write(`\r[fleet-surface-overlap] ${rows.length}/${ids.length} ${id}          `);
    }
    await page.close();
  }));
} finally {
  process.stdout.write('\n');
  await browser.close();
  await server.close();
  rmSync(cacheDir, { recursive: true, force: true });
}

const idOrder = new Map(ids.map((id, index) => [id, index]));
rows.sort((lhs, rhs) => idOrder.get(lhs.id) - idOrder.get(rhs.id));
const failures = rows.filter((row) => row.error);
const affected = rows.filter((row) => !row.error && row.stats.findings > 0);
const findings = affected.flatMap((row) => row.findings.map((finding) => ({ id: row.id, ...finding })))
  .sort((lhs, rhs) => rhs.areaM2 - lhs.areaM2);
const mitigatedFindings = rows.filter((row) => !row.error)
  .flatMap((row) => row.mitigatedFindings.map((finding) => ({ id: row.id, ...finding })))
  .sort((lhs, rhs) => rhs.areaM2 - lhs.areaM2);
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  method: 'same-facing cross-surface triangle intersection on quantized world-space planes; markings, shadow-only and polygon-offset materials excluded',
  rosterSource: selectedIds.length ? 'explicit --ids' : 'public/icons/tank-assets.json',
  rosterCount: ids.length,
  summary: {
    buildFailures: failures.length,
    affectedTanks: affected.length,
    findings: findings.length,
    overlapAreaM2: Number(findings.reduce((sum, finding) => sum + finding.areaM2, 0).toFixed(9)),
    depthMitigatedFindings: mitigatedFindings.length,
    depthMitigatedAreaM2: Number(mitigatedFindings
      .reduce((sum, finding) => sum + finding.areaM2, 0).toFixed(9)),
  },
  failures: failures.map(({ id, error }) => ({ id, error })),
  affected: affected.map((row) => ({
    id: row.id,
    findings: row.stats.findings,
    overlapAreaM2: row.stats.overlapAreaM2,
  })),
  findings,
  mitigatedFindings,
  rows,
};
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`[fleet-surface-overlap] wrote ${ids.length} tanks -> ${outputPath}`);
console.log(`[fleet-surface-overlap] ${affected.length} affected tanks, ${findings.length} findings, `
  + `${report.summary.overlapAreaM2.toFixed(6)} m^2 overlap`);
console.log(`[fleet-surface-overlap] ${mitigatedFindings.length} exterior overlap groups have distinct deterministic depth layers`);
for (const finding of findings.slice(0, 20)) {
  console.log(`  ${finding.id}: ${finding.areaM2.toFixed(6)} m^2 — `
    + `${finding.surfaces[0].object}/${finding.surfaces[0].material} <> `
    + `${finding.surfaces[1].object}/${finding.surfaces[1].material}`);
}
if (failures.length || (check && findings.length)) process.exitCode = 1;
