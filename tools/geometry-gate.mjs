// tools/geometry-gate.mjs — THE authoritative geometric gate.
//
// For each tank with a local reference, extracts identical measured curves
// from BOTH models (same pipeline — nothing self-reported) and scores:
// hull/whole/turret curve deviation, 14-station dimensional error, published
// spec-dimension anchor, and articulation floater detection. GATE: every
// component meets its registered floor (90 fleet / 92 exemplar / 99 frozen
// first-party preservation); the MINIMUM
// is the headline and nothing averages away.
//
// Writes docs/geometry-gate/<id>.json (full deltas — the builder's work
// order) and maintains docs/geometry-gate/ledger.json (tool-written only).
//
// Usage: node tools/geometry-gate.mjs [--ids=a,b] [--check]

import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { unavailableOracleReport } from './geometry-gate-policy.mjs';

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
const registryUrl = `http://localhost:${server.config.server.port}/tools/procedural-fidelity.html?id=m1a2&registry=1`;

const rows = [];
try {
  // Discover eligible IDs without loading an optional local comparison file.
  // Worktrees intentionally omit quarantined GLBs, so registry discovery must
  // not depend on any one source asset being present.
  await page.goto(registryUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('Array.isArray(window.__REFERENCE_IDS)');
  const referenceIds = await page.evaluate('window.__REFERENCE_IDS');
  const referenceSources = await page.evaluate('window.__REFERENCE_SOURCES');
  const referenceQualityBars = await page.evaluate('window.__REFERENCE_QUALITY_BARS');
  const publicRoot = path.resolve(ROOT, 'public');
  const localAssetPath = (assetPath) => {
    if (typeof assetPath !== 'string' || !assetPath.startsWith('/')) return null;
    const resolved = path.resolve(publicRoot, assetPath.slice(1));
    return resolved.startsWith(`${publicRoot}${path.sep}`) ? resolved : null;
  };
  const registered = new Set(referenceIds);
  const available = new Set(referenceIds.filter((id) => {
    const localPath = localAssetPath(referenceSources[id]);
    return localPath && fs.existsSync(localPath);
  }));
  const ids = requested
    ? requested.filter((id) => available.has(id))
    : referenceIds.filter((id) => available.has(id));
  if (requested) {
    const firstPartyOnly = requested.filter((id) => !registered.has(id));
    const unavailable = requested.filter((id) => registered.has(id) && !available.has(id));
    if (firstPartyOnly.length) {
      console.log(`[geo] skipped ${firstPartyOnly.length} first-party-only vehicles without comparison registrations`);
    }
    if (unavailable.length) {
      for (const id of unavailable) {
        const qualityBar = referenceQualityBars[id] || 'fleet';
        const report = unavailableOracleReport(id, qualityBar);
        rows.push(report);
        console.error(`[geo] ${id}: registered ${qualityBar} comparison oracle unavailable (requires ${report.requiredMinimum})`);
      }
    }
  } else if (available.size < registered.size) {
    console.log(`[geo] skipped ${registered.size - available.size} optional comparison oracles unavailable in this worktree`);
  }
  for (const id of ids) {
    try {
      await page.goto(urlFor(id), { waitUntil: 'domcontentloaded' });
      await page.waitForFunction('window.__FIDELITY_READY === true || typeof window.__FIDELITY_ERROR === "string"', { polling: 60 });
      const runtimeError = await page.evaluate('window.__FIDELITY_ERROR');
      if (runtimeError) throw new Error(runtimeError);
      const report = await page.evaluate('window.__GEO_REPORT');
      if (!report) throw new Error('no __GEO_REPORT');
      fs.writeFileSync(path.join(OUT, `${id}.json`), `${JSON.stringify(report, null, 1)}\n`);
      rows.push(report);
      const c = report.components;
      console.log(`[geo ${String(rows.length).padStart(2)}] ${id.padEnd(20)} min ${String(report.geoMin).padStart(5)}/${report.requiredMinimum ?? 90} ` +
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

// --ids runs MERGE into the fleet ledger (never shrink it to the subset)
const ledgerPath = path.join(OUT, 'ledger.json');
const byId = new Map();
if (requested && fs.existsSync(ledgerPath)) {
  try {
    for (const r of JSON.parse(fs.readFileSync(ledgerPath, 'utf8')).rows || []) byId.set(r.id, r);
  } catch { /* corrupted ledger rebuilds from this run */ }
}
for (const r of rows) byId.set(r.id, {
  id: r.id, geoMin: r.geoMin, requiredMinimum: r.requiredMinimum ?? 90,
  qualityBar: r.qualityBar || 'fleet', gatePassed: r.gatePassed, components: r.components,
  ...(r.comparisonPurpose ? { comparisonPurpose:r.comparisonPurpose } : {}),
  ...(r.preservationBaseline ? { preservationBaseline:r.preservationBaseline } : {}),
});
const all = [...byId.values()].sort((a, b) => a.geoMin - b.geoMin);
const passed = all.filter((r) => r.gatePassed).length;
// A requested set can legitimately contain only first-party/procedural tanks.
// Do not churn the ledger timestamp when no comparison row was evaluated.
if (rows.length) {
  fs.writeFileSync(ledgerPath, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    gate: 'every component >= its registered floor (90 fleet / 92 exemplar / 99 historical preservation); min is the headline; preservation is not source fidelity',
    passed, total: all.length, rows: all,
  }, null, 1)}\n`);
}
const runSorted = rows.slice().sort((a, b) => a.geoMin - b.geoMin);
const runPassed = rows.filter((r) => r.gatePassed).length;
const runSummary = runSorted.length
  ? `worst ${runSorted[0].id} (${runSorted[0].geoMin})`
  : 'no registered comparison rows requested';
console.log(`\ngeometry-gate: ${runPassed}/${rows.length} pass this run (fleet ${passed}/${all.length}); ${runSummary}`);
if (CHECK && runPassed < rows.length) process.exitCode = 1;
