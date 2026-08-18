// SCENE STUDIO self-test (docs/STUDIO.md §Self-test).
// Usage: node tools/studio-selftest.mjs [--out shots/studio-selftest] [--keep]
//
// Drives the full scripted-shoot flow headlessly:
//   1. boots the game at ?studio=1&map=desert (own vite on a 7xxx port),
//   2. __STUDIO.load()s a 3-tank desert scene (one firing with a live tracer,
//      one frozen mid-ammo-rack-explosion, one burnt wreck; dust + engine
//      smoke), asserts NO battle sim is running and the fx timeline froze at
//      exactly fxTime,
//   3. captures a >= 2560 px PNG via __STUDIO.capture (probe writes the file),
//   4. verifies the scene JSON round-trips (load(state()) reproduces poses),
//   5. repeats on winter with a different camera + FOV,
//   6. exits the studio and confirms the garage phase returns.
// Exits non-zero on any assertion or page console error.
//
// Shares the /tmp/cot-shots FIFO lock with the other capture harnesses so
// concurrent agent runs never contend for the GPU (same protocol as
// tools/screenshot.mjs — keep in sync).

import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { mkdirSync, rmdirSync, statSync, writeFileSync, readdirSync, unlinkSync, utimesSync } from 'node:fs';
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
          if (Date.now() - statSync(LOCK_DIR).mtimeMs > LOCK_STALE_MS) { try { rmdirSync(LOCK_DIR); } catch (e) { if (e.code === 'ENOTDIR') unlinkSync(LOCK_DIR); else throw e; } continue; }
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
await acquireLock(20 * 60 * 1000);
process.on('exit', releaseLock);
const lockRefresher = setInterval(() => {
  try { const now = new Date(); utimesSync(LOCK_DIR, now, now); } catch (_) { /* fine */ }
}, 60 * 1000);
lockRefresher.unref();

// --- options -----------------------------------------------------------------
const args = process.argv.slice(2);
function opt(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
}
const outDir = resolve(opt('out', 'shots/studio-selftest'));
mkdirSync(outDir, { recursive: true });

// --- vite (own 7xxx port — NEVER 5001/5002) -----------------------------------
const port = 7300 + Math.floor(Math.random() * 500);
const server = await createServer({
  root: process.cwd(),
  logLevel: 'error',
  server: { port, strictPort: false, hmr: false, watch: { ignored: ['**/*'] } },
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
console.log(`[studio-selftest] vite up at ${url}`);

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });

const consoleErrors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error' && !msg.text().includes('favicon')) consoleErrors.push(msg.text());
});
page.on('pageerror', (err) => consoleErrors.push(String(err)));

// --- scenes --------------------------------------------------------------------
const DESERT_SCENE = {
  map: 'desert',
  seed: 5000,
  actors: [
    { id: 't90m', name: 'shooter', pos: [-26, -14], facingDeg: 60, turretDeg: 0, gunDeg: 1.5, camo: 'desert', state: 'intact', smoking: true },
    { id: 'tiger1', name: 'victim', pos: [26, 16], facingDeg: 285, turretDeg: -20, gunDeg: 0, state: 'intact' },
    { id: 'm4a3e8', name: 'wreck', pos: [10, -26], facingDeg: 152, turretDeg: 35, gunDeg: -4, state: 'wrecked-burnt', stateAgeS: 240 },
  ],
  effects: [
    { type: 'tank_kill', actor: 'victim', tMs: 60, params: { cause: 'ammorack', pop: true } },
    { type: 'dust', actor: 'wreck', tMs: 250, params: { count: 12, intensity: 1, dirDeg: 150 } },
    { type: 'fire', actor: 'shooter', tMs: 590, params: { slot: 0, tracer: true, recoil: true } },
  ],
  camera: { pos: [-48, 5.5, -34], lookAt: [10, 2.5, 4], groundRel: true, fov: 42 },
  fxTime: 620,
  timeScale: 0,
};

const WINTER_SCENE = {
  map: 'winter',
  seed: 7100,
  actors: [
    { id: 'leo2a7', name: 'overwatch', pos: [-12, -6], facingDeg: 52, turretDeg: 0, gunDeg: 2, camo: 'winter', state: 'intact' },
    { id: 'is2', name: 'burnout', pos: [24, 20], facingDeg: 200, turretDeg: 90, gunDeg: -3, state: 'turret-popped', stateAgeS: 90, burning: true },
  ],
  effects: [
    { type: 'sparks', at: [24, 21.5], tMs: 700, params: { caliberMm: 100 } },
    { type: 'firing_moment', actor: 'overwatch', tMs: 900, params: { ageS: 0.05 } },
  ],
  camera: { pos: [-38, 3.2, -6], lookAt: [8, 1.8, 8], groundRel: true, fov: 36, rollDeg: -1.5 },
  fxTime: 900,
  timeScale: 0,
};

function pngSize(buf) {
  if (buf.length < 24 || buf.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}
function writeCapture(name, cap) {
  const b64 = cap.dataURL.split(',')[1];
  const buf = Buffer.from(b64, 'base64');
  const file = join(outDir, name);
  writeFileSync(file, buf);
  const dims = pngSize(buf);
  if (!dims) throw new Error(`${name}: not a PNG`);
  if (dims.width < 2560) throw new Error(`${name}: only ${dims.width}px wide (< 2560 hi-res contract)`);
  console.log(`[studio-selftest] wrote ${file} (${dims.width}x${dims.height})`);
  return dims;
}
const approx = (a, b, eps, what) => {
  if (Math.abs(a - b) > eps) throw new Error(`round-trip drift on ${what}: ${a} vs ${b}`);
};

let failed = false;
try {
  // 1. boot straight into the studio on desert
  const entryStartedAt = Date.now();
  await page.goto(`${url}?studio=1&map=desert`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });
  // active flips when the studio takes the frame; mapId lands once the
  // chunked world build behind the busy bar finishes
  await page.waitForFunction(
    "window.__STUDIO && window.__STUDIO.active === true && window.__STUDIO.mapId === 'desert'",
    { timeout: 120000 },
  );
  console.log('[studio-selftest] studio entered via ?studio=1&map=desert');

  const entry = await page.evaluate(() => ({
    phase: window.__DEBUG.game.phase,
    mapId: window.__STUDIO.mapId,
    bootMs: window.__BOOT_MS,
    bootTimings: window.__BOOT_TIMINGS,
    studioLoad: window.__STUDIO_LOAD,
    studioWarm: window.__STUDIO_WARM,
    combatWarm: window.__COMBAT_WARM || null,
    builtPoolVisuals: window.__DEBUG.game.allTanks.filter((ent) => !!ent.visual).length,
    poolTankVisible: (() => {
      let vis = false;
      for (const ent of window.__DEBUG.game.allTanks) {
        if (ent.visual && ent.visual.root.visible) vis = true;
      }
      return vis;
    })(),
  }));
  if (entry.phase !== 'studio') throw new Error(`phase is '${entry.phase}', expected 'studio'`);
  if (entry.mapId !== 'desert') throw new Error(`map is '${entry.mapId}', expected 'desert'`);
  if (entry.poolTankVisible) throw new Error('battle-pool tank visuals are visible in the studio');
  if (entry.builtPoolVisuals !== 0) {
    throw new Error(`direct Studio boot built ${entry.builtPoolVisuals} hidden battle-pool visuals`);
  }
  if (entry.combatWarm) throw new Error('direct Studio boot ran the complete combat warm');
  if (!entry.studioLoad?.directBoot || !entry.bootTimings?.studio) {
    throw new Error('direct Studio boot did not use the covered Studio loading stage');
  }
  console.log(
    `[studio-selftest] direct entry ${Date.now() - entryStartedAt} ms wall / ` +
    `${entry.bootMs} ms boot / ${entry.studioLoad.totalMs} ms Studio / ` +
    `${entry.studioWarm?.totalMs || 0} ms focused warm`,
  );
  console.log('[studio-selftest] phase=studio, map=desert, battle pool unbuilt + hidden');

  // 2. deterministic 3-tank load
  const s1 = await page.evaluate(
    (scene) => window.__STUDIO.load(scene), DESERT_SCENE,
  );
  if (s1.actors.length !== 3) throw new Error(`load() built ${s1.actors.length} actors, expected 3`);
  if (s1.fxTime !== DESERT_SCENE.fxTime) throw new Error(`state().fxTime ${s1.fxTime} != ${DESERT_SCENE.fxTime}`);

  // battle sim must NOT be running and fx must be frozen at fxTime
  const frozen0 = await page.evaluate(() => ({
    t: window.__STUDIO.fxTimeMs, simT: window.__DEBUG.game.timeS,
    scale: window.__STUDIO.timeScale, phase: window.__DEBUG.game.phase,
    perf: window.__STUDIO.performance(),
  }));
  await new Promise((r) => setTimeout(r, 700));
  const frozen1 = await page.evaluate(() => ({
    t: window.__STUDIO.fxTimeMs, simT: window.__DEBUG.game.timeS,
    shellsAlive: window.__DEBUG.game.shells.length,
    perf: window.__STUDIO.performance(),
  }));
  if (frozen0.phase !== 'studio') throw new Error('load() left the studio phase');
  if (frozen0.scale !== 0) throw new Error(`timeScale after load is ${frozen0.scale}, expected 0`);
  if (frozen0.t !== DESERT_SCENE.fxTime || frozen1.t !== DESERT_SCENE.fxTime) {
    throw new Error(`fx clock not frozen at fxTime: ${frozen0.t} -> ${frozen1.t} (want ${DESERT_SCENE.fxTime})`);
  }
  if (frozen1.simT !== frozen0.simT) throw new Error('battle sim clock advanced inside the studio');
  if (frozen1.shellsAlive !== 0) throw new Error('battle shells are live inside the studio');
  const frozenRenders = frozen1.perf.renderedFrames - frozen0.perf.renderedFrames;
  if (frozenRenders > 4) {
    throw new Error(`frozen idle rendered ${frozenRenders} frames instead of staying on demand`);
  }
  const victim = s1.actors.find((a) => a.name === 'victim');
  if (!victim || victim.state !== 'turret-popped') {
    throw new Error(`tank_kill did not leave the victim turret-popped (got ${victim && victim.state})`);
  }
  console.log(
    `[studio-selftest] fx frozen at ${frozen1.t} ms, sim static, ` +
    `${frozen1.perf.skippedFrames - frozen0.perf.skippedFrames} idle frames skipped`,
  );

  // 3. hi-res capture (probe writes the PNG)
  const cap1 = await page.evaluate(() => window.__STUDIO.capture({ width: 2560 }));
  writeCapture('desert_threetank_kill.png', cap1);

  // 4. scene JSON round-trip: reload state() and compare poses
  const s2 = await page.evaluate(() => window.__STUDIO.load(window.__STUDIO.state()));
  for (let i = 0; i < s1.actors.length; i++) {
    const a = s1.actors[i];
    const b = s2.actors[i];
    if (a.id !== b.id || a.state !== b.state) {
      throw new Error(`round-trip actor ${i}: ${a.id}/${a.state} vs ${b.id}/${b.state}`);
    }
    approx(a.pos[0], b.pos[0], 0.05, `actor${i}.x`);
    approx(a.pos[1], b.pos[1], 0.05, `actor${i}.z`);
    approx(a.facingDeg, b.facingDeg, 0.1, `actor${i}.facing`);
    approx(a.turretDeg, b.turretDeg, 0.1, `actor${i}.turret`);
    approx(a.gunDeg, b.gunDeg, 0.1, `actor${i}.gun`);
  }
  if (s2.fxTime !== s1.fxTime) throw new Error(`round-trip fxTime ${s1.fxTime} -> ${s2.fxTime}`);
  approx(s1.camera.pos[0], s2.camera.pos[0], 0.1, 'camera.x');
  approx(s1.camera.pos[1], s2.camera.pos[1], 0.1, 'camera.y');
  approx(s1.camera.pos[2], s2.camera.pos[2], 0.1, 'camera.z');
  approx(s1.camera.fov, s2.camera.fov, 0.1, 'camera.fov');
  console.log('[studio-selftest] scene JSON round-trips (poses, camera, fxTime)');

  // 5. winter, different camera + fov
  const w1 = await page.evaluate((scene) => window.__STUDIO.load(scene), WINTER_SCENE);
  if (w1.map !== 'winter') throw new Error(`winter load landed on '${w1.map}'`);
  if (Math.abs(w1.camera.fov - WINTER_SCENE.camera.fov) > 0.1) {
    throw new Error(`winter fov ${w1.camera.fov} != ${WINTER_SCENE.camera.fov}`);
  }
  const capW = await page.evaluate(() => window.__STUDIO.capture({ width: 3200 }));
  writeCapture('winter_overwatch_burnout.png', capW);

  // 6. a second winter framing off the same machinery (camera-only move):
  // low closeup on the burning turret-popped IS-2, popped turret foreground
  await page.evaluate(() => window.__STUDIO.setCamera({
    pos: [11, 2.6, 14.5], lookAt: [24, 2.0, 20], groundRel: true, fov: 42,
  }));
  const capW2 = await page.evaluate(() => window.__STUDIO.capture({ width: 2560 }));
  writeCapture('winter_wreck_closeup.png', capW2);

  // 7. exit hands back to the garage
  const after = await page.evaluate(() => {
    window.__STUDIO.exit();
    return { phase: window.__DEBUG.game.phase, active: window.__STUDIO.active };
  });
  if (after.phase !== 'garage' || after.active) {
    throw new Error(`exit() left phase='${after.phase}' active=${after.active}`);
  }
  console.log('[studio-selftest] exit() returned to the garage');
} catch (err) {
  failed = true;
  console.error(`[studio-selftest] FAILED: ${err.message}`);
} finally {
  if (consoleErrors.length) {
    console.error(`[studio-selftest] page console errors (${consoleErrors.length}):`);
    for (const e of consoleErrors.slice(0, 30)) console.error(`  ${e}`);
  }
  await browser.close();
  await server.close();
}
process.exit(failed || consoleErrors.length ? 1 : 0);
