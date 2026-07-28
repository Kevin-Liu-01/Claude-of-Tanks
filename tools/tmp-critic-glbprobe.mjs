// tools/tmp-critic-glbprobe.mjs — critic round-1 temp runner for
// tmp-critic-glbprobe.html (swap-aware GLB variant renders).
// Usage: node tools/tmp-critic-glbprobe.mjs --ids m1a1,t90a --out shots/critic_r1/variants
import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { mkdirSync, rmdirSync, statSync } from 'node:fs';
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
const outDir = resolve(opt('out', 'shots/critic_r1/variants'));
const ids = opt('ids', 'm1a1,m1a2_tusk,t90a').split(',');
mkdirSync(outDir, { recursive: true });

const ANGLES = [
  { name: 'front', az: -38, pitch: 10 },
  { name: 'rear', az: 142, pitch: 12 },
];

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

for (const id of ids) {
  for (const a of ANGLES) {
    const url = `http://localhost:${port}/tools/tmp-critic-glbprobe.html?id=${id}&az=${a.az}&pitch=${a.pitch}`;
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
    await page.waitForFunction('window.__PROBE_READY === true', { timeout: 45000 });
    const err = await page.evaluate('window.__PROBE_ERROR || null');
    const tris = await page.evaluate('window.__TRIS || 0');
    if (err) console.log(`[criticprobe] ${id} ERROR: ${err}`);
    console.log(`[criticprobe] ${id} ${a.name}: ${tris.toLocaleString()} tris`);
    await page.screenshot({ path: `${outDir}/${id}_${a.name}.png` });
  }
}
if (errors.length) {
  console.log('[criticprobe] console errors:');
  for (const e of errors) console.log('  ' + e);
}
console.log(`[criticprobe] shots in ${outDir}`);
await browser.close();
await server.close();
releaseLock();
process.exit(0);
