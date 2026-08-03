// VISUAL EVALUATOR driver (owner directive 2026-08-03: "strong visual
// evaluators … correct angles … exact geometries … rounded structures").
// Runs tools/visual-evaluator-page.html at the OFFICIAL critic camera set and
// writes NUMBERS for the claims critics used to eyeball:
//   edge angles (Δ>1.5° flagged, world coords) · circular-arc fits
//   (radius/span/residual + 'reads polygonal: N facets') · per-column
//   top/bottom profile deltas in world meters · rig-parity yaw-proxy check.
// Usage:
//   node tools/visual-evaluator.mjs --id=<id> [--views=left,front,...]
//   node tools/visual-evaluator.mjs --selftest      (known-geometry calibration)
// Output: shots/visual-eval-<id>/report.json + one annotated overlay PNG per
// view + stdout digest (one line per finding).
// Exit codes: 0 ok · 2 RIG MISMATCH (abort scoring, fix registration first)
// · 1 harness error. Own vite on 74xx (never 5001/5002); cot-shots FIFO
// ticket lock shared with the other capture harnesses (BUILD-STANDARD §F).
import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { mkdirSync, rmdirSync, statSync, writeFileSync, readdirSync, unlinkSync, utimesSync } from 'node:fs';
import { resolve, join } from 'node:path';

const LOCK_DIR = '/tmp/cot-shots.lock';
const QUEUE_DIR = '/tmp/cot-shots.queue';
const LOCK_STALE_MS = 5 * 60 * 1000;
const TICKET_STALE_MS = 60 * 60 * 1000;
let lockHeld = false;
function ticketPid(name) { const m = name.match(/-(\d+)\.t$/); return m ? parseInt(m[1], 10) : -1; }
function ticketAlive(name) {
  const pid = ticketPid(name);
  if (pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (err) { return err.code === 'EPERM'; }
}
async function acquireLock(timeoutMs) {
  mkdirSync(QUEUE_DIR, { recursive: true });
  const myTicket = `${String(Date.now()).padStart(15, '0')}-${process.pid}.t`;
  writeFileSync(join(QUEUE_DIR, myTicket), String(process.pid));
  const t0 = Date.now();
  try {
    for (;;) {
      let head = null;
      let names = [];
      try { names = readdirSync(QUEUE_DIR).filter((n) => n.endsWith('.t')).sort(); } catch (_) { names = [myTicket]; }
      for (const n of names) {
        if (n === myTicket) { head = head || n; break; }
        let stale = false;
        try { stale = Date.now() - statSync(join(QUEUE_DIR, n)).mtimeMs > TICKET_STALE_MS; } catch (_) { continue; }
        if (stale || !ticketAlive(n)) { try { unlinkSync(join(QUEUE_DIR, n)); } catch (_) { /* raced */ } continue; }
        head = n; break;
      }
      if (head === myTicket) {
        try { mkdirSync(LOCK_DIR); lockHeld = true; return; } catch (_) { /* held */ }
        try {
          if (Date.now() - statSync(LOCK_DIR).mtimeMs > LOCK_STALE_MS) { rmdirSync(LOCK_DIR); continue; }
        } catch (_) { continue; }
      }
      if (Date.now() - t0 > timeoutMs) throw new Error('cot-shots lock timeout');
      await new Promise((r) => setTimeout(r, head === myTicket ? 300 : 1000));
    }
  } finally {
    try { unlinkSync(join(QUEUE_DIR, myTicket)); } catch (_) { /* fine */ }
  }
}
function releaseLock() { if (!lockHeld) return; lockHeld = false; try { rmdirSync(LOCK_DIR); } catch (_) { /* fine */ } }
await acquireLock(30 * 60 * 1000);
process.on('exit', releaseLock);
const refresher = setInterval(() => { try { const now = new Date(); utimesSync(LOCK_DIR, now, now); } catch (_) { /* fine */ } }, 60 * 1000);
refresher.unref();

const argOf = (k) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };
const SELFTEST = process.argv.includes('--selftest');
const TANK_ID = SELFTEST ? 'selftest' : (argOf('id') || null);
if (!TANK_ID) { console.error('usage: node tools/visual-evaluator.mjs --id=<id> [--views=a,b,...] | --selftest'); process.exit(1); }
const VIEWS = argOf('views');
const OUT = resolve(`shots/visual-eval-${TANK_ID}`);
mkdirSync(OUT, { recursive: true });

const t0 = Date.now();
const server = await createServer({
  root: process.cwd(),
  logLevel: 'error',
  server: { port: 7455 + Math.floor(Math.random() * 40), strictPort: false, hmr: false, watch: { ignored: ['**/*'] } },
});
await server.listen();
const port = server.config.server.port;
console.log(`[visual-eval] vite up on :${port}`);

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
const consoleErrors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error' && !msg.text().includes('favicon')) consoleErrors.push(msg.text());
});
page.on('pageerror', (err) => consoleErrors.push(String(err)));
const badUrls = [];
page.on('response', (resp) => {
  if (resp.status() >= 400) {
    badUrls.push(resp.url());
    console.log(`[visual-eval] HTTP ${resp.status()} ${resp.url()}`);
  }
});

let exitCode = 0;
try {
  await page.setViewport({ width: 1400, height: 900, deviceScaleFactor: 1 });
  const q = new URLSearchParams();
  if (SELFTEST) q.set('selftest', '1'); else q.set('id', TANK_ID);
  if (VIEWS) q.set('views', VIEWS);
  await page.goto(`http://localhost:${port}/tools/visual-evaluator-page.html?${q}`,
    { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction('window.__EVAL_READY === true || window.__EVAL_ERROR !== undefined',
    { timeout: 300000, polling: 500 });
  const pageError = await page.evaluate('window.__EVAL_ERROR');
  if (pageError) throw new Error(`page error: ${pageError}`);
  const report = await page.evaluate('window.__EVAL_RESULT');
  const overlays = await page.evaluate('window.__EVAL_OVERLAYS');
  report.generatedAt = new Date().toISOString();
  report.elapsedS = Number(((Date.now() - t0) / 1000).toFixed(1));
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 1));
  for (const [name, dataUrl] of Object.entries(overlays)) {
    writeFileSync(join(OUT, `${name}.png`), Buffer.from(dataUrl.split(',')[1], 'base64'));
  }
  console.log(`[visual-eval] ${TANK_ID}: ${Object.keys(report.views).length} views -> ${OUT} (${report.elapsedS}s)`);
  console.log('[visual-eval] ---- digest ----');
  for (const line of report.digest) console.log('  ' + line);
  if (report.rigParity.verdict !== 'OK') {
    console.log(`[visual-eval] ${report.rigParity.verdict}`);
    exitCode = 2;
  }
  const realErrors = consoleErrors.filter((e) =>
    !(e.includes('Failed to load resource') && badUrls.length > 0 && badUrls.every((u) => u.endsWith('/favicon.ico'))));
  if (realErrors.length) {
    console.log(`[visual-eval] CONSOLE ERRORS (${realErrors.length}):`);
    for (const e of realErrors) console.log('  ' + e);
    exitCode = exitCode || 1;
  }
} catch (err) {
  exitCode = 1;
  console.error('[visual-eval] FAILED:', err);
} finally {
  await browser.close();
  await server.close();
  releaseLock();
}
process.exit(exitCode);
