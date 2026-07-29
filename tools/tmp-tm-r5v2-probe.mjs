// tools/tmp-tm-r5v2-probe.mjs — tank_models r5v2 runner for tmp-tm-r5v2-probe.html
// Usage: node tools/tmp-tm-r5v2-probe.mjs --ids tiger1,t14 --out shots/tm_r5v2
//        [--angles front,rear,side] [--dist 0]
import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { mkdirSync, rmdirSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const LOCK_DIR = '/tmp/cot-shots.lock';
const LOCK_STALE_MS = 5 * 60 * 1000;
let lockHeld = false;
async function acquireLock() {
  const t0 = Date.now();
  for (;;) {
    try { mkdirSync(LOCK_DIR); lockHeld = true; return; } catch (_) { /* held */ }
    try {
      if (Date.now() - statSync(LOCK_DIR).mtimeMs > LOCK_STALE_MS) { rmdirSync(LOCK_DIR); continue; }
    } catch (_) { continue; }
    if (Date.now() - t0 > 10 * 60 * 1000) throw new Error('cot-shots lock timeout');
    await new Promise((r) => setTimeout(r, 2000 + Math.random() * 1000));
  }
}
function releaseLock() {
  if (!lockHeld) return;
  lockHeld = false;
  try { rmdirSync(LOCK_DIR); } catch (_) { /* fine */ }
}
await acquireLock();
process.on('exit', releaseLock);

const args = process.argv.slice(2);
const opt = (name, fb) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fb; };
const outDir = resolve(opt('out', 'shots/tm_r5v2'));
const ids = opt('ids', 'tiger1').split(',');
const angleNames = opt('angles', 'front').split(',');
const dist = opt('dist', '0');
mkdirSync(outDir, { recursive: true });

const ANGLES = {
  front: { az: -38, pitch: 10 },
  rear: { az: 142, pitch: 12 },
  side: { az: -87, pitch: 7 },
  low: { az: -32, pitch: 4 },
};

const server = await createServer({
  root: process.cwd(),
  logLevel: 'error',
  server: { port: 5900 + Math.floor(Math.random() * 90), strictPort: false },
});
await server.listen();
const port = server.config.server.port;

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

const measures = [];
for (const id of ids) {
  for (const an of angleNames) {
    const A = ANGLES[an] || ANGLES.front;
    const url = `http://localhost:${port}/tools/tmp-tm-r5v2-probe.html?id=${id}&az=${A.az}&pitch=${A.pitch}&dist=${dist}`;
    await page.goto(url, { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction('window.__PROBE_READY === true', { timeout: 40000 }).catch(() => {});
    const m = await page.evaluate('window.__MEASURE');
    if (m && an === angleNames[0]) measures.push(m);
    await page.screenshot({ path: `${outDir}/${id}_${an}.png` });
    console.log(`shot ${id} ${an}`, JSON.stringify(m || {}));
  }
}
writeFileSync(`${outDir}/measures.json`, JSON.stringify(measures, null, 2));
if (errors.length) {
  console.error('CONSOLE ERRORS:', errors.slice(0, 12).join('\n'));
  process.exitCode = 2;
}
await browser.close();
await server.close();
releaseLock();
