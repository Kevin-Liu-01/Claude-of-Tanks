// tools/modern3probe.mjs — captures closeup renders of the modern3.js pack.
// Usage: node tools/modern3probe.mjs [--ids a,b,c] [--out shots/modern3]
// Two judged angles per vehicle (sun-side front quarter + rear quarter),
// PNGs land in shots/modern3/<id>_{front,rear}.png. Prints the visible
// triangle count per vehicle (budget <= 120k) and fails on console errors.
// Shares the harness run lock so it never starves a concurrent screenshot run.

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
      if (Date.now() - statSync(LOCK_DIR).mtimeMs > LOCK_STALE_MS) { try { rmdirSync(LOCK_DIR); } catch (e) { if (e.code === 'ENOTDIR') unlinkSync(LOCK_DIR); else throw e; } continue; }
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
const outDir = resolve(opt('out', 'shots/modern3'));
const ids = opt('ids', 'chieftain_mk10,k2,type10,m2a2_bradley,bmp2,ariete').split(',');
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

let failed = false;
for (const id of ids) {
  for (const ang of ANGLES) {
    const url = `http://localhost:${port}/tools/modern3probe.html?id=${id}&az=${ang.az}&pitch=${ang.pitch}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction('window.__PROBE_READY === true', { timeout: 60000 });
    const err = await page.evaluate('window.__PROBE_ERROR || null');
    const tris = await page.evaluate('window.__TRIS || 0');
    if (err) { console.error(`[modern3probe] ${id}: ${err}`); failed = true; continue; }
    await page.screenshot({ path: `${outDir}/${id}_${ang.name}.png` });
    if (ang.name === 'front') {
      const over = tris > 120000 ? '  ** OVER 120k BUDGET **' : '';
      console.log(`[modern3probe] ${id}: ${tris.toLocaleString()} tris${over}`);
      if (tris > 120000) failed = true;
    }
  }
}
if (errors.length) {
  console.error('[modern3probe] console errors:');
  for (const e of errors) console.error('  ' + e);
  failed = true;
}
await browser.close();
await server.close();
releaseLock();
console.log(`[modern3probe] shots in ${outDir}`);
process.exit(failed ? 1 : 0);
