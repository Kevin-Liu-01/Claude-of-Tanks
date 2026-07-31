// tools/geometry-gate.mjs — THE authoritative geometric gate.
//
// For each tank with a local reference, extracts identical measured curves
// from BOTH models (same pipeline — nothing self-reported) and scores:
// hull/whole/turret curve deviation, 14-station dimensional error, published
// spec-dimension anchor, and articulation floater detection. GATE: every
// component >= 90; the MINIMUM is the headline; nothing averages away.
//
// Writes docs/geometry-gate/<id>.json (full deltas — the builder's work
// order) and maintains docs/geometry-gate/ledger.json (tool-written only).
//
// Usage: node tools/geometry-gate.mjs [--ids=a,b] [--check]

import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'vite';
import puppeteer from 'puppeteer';

const ROOT = process.cwd();
const args = process.argv.slice(2);
const eq = args.find((a) => a.startsWith('--ids='));
const requested = eq ? eq.slice(6).split(',').map((s) => s.trim()).filter(Boolean) : null;
const CHECK = args.includes('--check');
const OUT = path.join(ROOT, 'docs', 'geometry-gate');
fs.mkdirSync(OUT, { recursive: true });

const server = await createServer({
  root: ROOT,
  logLevel: 'error',
  server: { port: 7400 + Math.floor(Math.random() * 200), strictPort: false, hmr: false, watch: null },
});
await server.listen();
const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
page.setDefaultTimeout(150000);
const urlFor = (id) => `http://localhost:${server.config.server.port}/tools/procedural-fidelity.html?id=${encodeURIComponent(id)}&geo=1`;

const rows = [];
try {
  await page.goto(urlFor(requested?.[0] || 'm1a2'), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('Array.isArray(window.__REFERENCE_IDS)');
  const ids = requested || await page.evaluate('window.__REFERENCE_IDS');
  for (const id of ids) {
    try {
      await page.goto(urlFor(id), { waitUntil: 'domcontentloaded' });
      await page.waitForFunction('window.__FIDELITY_READY === true', { polling: 60 });
      const report = await page.evaluate('window.__GEO_REPORT');
      if (!report) throw new Error('no __GEO_REPORT');
      fs.writeFileSync(path.join(OUT, `${id}.json`), `${JSON.stringify(report, null, 1)}\n`);
      rows.push(report);
      const c = report.components;
      console.log(`[geo ${String(rows.length).padStart(2)}] ${id.padEnd(20)} min ${String(report.geoMin).padStart(5)} ` +
        `| hull ${c.hullCurves} whole ${c.wholeCurves} turret ${c.turretCurves} ` +
        `stations ${c.stations} dims ${c.dims} floaters ${c.floaters} ${report.gatePassed ? 'PASS' : ''}`);
    } catch (error) {
      rows.push({ id, geoMin: 0, gatePassed: false, error: String(error.message) });
      console.error(`[geo] ${id}: ${error.message}`);
    }
  }
} finally {
  await browser.close();
  await server.close();
}

rows.sort((a, b) => a.geoMin - b.geoMin);
const passed = rows.filter((r) => r.gatePassed).length;
const ledger = {
  generatedAt: new Date().toISOString(),
  gate: 'every component >= 90; min is the headline',
  passed, total: rows.length,
  rows: rows.map((r) => ({ id: r.id, geoMin: r.geoMin, gatePassed: r.gatePassed, components: r.components })),
};
fs.writeFileSync(path.join(OUT, 'ledger.json'), `${JSON.stringify(ledger, null, 1)}\n`);
console.log(`\ngeometry-gate: ${passed}/${rows.length} pass (all components >= 90); ` +
  `worst ${rows[0]?.id} (${rows[0]?.geoMin})`);
if (CHECK && passed < rows.length) process.exitCode = 1;
