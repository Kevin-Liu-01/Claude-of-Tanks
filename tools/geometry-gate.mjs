import {assertNoPhotoOverride} from './photo-reference-policy.mjs';
import { uniqueIds } from './id-list.mjs';
import {validateSelectedIds} from './first-party-concept-policy.mjs';
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
// Usage: node tools/geometry-gate.mjs [--ids=a,b] [--check] [--repin] [--absent=skip] [--skipped=<file>] [--oracles-only]
//   [--prune] [--registry=<file>]
// --repin (npm run gate:repin): a requested registered id whose oracle file is missing stops the run before anything is
// measured or written, instead of recording an unavailable row over its measured one; an id the page cannot measure
// keeps its previous ledger row, marked with the error as repinError.
// --absent=skip (the changed-only gate step, 267): a registered id whose oracle file is missing here is skipped, its record
// and ledger row untouched, never thrown on or recorded as unavailable. --skipped=<file> writes { id: reason } for every
// requested registered id the run did not measure (an absent oracle, or a page error that kept its previous row), so the
// changed-only chain leaves them due. Every record names its oracle: { path, sha256 }, the registry's path as the page
// fetches it and the sha256 of that file's bytes (the gate step's per-id input). --oracles-only measures nothing and
// writes that field into each requested (or every) id's existing record where the oracle file is here.
// Oracle pins (Main 2026-11-01, 267): an oracle whose bytes do not match its pin in tools/oracle-pins.mjs is a different
// version: the gate refuses it before loading the page, naming the pinned sha256 (under --repin the row is kept, marked
// repinError, and --skipped names it), so no record is ever measured on an unverified file.
// Roster (267): the ledger keeps rows only for the fleet's ids (the page's playable roster); a run that writes it drops
// any other row and that id's record. --prune does only that, measuring nothing. --registry=<file> writes the page's
// registry ({ referenceSources: id -> path, playable }) and exits.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';
import { eachBrowserChunk } from './browser-id-chunks.mjs';
import { withIsolatedCaptureBrowser } from './isolated-capture-browser.mjs';
import { boundOrigin, loadReadyPage, pageLoadBudget, toolServerOptions } from './tool-page-load.mjs';
import { mergeLedgerRow, missingOraclesError, oraclePinError, rosterLedgerRows, unavailableOracleReport } from './geometry-gate-policy.mjs';
import { ORACLE_PINS } from './oracle-pins.mjs';
import { TANK_IDS } from '../src/vehicles/tankIdAliases.ts';
import { OWNER_KIT_TARGETS } from './owner-kit-targets.mjs';
import { servedPublicOnly } from './served-public.mjs';
import { GATE_PAGE_PUBLIC } from './gate-page-public.mjs';

const ROOT = process.cwd();
const args = process.argv.slice(2);
const eq = args.find((a) => a.startsWith('--ids='));
const requested = eq ? uniqueIds(eq.slice(6).split(',').map((s) => s.trim()).filter(Boolean), 'geometry-gate --ids') : null;
const CHECK = args.includes('--check');
const REPIN = args.includes('--repin');
const ABSENT_SKIP = args.includes('--absent=skip');
const SKIPPED_FILE = args.find((a) => a.startsWith('--skipped='))?.slice(10) ?? null;
const ORACLES_ONLY = args.includes('--oracles-only');
const PRUNE_ONLY = args.includes('--prune');
const REGISTRY_FILE = args.find((a) => a.startsWith('--registry='))?.slice(11) ?? null;
let playableIds = null;
/** id -> why this run did not measure it (--skipped). */
const skipped = {};
const OUT = path.join(ROOT, 'docs', 'geometry-gate');
fs.mkdirSync(OUT, { recursive: true });

const rows = [];
const publicRoot = path.resolve(ROOT, 'public');
const localAssetPath = (assetPath) => {
  if (typeof assetPath !== 'string' || !assetPath.startsWith('/')) return null;
  const resolved = path.resolve(publicRoot, assetPath.slice(1));
  return resolved.startsWith(`${publicRoot}${path.sep}`) ? resolved : null;
};
/** The oracle a record names: the registry's path as the page fetches it and the sha256 of the file's bytes. */
const oracleOf = (assetPath) => ({ path: assetPath, sha256: crypto.createHash('sha256').update(fs.readFileSync(localAssetPath(assetPath))).digest('hex') });
let referenceSourceOf = {};
function selectedReferenceIds(referenceIds,referenceSources,referenceQualityBars) {
  const registered = new Set(referenceIds);
  assertNoPhotoOverride(requested??[],registered);
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
      console.log(`[geo] skipped ${firstPartyOnly.length} first-party-only vehicles without comparison registrations` +
        ` (${firstPartyOnly.join(', ')})`);
    }
    if (unavailable.length && ABSENT_SKIP) {
      for (const id of unavailable) {
        skipped[id] = `oracle absent here (${referenceSources[id]})`;
        console.log(`[geo] ${id}: ${skipped[id]}`);
      }
    } else if (unavailable.length && REPIN) throw missingOraclesError(unavailable, referenceSources);
    else if (unavailable.length) {
      for (const id of unavailable) {
        const qualityBar = referenceQualityBars[id] || 'fleet';
        const report = unavailableOracleReport(id, qualityBar);
        rows.push(report);
        console.error(`[geo] ${id}: registered ${qualityBar} comparison oracle unavailable (requires ${report.requiredMinimum})`);
      }
    }
  } else if (available.size < registered.size) {
    console.log(`[geo] skipped ${registered.size - available.size} optional comparison oracles unavailable in this worktree`);
    // a whole-fleet --skipped run names them too, so nothing it did not measure reads as current
    for (const id of referenceIds) if (!available.has(id)) skipped[id] = `oracle absent here (${referenceSources[id]})`;
  }
  return ids;
}

// One Vite server and browser, its page on the registry: the discovery below, then one per chunk of ids
// (tools/browser-id-chunks.mjs).
/** Public files a page of this run loaded outside the gate step's key (267): any one fails the run. */
const refusedPublic = [];
async function withRegistryPage(run, dependencies = {}) {
  // 267: the requested ids' registered oracles (none before discovery, which loads no oracle) and GATE_PAGE_PUBLIC
  const oracles = Object.entries(referenceSourceOf).filter(([id, file]) => file && (!requested || requested.includes(id))).map(([, file]) => file);
  return await withIsolatedCaptureBrowser({
    root: ROOT,
    logLevel: 'error',
    // R4c (2026-10-16): 127.0.0.1 and the address really bound, never `localhost` (an IPv6 bind can leave 127.0.0.1 to another server)
    server: toolServerOptions(7400),
    // 267: only the public files the gate step keys (tools/served-public.mjs); any other is refused and fails the run
    plugins: [servedPublicOnly({ dirs: GATE_PAGE_PUBLIC.dirs, files: [...GATE_PAGE_PUBLIC.files, ...oracles] }, (file) => {
      refusedPublic.push(file);
      console.error(`[geo] refused ${file}: not an input of the gate step's key (tools/gate-page-public.mjs)`);
    })],
  }, {
    headless: 'new',
    args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
  }, async ({ server, browser }) => {
    const page = await browser.newPage();
    // Startup import/runtime failures must remain visible instead of appearing
    // only as an unexplained registry timeout during an authored-fleet audit.
    page.on('pageerror', error => console.error(`[geo browser] ${String(error)}`));
    page.on('console', message => {
      if (message.type() === 'error' && !message.text().includes('favicon'))
        console.error(`[geo console] ${message.text()}`);
    });
    page.setDefaultTimeout(150000);
    const origin = boundOrigin(server);
    // Discover eligible IDs without loading an optional local comparison file.
    // Worktrees intentionally omit quarantined GLBs, so registry discovery must
    // not depend on any one source asset being present.
    // 180 s for the first navigation, 150 s for the registry, one retry of a load that timed out (R4c)
    await loadReadyPage(page, `${origin}/tools/procedural-fidelity.html?id=m1a1_abrams_hc&registry=1`, { label: 'geo',
      ready: 'Array.isArray(window.__REFERENCE_IDS)', budget: pageLoadBudget({ readyTimeoutMs: 150000 }) });
    return run({ page, origin });
  }, dependencies);
}

const ids = await withRegistryPage(async ({ page }) => {
  const referenceIds = await page.evaluate('window.__REFERENCE_IDS');
  if(requested)validateSelectedIds(requested,await page.evaluate('window.__PLAYABLE_IDS'));
  const referenceSources = await page.evaluate('window.__REFERENCE_SOURCES');
  const referenceQualityBars = await page.evaluate('window.__REFERENCE_QUALITY_BARS');
  referenceSourceOf = referenceSources;
  playableIds = await page.evaluate('window.__PLAYABLE_IDS');
  if (REGISTRY_FILE) {
    fs.writeFileSync(REGISTRY_FILE, `${JSON.stringify({ referenceSources, playable: [...playableIds].sort() }, null, 1)}\n`);
    return [];
  }
  return PRUNE_ONLY ? [] : selectedReferenceIds(referenceIds,referenceSources,referenceQualityBars);
});
if (REGISTRY_FILE) { console.log(`geometry-gate --registry: wrote ${REGISTRY_FILE}`); process.exit(0); }
if (ORACLES_ONLY) {
  // the gate step's per-id input on the records already measured: no page, no measurement (267 backfill)
  let named = 0;
  for (const id of ids) {
    const file = path.join(OUT, `${id}.json`);
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, 'utf8'), record = JSON.parse(text);
    const next = `${JSON.stringify({ ...record, oracle: oracleOf(referenceSourceOf[id]) }, null, 1)}\n`;
    if (next !== text) { fs.writeFileSync(file, next); named++; }
  }
  console.log(`geometry-gate --oracles-only: ${named} record(s) name their oracle (${ids.length} id(s) with an oracle here)`);
  process.exit(0);
}
await eachBrowserChunk('tools/geometry-gate.mjs', ids, (chunk, { launch }) => withRegistryPage(async ({ page, origin }) => {
  const urlFor = (id) => `${origin}/tools/procedural-fidelity.html?id=${encodeURIComponent(id)}&geo=1`;
  for (const id of chunk) {
    try {
      const oracle = oracleOf(referenceSourceOf[id]);
      const pinError = oraclePinError(oracle.path, oracle.sha256, ORACLE_PINS);
      if (pinError) throw new Error(pinError);
      let rawSourceComparison=null;
      if(id==='k1a1' || OWNER_KIT_TARGETS[id]){
        await page.goto(`${urlFor(id)}&comparison=raw-source`,{waitUntil:'domcontentloaded'});
        await page.waitForFunction('window.__FIDELITY_READY === true || typeof window.__FIDELITY_ERROR === "string"',{polling:60});
        const rawError=await page.evaluate('window.__FIDELITY_ERROR');if(rawError)throw new Error(rawError);
        const raw=await page.evaluate('window.__GEO_REPORT');if(!raw)throw new Error('raw source comparison unavailable');
        const file=`${id}.raw-source.json`;fs.writeFileSync(path.join(OUT,file),`${JSON.stringify(raw,null,1)}\n`);
        rawSourceComparison={file,gatePassed:raw.gatePassed,rawGeoMin:raw.rawGeoMin,scope:id==='k1a1'
          ? 'Full armed vehicle against unchanged unarmed source; retained diagnostic, not owner-selected composite target'
          : 'Full vehicle with its owner-directed kit against the print; retained diagnostic, not the owner-selected target'};
      }
      await page.goto(urlFor(id), { waitUntil: 'domcontentloaded' });
      await page.waitForFunction('window.__FIDELITY_READY === true || typeof window.__FIDELITY_ERROR === "string"', { polling: 60 });
      const runtimeError = await page.evaluate('window.__FIDELITY_ERROR');
      if (runtimeError) throw new Error(runtimeError);
      const report = await page.evaluate('window.__GEO_REPORT');
      if (!report) throw new Error('no __GEO_REPORT');
      if(rawSourceComparison)report.rawSourceComparison=rawSourceComparison;
      report.oracle = oracle;
      fs.writeFileSync(path.join(OUT, `${id}.json`), `${JSON.stringify(report, null, 1)}\n`);
      rows.push(report);
      const c = report.components;
      console.log(`[geo ${String(rows.length).padStart(2)}] ${id.padEnd(20)} min ${String(report.geoMin).padStart(5)}/${report.requiredMinimum ?? 90} ` +
        `| hull ${c.hullCurves} whole ${c.wholeCurves} turret ${c.turretCurves} ` +
        `stations ${c.stations} dims ${c.dims} floaters ${c.floaters} ${report.gatePassed ? 'PASS' : ''}`);
    } catch (error) {
      rows.push({ id, geoMin: 0, gatePassed: false, error: String(error.message) });
      if (REPIN) skipped[id] = `page error, previous row kept: ${error.message}`;
      console.error(`[geo] ${id}: ${error.message}`);
    }
  }
}, { launchBrowser: (options) => launch(puppeteer, options) }));

// --ids runs MERGE into the fleet ledger (never shrink it to the subset)
const ledgerPath = path.join(OUT, 'ledger.json');
const byId = new Map();
if ((requested || PRUNE_ONLY) && fs.existsSync(ledgerPath)) {
  try {
    // A row under an id the tank id alias layer renamed carries over to the new id (SSOT 2.19).
    for (const r of JSON.parse(fs.readFileSync(ledgerPath, 'utf8')).rows || []) {
      const id = TANK_IDS.isRetired(r.id) ? TANK_IDS.resolveIncoming(r.id) : r.id;
      byId.set(id, { ...r, id });
    }
  } catch { /* corrupted ledger rebuilds from this run */ }
}
for (const r of rows) mergeLedgerRow(byId, r, { repin: REPIN });
// rows (and records) of ids the fleet no longer has go: a retired or renamed-away id's row is a stale pin
const { kept, pruned } = rosterLedgerRows([...byId.values()], playableIds ?? []);
for (const id of pruned) {
  for (const file of [`${id}.json`, `${id}.raw-source.json`]) if (fs.existsSync(path.join(OUT, file))) fs.rmSync(path.join(OUT, file));
}
if (pruned.length) console.log(`[geo] pruned ${pruned.length} ledger row(s) of ids not in the roster: ${pruned.join(', ')}`);
const all = kept.sort((a, b) => a.geoMin - b.geoMin);
const passed = all.filter((r) => r.gatePassed).length;
// A requested set can legitimately contain only first-party/procedural tanks.
// Do not churn the ledger timestamp when no comparison row was evaluated.
// A rerun that changes no row keeps the file byte-identical (2026-10-16): a fresh timestamp alone used to invalidate every
// receipt that hashes docs/ (573 in 226).
if (rows.length || pruned.length) {
  const body = {
    gate: 'every component >= its registered floor (90 fleet / 92 exemplar / 99 historical preservation); min is the headline; preservation is not source fidelity',
    passed, total: all.length, rows: all,
  };
  let previous = null;
  try { previous = JSON.parse(fs.readFileSync(ledgerPath, 'utf8')); } catch { /* first run */ }
  const unchanged = previous && (({ generatedAt, ...rest }) => JSON.stringify(rest))(previous) === JSON.stringify(body);
  if (!unchanged) fs.writeFileSync(ledgerPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), ...body }, null, 1)}\n`);
}
const runSorted = rows.slice().sort((a, b) => a.geoMin - b.geoMin);
const runPassed = rows.filter((r) => r.gatePassed).length;
const runSummary = runSorted.length
  ? `worst ${runSorted[0].id} (${runSorted[0].geoMin})`
  : 'no registered comparison rows requested';
console.log(`\ngeometry-gate: ${runPassed}/${rows.length} pass this run (fleet ${passed}/${all.length}); ${runSummary}`);
const notRepinned = REPIN ? rows.filter((r) => r.error && !r.components).map((r) => r.id) : [];
if (notRepinned.length) console.log(`[geo] not re-pinned (page errors above); their previous rows are kept, marked repinError: ${notRepinned.join(', ')}`);
if (SKIPPED_FILE) fs.writeFileSync(SKIPPED_FILE, `${JSON.stringify(skipped, null, 1)}\n`);
if (Object.keys(skipped).length) console.log(`[geo] skipped: ${Object.keys(skipped).join(', ')}`);
if (CHECK && runPassed < rows.length) process.exitCode = 1;
if (refusedPublic.length) {
  console.error(`[geo] FAIL: the page loaded ${refusedPublic.length} public file(s) outside the gate step's key: ${[...new Set(refusedPublic)].join(', ')}`);
  process.exitCode = 1;
}
