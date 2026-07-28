// tools/tmp-userdrops-yawprobe.mjs — user-drops temp runner for
// tmp-userdrops-yawprobe.html (turret-yaw articulation verification).
// Usage: node tools/tmp-userdrops-yawprobe.mjs --ids leo2a6,ariete,type74 --out shots/userdrops
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
const outDir = resolve(opt('out', 'shots/userdrops'));
const ids = opt('ids', 'leo2a6,ariete,type74').split(',');
const tyaw = opt('tyaw', '55');
const gpitch = opt('gpitch', '10');
mkdirSync(outDir, { recursive: true });

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
  const url = `http://localhost:${port}/tools/tmp-userdrops-yawprobe.html` +
    `?id=${id}&az=-38&pitch=12&tyaw=${tyaw}&gpitch=${gpitch}&direct=${opt('direct', '0')}` +
    `&measure=${opt('measure', '0')}` +
    (opt('bone', '') ? `&bone=${opt('bone', '')}&axis=${opt('axis', 'y')}` : '');
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForFunction('window.__PROBE_READY === true', { timeout: 45000 });
  const err = await page.evaluate('window.__PROBE_ERROR || null');
  if (err) console.log(`[yawprobe] ${id} ERROR: ${err}`);
  const art = await page.evaluate('window.__ART || ""');
  console.log(`[yawprobe] ${id}: yaw=${tyaw} pitch=${gpitch} articulated=[${art}]`);
  const diag = await page.evaluate('window.__DIAG || ""');
  if (diag) console.log(diag);
  await page.screenshot({ path: `${outDir}/${id}_yaw.png` });
}
if (errors.length) {
  console.log('[yawprobe] console errors:');
  for (const e of errors) console.log('  ' + e);
}
await browser.close();
await server.close();
releaseLock();
process.exit(0);
