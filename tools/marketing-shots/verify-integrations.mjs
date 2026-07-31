// tools/marketing-shots/verify-integrations.mjs — proof pass for the
// marketing-shot integrations:
//   1. SPLASH: forces the real splash (__COT_FORCE_SPLASH) and screenshots it
//      with the marketing backdrop faded in (waits for #cot-boot-hero .hly.on
//      + image decode). Asserts the gate arms and chrome stays on top.
//   2. BOOT TIMING A/B: navigation -> __GAME_READY wall time, median of N
//      runs with the hero enabled vs ?nohero. The mandate allows <= 100 ms
//      regression (the hero is lazy-loaded, so the delta should be noise).
//   3. GARAGE: boots to the garage (webdriver gate skip), waits for the
//      featured panel's first still, screenshots the garage.
//   4. OG: asserts public/brand/og-image.png exists at 1200x630.
//
// Usage: node tools/marketing-shots/verify-integrations.mjs
// Output: shots/marketing/integration/{splash,garage}.png + console report.
// Shares the cot-shots FIFO lock. Own vite on a 7xxx port (NEVER 5001/5002).

import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import {
  mkdirSync, rmdirSync, statSync, writeFileSync, readdirSync, unlinkSync,
  utimesSync, readFileSync, existsSync,
} from 'node:fs';
import { resolve, join } from 'node:path';

// --- exclusive harness lock (FIFO ticket protocol, see screenshot.mjs) ------
const LOCK_DIR = '/tmp/cot-shots.lock';
const QUEUE_DIR = '/tmp/cot-shots.queue';
const LOCK_STALE_MS = 5 * 60 * 1000;
const TICKET_STALE_MS = 60 * 60 * 1000;
let lockHeld = false;
function ticketPid(name) {
  const m = name.match(/-(\d+)\.t$/);
  return m ? parseInt(m[1], 10) : -1;
}
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
function releaseLock() {
  if (!lockHeld) return;
  lockHeld = false;
  try { rmdirSync(LOCK_DIR); } catch (_) { /* fine */ }
}
await acquireLock(30 * 60 * 1000);
process.on('exit', releaseLock);
const lockRefresher = setInterval(() => {
  try { const now = new Date(); utimesSync(LOCK_DIR, now, now); } catch (_) { /* fine */ }
}, 60 * 1000);
lockRefresher.unref();

const ROOT = resolve(new URL('../..', import.meta.url).pathname);
const OUT = join(ROOT, 'shots/marketing/integration');
mkdirSync(OUT, { recursive: true });

const server = await createServer({
  root: ROOT,
  logLevel: 'error',
  server: { port: 7300 + Math.floor(Math.random() * 500), strictPort: false, hmr: false, watch: { ignored: ['**/*'] } },
  optimizeDeps: {
    entries: ['index.html'],
    include: [
      'three',
      'three/examples/jsm/loaders/GLTFLoader.js',
      'three/examples/jsm/utils/SkeletonUtils.js',
      'three/examples/jsm/utils/BufferGeometryUtils.js',
      'three/examples/jsm/geometries/RoundedBoxGeometry.js',
    ],
  },
});
await server.listen();
const url = `http://localhost:${server.config.server.port}/`;
console.log(`[verify] vite up at ${url}`);

const browser = await puppeteer.launch({
  headless: 'new',
  protocolTimeout: 300000,
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
});

const failures = [];
const check = (name, cond, detail = '') => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
  if (!cond) failures.push(name);
};

// --- 1. splash with backdrop -------------------------------------------------
{
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(() => { window.__COT_FORCE_SPLASH = true; });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  const heroOn = await page
    .waitForFunction(() => {
      const ly = document.querySelector('#cot-boot-hero .hly.on');
      return !!(ly && ly.style.backgroundImage);
    }, { timeout: 30000 })
    .then(() => true)
    .catch(() => false);
  check('splash: marketing backdrop layer faded in', heroOn);
  // let the crossfade + entrance animations settle before the still
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 1400));
  const gateArmed = await page.evaluate(() => {
    const g = document.getElementById('cot-boot-gate');
    return !!(g && g.classList.contains('on'));
  });
  check('splash: press-any-key gate armed with backdrop up', gateArmed);
  const chrome = await page.evaluate(() => {
    const word = document.querySelector('.cot-boot-word .l1');
    const hero = document.getElementById('cot-boot-hero');
    if (!word || !hero) return false;
    const wz = getComputedStyle(word.closest('.cot-boot-inner')).zIndex;
    return parseInt(wz, 10) > 0;
  });
  check('splash: chrome layered above the backdrop', chrome);
  await page.screenshot({ path: join(OUT, 'splash.png') });
  console.log(`[verify] wrote ${join(OUT, 'splash.png')}`);
  await page.close();
}

// --- 2. boot timing A/B ------------------------------------------------------
async function bootTime(qs) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const t0 = Date.now();
  await page.goto(`${url}${qs}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });
  const dt = Date.now() - t0;
  await page.close();
  return dt;
}
{
  const N = 3;
  const withHero = [];
  const noHero = [];
  // warm the vite transform cache once so the first measured run is honest
  await bootTime('?nohero');
  for (let i = 0; i < N; i++) {
    noHero.push(await bootTime('?nohero'));
    withHero.push(await bootTime(''));
  }
  const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
  const dm = med(withHero) - med(noHero);
  console.log(`[verify] boot medians: hero ${med(withHero)} ms vs nohero ${med(noHero)} ms (delta ${dm >= 0 ? '+' : ''}${dm} ms)`);
  console.log(`[verify]   hero runs: ${withHero.join(', ')} | nohero runs: ${noHero.join(', ')}`);
  check('boot: hero backdrop costs <= 100 ms', dm <= 100, `delta ${dm} ms`);
}

// --- 3. garage with featured panel -------------------------------------------
{
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });
  const panelOn = await page
    .waitForFunction(() => {
      const ly = document.querySelector('.cot-featured .fly.on');
      return !!(ly && ly.style.backgroundImage);
    }, { timeout: 30000 })
    .then(() => true)
    .catch(() => false);
  check('garage: featured panel showing a still', panelOn);
  const caption = await page.evaluate(() => {
    const c = document.querySelector('.cot-featured .fcap');
    return c ? c.textContent : '';
  });
  check('garage: featured caption populated', !!caption, caption);
  await new Promise((r) => setTimeout(r, 900));
  await page.screenshot({ path: join(OUT, 'garage.png') });
  console.log(`[verify] wrote ${join(OUT, 'garage.png')}`);
  await page.close();
}

// --- 4. og image --------------------------------------------------------------
{
  const og = join(ROOT, 'public/brand/og-image.png');
  let dims = null;
  if (existsSync(og)) {
    const buf = readFileSync(og);
    if (buf.length >= 24 && buf.toString('ascii', 12, 16) === 'IHDR') {
      dims = { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), kb: Math.round(buf.length / 1024) };
    }
  }
  check('og: public/brand/og-image.png is a 1200x630 PNG',
    !!dims && dims.w === 1200 && dims.h === 630,
    dims ? `${dims.w}x${dims.h}, ${dims.kb} KB` : 'missing');
}

await browser.close();
await server.close();
if (failures.length) {
  console.error(`[verify] ${failures.length} failure(s): ${failures.join(' | ')}`);
  process.exit(1);
}
console.log('[verify] all integration checks green');
