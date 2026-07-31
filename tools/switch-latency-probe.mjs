// tools/switch-latency-probe.mjs — garage tank-switch latency (switching r1).
//
// Measures the user-perceived carousel swap: garage.setSelected(id) → the
// selected hero VISIBLY on the pedestal (pedestalVisual.specId === id and its
// root not hidden — setPedestalTank hides GLB heroes until their swap lands,
// so "visible" is exactly the moment the player sees the new tank).
//
// Measurement is EXTERNAL (an 8 ms page-side poll around __DEBUG state), so
// the same probe runs against any build — including trees that predate the
// in-page window.__SWITCH_TIMINGS instrumentation. When that log exists it is
// printed too, as a cross-check.
//
// Sequence: 10 switches — cold GLB (m1a1 variant kit, merkava4, kv2, leo2a6),
// cold procedurals (tiger1, t90m), and warm revisits (m1a1, merkava4, tiger1,
// m1a2) that exercise the pedestal LRU. Reports per-switch ms + median/p95.
//
// Usage: node tools/switch-latency-probe.mjs [--root <dir>] [--dwell 500]

import { createServer } from 'vite';
import puppeteer from 'puppeteer';

const args = process.argv.slice(2);
function opt(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
}
const root = opt('root', process.cwd());
const dwellMs = parseInt(opt('dwell', '500'), 10);

const SEQUENCE = [
  'm1a1', 'merkava4', 'tiger1',          // cold: GLB, GLB, procedural
  'm1a1', 'merkava4',                    // warm revisits (LRU hits)
  't90m', 'kv2', 'tiger1',               // cold proc, cold community GLB, warm proc
  'm1a2', 'leo2a6',                      // warm boot hero, cold GLB
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = await createServer({
  root,
  logLevel: 'error',
  server: { port: 7400 + Math.floor(Math.random() * 400), strictPort: false, hmr: false, watch: null },
});
await server.listen();
const url = `http://localhost:${server.config.server.port}/`;
console.log(`[switch-probe] vite up at ${url} (root ${root})`);

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('favicon')) pageErrors.push(m.text());
});

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });

// Boot hero settle: the initial m1a2 GLB swap must be on stage before the
// clock starts, or switch #1 inherits boot work.
await page.waitForFunction(() => {
  const D = window.__DEBUG;
  const v = D && D.pedestalVisual;
  const s = window.__GLB_STATS;
  return !!(v && v.specId === 'm1a2' && v.root.visible !== false && (!s || s.settled >= s.started));
}, { timeout: 60000, polling: 100 });
// Post-ready dwell: idle bakes + (when present) neighbor prefetch — part of
// the system under test; identical dwell for baseline and candidate runs.
await sleep(3500);

const rows = [];
for (const id of SEQUENCE) {
  const row = await page.evaluate(async (specId) => {
    const D = window.__DEBUG;
    if (!D || !D.selectGarageTank) return { id: specId, ms: -2 };
    const t0 = performance.now();
    D.selectGarageTank(specId);
    return await new Promise((res) => {
      const check = () => {
        const v = D.pedestalVisual;
        if (v && v.specId === specId && v.root.visible !== false) {
          res({ id: specId, ms: Math.round(performance.now() - t0) });
          return true;
        }
        return false;
      };
      if (check()) return;
      const iv = setInterval(() => { if (check()) clearInterval(iv); }, 8);
      setTimeout(() => { clearInterval(iv); res({ id: specId, ms: -1 }); }, 20000);
    });
  }, id);
  rows.push(row);
  console.log(`  switch ${String(rows.length).padStart(2)}: ${row.id.padEnd(10)} ${row.ms} ms`);
  await sleep(dwellMs);
}

const timings = await page.evaluate(() => window.__SWITCH_TIMINGS || null);
if (timings) {
  console.log('[switch-probe] in-page __SWITCH_TIMINGS cross-check:');
  for (const t of timings) console.log(`    ${t.id.padEnd(10)} ${String(t.ms).padStart(5)} ms  (${t.path})`);
}

const ok = rows.filter((r) => r.ms >= 0).map((r) => r.ms).sort((a, b) => a - b);
const pct = (p) => ok.length ? ok[Math.min(ok.length - 1, Math.floor((p / 100) * ok.length))] : -1;
const median = ok.length ? ok[Math.floor(ok.length / 2)] : -1;
console.log(`[switch-probe] n=${ok.length}/${rows.length} median=${median}ms p95=${pct(95)}ms max=${ok[ok.length - 1]}ms`);
if (pageErrors.length) {
  console.error(`[switch-probe] PAGE ERRORS (${pageErrors.length}):`);
  for (const e of pageErrors.slice(0, 5)) console.error('  - ' + e);
}

await browser.close();
await server.close();
process.exit(rows.some((r) => r.ms < 0) || pageErrors.length ? 1 : 0);
