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
// Sequence: 10 switches — representative cold and warm modern/WW2 swaps,
// including m1a1, leclerc, kv2 and leo2a6, plus warm revisits that exercise
// the pedestal LRU. Reports per-switch ms + median/p95.
//
// Usage: node tools/switch-latency-probe.mjs [--root <dir>] [--dwell 500]
//        [--cpu 4] [--cores 4] [--memory 4] [--tier desktop|mobile]

import { createServer } from 'vite';
import puppeteer from 'puppeteer';

const args = process.argv.slice(2);
function opt(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
}
const root = opt('root', process.cwd());
const dwellMs = parseInt(opt('dwell', '500'), 10);
const cpuRate = Math.max(1, Number(opt('cpu', '1')) || 1);
const cores = Math.max(0, Number(opt('cores', '0')) || 0);
const memoryGB = Math.max(0, Number(opt('memory', '0')) || 0);
const deviceTier = opt('tier', 'desktop');
const limitMs = Math.max(1, Number(opt('limit', '5000')) || 5000);
const profileTarget = opt('profile', '');
const sequenceOption = opt('sequence', '');
const screenshotPath = opt('screenshot', '');

const DEFAULT_SEQUENCE = [
  'm1a1', 'leclerc', 'tiger1',           // cold representatives
  'm1a1', 'leclerc',                     // warm revisits (LRU hits)
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
const cdp = await page.createCDPSession();
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
if (cores || memoryGB) {
  await page.evaluateOnNewDocument((reportedCores, reportedMemory) => {
    if (reportedCores) Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', {
      configurable: true, get: () => reportedCores,
    });
    if (reportedMemory) Object.defineProperty(Navigator.prototype, 'deviceMemory', {
      configurable: true, get: () => reportedMemory,
    });
  }, cores, memoryGB);
}
if (cpuRate > 1) {
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuRate });
}
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('favicon')) pageErrors.push(m.text());
});

await page.goto(`${url}?nosplash=1&tier=${deviceTier}&gfxreset=1`, {
  waitUntil: 'domcontentloaded', timeout: 120000,
});
await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });

// Boot hero settle: follow the catalog's actual default instead of pinning a
// stale historical model id. This fleet is first-party/procedural now, so GLB
// queue counters are intentionally not part of the readiness contract.
await page.waitForFunction(() => {
  const D = window.__DEBUG;
  const v = D && D.pedestalVisual;
  return !!(v && v.specId === D.selectedSpecId && v.root.visible !== false);
}, { timeout: 60000, polling: 100 });
// Post-ready dwell: idle bakes + (when present) neighbor prefetch — part of
// the system under test; identical dwell for baseline and candidate runs.
await page.evaluate(() => window.__DEV_TRACE?.clear());
await sleep(3500);
const idleWarmStats = await page.evaluate(() => window.__DEV_TRACE?.stats() || null);
await page.evaluate(() => window.__DEV_TRACE?.clear());

let sequence = sequenceOption
  ? sequenceOption.split(',').map((id) => id.trim()).filter(Boolean)
  : DEFAULT_SEQUENCE;
if (sequenceOption === 'neighbors') {
  sequence = await page.evaluate(() => {
    const D = window.__DEBUG;
    const selected = D.selectedSpecId;
    const neighbors = D.garage.getNeighborIds(2);
    return [...neighbors, selected, ...neighbors.slice(0, 2)];
  });
}

const rows = [];
let capturedProfile = null;
for (const id of sequence) {
  const captureThisSwitch = profileTarget === id && capturedProfile === null;
  if (captureThisSwitch) {
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
    await cdp.send('Profiler.start');
  }
  const row = await page.evaluate(async (specId) => {
    const D = window.__DEBUG;
    if (!D || (!D.stagePedestalTank && !D.selectGarageTank)) return { id: specId, ms: -2 };
    // Reproduce the pointer activity preceding a real card click so optional
    // background map streaming yields to the interaction under test.
    window.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    const t0 = performance.now();
    // stagePedestalTank bypasses the currently visible nation rail while
    // preserving the exact production pedestal pipeline. The old direct UI
    // call silently rejected cross-nation representatives (for example
    // Tiger I while the US rail was active), creating two 20 s false timeouts.
    (D.stagePedestalTank || D.selectGarageTank)(specId);
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
  if (captureThisSwitch) {
    ({ profile: capturedProfile } = await cdp.send('Profiler.stop'));
    await cdp.send('Profiler.disable');
  }
  rows.push(row);
  console.log(`  switch ${String(rows.length).padStart(2)}: ${row.id.padEnd(10)} ${row.ms} ms`);
  await sleep(dwellMs);
}

if (capturedProfile) {
  const nodes = new Map(capturedProfile.nodes.map((node) => [node.id, node]));
  const selfUs = new Map();
  for (let index = 0; index < (capturedProfile.samples?.length || 0); index++) {
    const nodeId = capturedProfile.samples[index];
    selfUs.set(nodeId, (selfUs.get(nodeId) || 0) + (capturedProfile.timeDeltas?.[index] || 0));
  }
  const hot = [...selfUs.entries()]
    .map(([nodeId, us]) => ({ node: nodes.get(nodeId), us }))
    .filter(({ node }) => node?.callFrame)
    .sort((a, b) => b.us - a.us)
    .slice(0, 30);
  console.log(`[switch-probe] CPU profile for first cold ${profileTarget} switch (self time):`);
  for (const { node, us } of hot) {
    const frame = node.callFrame;
    const fn = frame.functionName || '(anonymous)';
    const source = frame.url ? `${frame.url.split('/').pop()}:${frame.lineNumber + 1}` : '(runtime)';
    console.log(`    ${(us / 1000).toFixed(1).padStart(8)} ms  ${fn}  ${source}`);
  }
}

const timings = await page.evaluate(() => window.__SWITCH_TIMINGS || null);
if (timings) {
  console.log('[switch-probe] in-page __SWITCH_TIMINGS cross-check:');
  for (const t of timings) {
    const phases = t.path === 'procedural'
      ? ` bake=${t.prebakeMs ?? '-'} build=${t.buildMs ?? '-'} compile=${t.compileMs ?? '-'}`
      : '';
    console.log(`    ${t.id.padEnd(10)} ${String(t.ms).padStart(5)} ms  (${t.path}${phases})`);
  }
}

const ok = rows.filter((r) => r.ms >= 0).map((r) => r.ms).sort((a, b) => a - b);
const pct = (p) => ok.length ? ok[Math.min(ok.length - 1, Math.floor((p / 100) * ok.length))] : -1;
const median = ok.length ? ok[Math.floor(ok.length / 2)] : -1;
const withinBudget = rows.every((row) => row.ms >= 0 && row.ms < limitMs);
console.log(`[switch-probe] n=${ok.length}/${rows.length} median=${median}ms p95=${pct(95)}ms max=${ok[ok.length - 1]}ms budget=<${limitMs}ms ${withinBudget ? 'PASS' : 'FAIL'}`);
const traceStats = await page.evaluate(() => window.__DEV_TRACE?.stats() || null);
if (traceStats) {
  console.log(`[switch-probe] frames p95=${traceStats.gapP95}ms p99=${traceStats.gapP99}ms max=${traceStats.maxGapMs}ms longTasks=${traceStats.longTasks} freezes=${traceStats.freezes}`);
}
if (idleWarmStats) {
  console.log(`[switch-probe] idle prefetch frames p95=${idleWarmStats.gapP95}ms p99=${idleWarmStats.gapP99}ms max=${idleWarmStats.maxGapMs}ms longTasks=${idleWarmStats.longTasks} freezes=${idleWarmStats.freezes}`);
}
if (pageErrors.length) {
  console.error(`[switch-probe] PAGE ERRORS (${pageErrors.length}):`);
  for (const e of pageErrors.slice(0, 5)) console.error('  - ' + e);
}
if (screenshotPath) {
  await page.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`[switch-probe] screenshot ${screenshotPath}`);
}

await browser.close();
await server.close();
process.exit(!withinBudget || pageErrors.length ? 1 : 0);
