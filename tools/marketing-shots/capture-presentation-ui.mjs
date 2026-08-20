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
  mkdirSync, readFileSync, readdirSync, rmdirSync, statSync, unlinkSync, utimesSync, writeFileSync,
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

const collection = opt('collection', 'presentation');
const onlyTarget = opt('only', '');
const outDir = resolve(opt('out', collection === 'feature-evidence'
  ? 'shots/feature-evidence-r2/ui-raw'
  : 'shots/presentation-r1/ui-raw'));
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

  const sourceStudioScene = JSON.parse(readFileSync(resolve(
    'tools/marketing-shots/scenes-action-r3/85_action_urban_alley_flash.json',
  ), 'utf8'));
  sourceStudioScene.effects = sourceStudioScene.effects.map((effect, index) => ({
    ...effect,
    tMs: [320, 680, 1040, 1420, 1810, 2200, 2590, 3000, 3380, 3700][index],
  }));
  sourceStudioScene.fxTime = 3480;
  const presentationTargets = [
    {
      id: 'gallery', width: 1920, height: 1080, dpr: 1,
      path: '/gallery.html?id=m1a2', settleMs: 2500,
      ready: () => document.querySelector('#viewport canvas'),
    },
    {
      id: 'studio', width: 1920, height: 1080, dpr: 1,
      path: '/?studio=1', settleMs: 4500,
      ready: () => window.__GAME_READY === true && window.__STUDIO && getComputedStyle(document.querySelector('.cot-studio')).display !== 'none',
    },
    {
      id: 'mobile', width: 430, height: 932, dpr: 1, path: '/', settleMs: 1600,
      ready: () => window.__GAME_READY === true,
    },
  ];
  const featureTargets = [
    {
      id: 'garage_4k', width: 1920, height: 1080, dpr: 2, path: '/', settleMs: 2800,
      ready: () => window.__GAME_READY === true,
      setup: { kind: 'garage' },
    },
    {
      id: 'gallery_modules_carro45t_4k', width: 1920, height: 1080, dpr: 2,
      path: '/gallery.html?id=carro45t&layer=modules', settleMs: 2200,
      ready: () => window.__TANK_GALLERY?.ready === true
        && window.__TANK_GALLERY.getState().overlayCount > 0,
      setup: { kind: 'gallery-modules' },
    },
    {
      id: 'studio_action_4k', width: 1920, height: 1080, dpr: 2,
      path: '/?studio=1&map=urban&nogate=1', settleMs: 2200,
      ready: () => window.__GAME_READY === true && window.__STUDIO?.active === true,
      setup: { kind: 'studio-scene', scene: sourceStudioScene },
    },
    {
      id: 'mechanic_mbt70_missile_4k', width: 1920, height: 1080, dpr: 2,
      path: '/?studio=1&map=steppe&nogate=1', settleMs: 1000,
      ready: () => window.__GAME_READY === true && window.__STUDIO?.active === true,
      setup: {
        kind: 'studio-scene',
        scene: {
          map: 'steppe', seed: 77151,
          actors: [
            { id: 'mbt70', name: 'launcher', pos: [-100, -60], facingDeg: 184, turretDeg: 0, gunDeg: 1, camo: 'summer' },
            { id: 't90m', name: 'target', pos: [-103, -104], facingDeg: 4, turretDeg: 0, gunDeg: 0, camo: 'summer' },
          ],
          effects: [{ type: 'fire', actor: 'launcher', tMs: 0,
            params: { slot: 0, tracer: true, recoil: true } }],
          camera: { pos: [-90, 1.2, -50], lookAt: [-100, 1.7, -72], groundRel: true, fov: 40, rollDeg: -2 },
          fxTime: 55, timeScale: 0,
        },
      },
    },
    {
      id: 'mechanic_strv_suspension_4k', width: 1920, height: 1080, dpr: 2,
      path: '/?studio=1&map=steppe&nogate=1', settleMs: 1200,
      ready: () => window.__GAME_READY === true && window.__STUDIO?.active === true,
      setup: {
        kind: 'strv-suspension',
        scene: {
          map: 'steppe', seed: 77152,
          actors: [
            { id: 'strv103', name: 'suspension', pos: [-100, -60], facingDeg: 184, gunDeg: 0, camo: 'summer' },
            { id: 't72b3m', name: 'range-target', pos: [-101, -92], facingDeg: 8, turretDeg: 0, gunDeg: 0, camo: 'summer' },
          ],
          camera: { pos: [-92, 1.2, -50], lookAt: [-100, 1.7, -61], groundRel: true, fov: 39, rollDeg: 1 },
          fxTime: 0, timeScale: 0,
        },
      },
    },
  ];
  const allTargets = collection === 'feature-evidence' ? featureTargets : presentationTargets;
  const targets = onlyTarget ? allTargets.filter((target) => target.id === onlyTarget) : allTargets;
  if (!targets.length) throw new Error(`Unknown presentation capture target: ${onlyTarget}`);

  for (const target of targets) {
    errors = [];
    await page.setViewport({ width: target.width, height: target.height, deviceScaleFactor: target.dpr || 1 });
    await page.goto(`${baseUrl}${target.path}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(target.ready, { timeout: 90000 });
    if (target.setup) {
      await page.evaluate(async (setup) => {
        if (setup.kind === 'garage') {
          window.__SHOTS.set('garage');
        } else if (setup.kind === 'gallery-modules') {
          window.__TANK_GALLERY.setMode('modules', false);
          window.__TANK_GALLERY.frameView('hero');
        } else if (setup.kind === 'studio-scene') {
          await window.__STUDIO.load(setup.scene);
          window.__STUDIO.setRailVisible(false);
          window.__STUDIO.seek(setup.scene.fxTime || 0);
        } else if (setup.kind === 'strv-suspension') {
          await window.__STUDIO.load(setup.scene);
          window.__STUDIO.selectActor('suspension');
          const actor = window.__STUDIO._internal.selected;
          actor.state.suspensionAim = true;
          actor.state.suspensionAimPitch = 12 * Math.PI / 180;
          actor.visual.syncFromState(actor.state, 0);
          window.__STUDIO.setRailVisible(false);
        }
      }, target.setup);
    }
    await page.evaluate(() => document.fonts.ready);
    await new Promise((resolveWait) => setTimeout(resolveWait, target.settleMs));
    if (errors.length) throw new Error(`${target.id} console errors:\n${errors.join('\n')}`);
    const output = join(outDir, `${target.id}.png`);
    await page.screenshot({ path: output, type: 'png' });
    console.log(`[presentation-ui] ${target.id}.png (${target.width * (target.dpr || 1)}x${target.height * (target.dpr || 1)})`);
  }
} finally {
  if (browser) await browser.close();
  await server.close();
  clearInterval(lockRefresher);
  releaseLock();
}
