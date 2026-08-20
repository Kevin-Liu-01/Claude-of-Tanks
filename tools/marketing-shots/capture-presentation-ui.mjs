// Capture the public Gallery, Scene Studio, and responsive mobile command deck
// that sit beside tools/screenshot.mjs's deterministic game-state views in the
// presentation-r1 archive.
//
// Usage:
//   node tools/marketing-shots/capture-presentation-ui.mjs
//   node tools/marketing-shots/capture-presentation-ui.mjs --out shots/presentation-r1/ui-raw

import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import {
  mkdirSync, readdirSync, rmdirSync, statSync, unlinkSync, utimesSync, writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';

const LOCK_DIR = '/tmp/cot-shots.lock';
const QUEUE_DIR = '/tmp/cot-shots.queue';
const LOCK_STALE_MS = 5 * 60 * 1000;
const TICKET_STALE_MS = 60 * 60 * 1000;
let lockHeld = false;

function ticketPid(name) {
  const match = name.match(/-(\d+)\.t$/);
  return match ? Number.parseInt(match[1], 10) : -1;
}

function ticketAlive(name) {
  const pid = ticketPid(name);
  if (pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

async function acquireLock(timeoutMs) {
  mkdirSync(QUEUE_DIR, { recursive: true });
  const ticket = `${String(Date.now()).padStart(15, '0')}-${process.pid}.t`;
  writeFileSync(join(QUEUE_DIR, ticket), String(process.pid));
  const startedAt = Date.now();
  try {
    for (;;) {
      let head = null;
      let names = [];
      try {
        names = readdirSync(QUEUE_DIR).filter((name) => name.endsWith('.t')).sort();
      } catch {
        names = [ticket];
      }
      for (const name of names) {
        if (name === ticket) {
          head ||= name;
          break;
        }
        let stale = false;
        try {
          stale = Date.now() - statSync(join(QUEUE_DIR, name)).mtimeMs > TICKET_STALE_MS;
        } catch {
          continue;
        }
        if (stale || !ticketAlive(name)) {
          try { unlinkSync(join(QUEUE_DIR, name)); } catch { /* raced */ }
          continue;
        }
        head = name;
        break;
      }
      if (head === ticket) {
        try {
          mkdirSync(LOCK_DIR);
          lockHeld = true;
          return;
        } catch { /* another capture owns it */ }
        try {
          if (Date.now() - statSync(LOCK_DIR).mtimeMs > LOCK_STALE_MS) {
            rmdirSync(LOCK_DIR);
            continue;
          }
        } catch { /* lock changed while checking */ }
      }
      if (Date.now() - startedAt > timeoutMs) throw new Error('cot-shots lock timeout');
      await new Promise((resolveWait) => setTimeout(resolveWait, head === ticket ? 300 : 1000));
    }
  } finally {
    try { unlinkSync(join(QUEUE_DIR, ticket)); } catch { /* already removed */ }
  }
}

function releaseLock() {
  if (!lockHeld) return;
  lockHeld = false;
  try { rmdirSync(LOCK_DIR); } catch { /* already released */ }
}

const args = process.argv.slice(2);
function opt(name, fallback) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
}

const outDir = resolve(opt('out', 'shots/presentation-r1/ui-raw'));
mkdirSync(outDir, { recursive: true });

await acquireLock(20 * 60 * 1000);
process.on('exit', releaseLock);
const lockRefresher = setInterval(() => {
  try {
    const now = new Date();
    utimesSync(LOCK_DIR, now, now);
  } catch { /* capture is shutting down */ }
}, 60 * 1000);
lockRefresher.unref();

const port = 7800 + Math.floor(Math.random() * 400);
const server = await createServer({
  root: process.cwd(),
  logLevel: 'error',
  server: { port, strictPort: false, hmr: false, watch: { ignored: ['**/*'] } },
  optimizeDeps: {
    entries: ['index.html', 'gallery.html'],
    include: [
      'three',
      'three/examples/jsm/loaders/GLTFLoader.js',
      'three/examples/jsm/utils/SkeletonUtils.js',
      'three/examples/jsm/utils/BufferGeometryUtils.js',
      'three/examples/jsm/geometries/RoundedBoxGeometry.js',
    ],
  },
});

let browser;
try {
  await server.listen();
  const baseUrl = `http://localhost:${server.config.server.port}`;
  console.log(`[presentation-ui] vite up at ${baseUrl}/`);
  browser = await puppeteer.launch({
    headless: 'new',
    protocolTimeout: 300000,
    args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  let errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('favicon')) errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(String(error)));

  const targets = [
    {
      id: 'gallery', width: 1920, height: 1080, path: '/gallery.html?id=m1a2', settleMs: 2500,
      ready: () => document.querySelector('#viewport canvas'),
    },
    {
      id: 'studio', width: 1920, height: 1080, path: '/?studio=1', settleMs: 4500,
      ready: () => window.__GAME_READY === true && window.__STUDIO && getComputedStyle(document.querySelector('.cot-studio')).display !== 'none',
    },
    {
      id: 'mobile', width: 430, height: 932, path: '/', settleMs: 1600,
      ready: () => window.__GAME_READY === true,
    },
  ];

  for (const target of targets) {
    errors = [];
    await page.setViewport({ width: target.width, height: target.height, deviceScaleFactor: 1 });
    await page.goto(`${baseUrl}${target.path}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(target.ready, { timeout: 90000 });
    await page.evaluate(() => document.fonts.ready);
    await new Promise((resolveWait) => setTimeout(resolveWait, target.settleMs));
    if (errors.length) throw new Error(`${target.id} console errors:\n${errors.join('\n')}`);
    const output = join(outDir, `${target.id}.png`);
    await page.screenshot({ path: output, type: 'png' });
    console.log(`[presentation-ui] ${target.id}.png (${target.width}x${target.height})`);
  }
} finally {
  if (browser) await browser.close();
  await server.close();
  clearInterval(lockRefresher);
  releaseLock();
}
