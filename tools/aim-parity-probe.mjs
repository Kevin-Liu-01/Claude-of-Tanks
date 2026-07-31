// tools/aim-parity-probe.mjs — camera/aim COUPLING parity trace.
//
// Owner ground truth (2026-07-31): the deployed build at
// https://claude-of-tanks.vercel.app carries the camera/aim behavior he wants
// ("camera in relation to where we're aiming"). This probe drives an IDENTICAL
// scripted input sequence against any build of the game and records per-frame
// camera/turret/reticle traces, so local behavior can be diffed against the
// deployment empirically instead of by description.
//
// Sequences (all under pointer lock, m1a2, easy bots):
//   A mouse-look +400 px right      -> camera yaw response + gun convergence
//   B mouse-look 200 px up          -> camera pitch response
//   C W drive 1.2 s                 -> chase anchor (camera follows hull, yaw stays)
//   D A turn 1.0 s                  -> hull yaw vs camera yaw decoupling
//   E wheel ladder in x6 / out x6   -> zoom steps, sniper boundary, pitch map
//
// Usage:
//   node tools/aim-parity-probe.mjs --url https://claude-of-tanks.vercel.app \
//        --json /tmp/dep.json --label deployed
//   node tools/aim-parity-probe.mjs --local --json /tmp/local.json --label local
//
// The JSON dump holds the raw frame traces + per-sequence summaries; the
// summaries are also printed. Exits non-zero on harness failure only.
import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (n, f) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : f; };
const useLocal = args.includes('--local');
const urlArg = opt('url', null);
const jsonPath = opt('json', null);
const label = opt('label', useLocal ? 'local' : 'remote');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const deg = (r) => r * 180 / Math.PI;

let server = null;
let url = urlArg;
if (useLocal) {
  server = await createServer({
    root: process.cwd(), logLevel: 'error',
    server: { port: 7400 + Math.floor(Math.random() * 300), strictPort: false, hmr: false, watch: null },
    optimizeDeps: { entries: ['index.html'], include: [
      'three', 'three/examples/jsm/loaders/GLTFLoader.js',
      'three/examples/jsm/utils/SkeletonUtils.js',
      'three/examples/jsm/utils/BufferGeometryUtils.js',
      'three/examples/jsm/geometries/RoundedBoxGeometry.js',
    ] },
  });
  await server.listen();
  url = `http://localhost:${server.config.server.port}/`;
}
if (!url) { console.error('need --url or --local'); process.exit(2); }
console.log(`[parity:${label}] target ${url}`);

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
  protocolTimeout: 600000,
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 200)));
await page.evaluateOnNewDocument(() => {
  try { localStorage.setItem('cot.settings.v1', JSON.stringify({ aiDifficulty: 'easy' })); } catch (_) { /* private */ }
});
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180000 });
await page.waitForFunction('window.__GAME_READY === true', { timeout: 180000 });
await sleep(1500);

// battle + lock
await page.evaluate(() => window.__DEBUG.startBattle('m1a2'));
await sleep(600);
await page.evaluate(() => window.__DEBUG.fastForward(2));
await page.mouse.click(800, 450);
await sleep(700);
const locked = await page.evaluate(() => window.__DEBUG.input.isLocked());
console.log(`[parity:${label}] locked=${locked}`);

// per-frame recorder (rAF)
await page.evaluate(() => {
  const D = window.__DEBUG;
  const V = Object.getPrototypeOf(D.camera.position).constructor;
  const dir = new V();
  const proj = new V();
  window.__TRACE = { frames: [], on: false, seq: '' };
  const tick = () => {
    if (window.__TRACE.on) {
      D.camera.getWorldDirection(dir);
      const p = D.game.player;
      proj.copy(D.rig.aimPoint).project(D.camera);
      window.__TRACE.frames.push({
        t: performance.now(),
        seq: window.__TRACE.seq,
        camYaw: Math.atan2(dir.x, dir.z),
        camPitch: Math.asin(Math.max(-1, Math.min(1, dir.y))),
        fov: D.camera.fov,
        mode: D.rig.mode,
        hullYaw: p.state.yaw,
        turretYaw: p.state.turretYaw,
        gunPitch: p.state.gunPitch,
        aimDist: D.rig.aimDist,
        reticleNdc: [+proj.x.toFixed(4), +proj.y.toFixed(4)],
        camPos: [+D.camera.position.x.toFixed(2), +D.camera.position.y.toFixed(2), +D.camera.position.z.toFixed(2)],
        hullPos: [+p.state.pos.x.toFixed(2), +p.state.pos.z.toFixed(2)],
      });
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});
const rec = (seq, on) => page.evaluate((s, o) => {
  window.__TRACE.seq = s;
  window.__TRACE.on = o;
}, seq, on);
const takeFrames = () => page.evaluate(() => {
  const f = window.__TRACE.frames;
  window.__TRACE.frames = [];
  return f;
});

const traces = {};
async function runSeq(name, fn, settleMs = 500) {
  await takeFrames();
  await rec(name, true);
  await fn();
  await sleep(settleMs);
  await rec(name, false);
  traces[name] = await takeFrames();
}

// A: yaw sweep
await runSeq('A_yaw_sweep', async () => {
  for (let i = 0; i < 10; i++) {
    await page.mouse.move(800 + (i + 1) * 40, 450, { steps: 1 });
    await sleep(20);
  }
  await sleep(2500); // gun convergence window
}, 400);

// B: pitch sweep up
await runSeq('B_pitch_sweep', async () => {
  for (let i = 0; i < 10; i++) {
    await page.mouse.move(1200, 450 - (i + 1) * 20, { steps: 1 });
    await sleep(20);
  }
}, 700);

// C: drive forward
await runSeq('C_drive_W', async () => {
  await page.keyboard.down('KeyW');
  await sleep(1200);
  await page.keyboard.up('KeyW');
}, 600);

// D: hull turn
await runSeq('D_turn_A', async () => {
  await page.keyboard.down('KeyA');
  await sleep(1000);
  await page.keyboard.up('KeyA');
}, 600);

// E: zoom ladder
await runSeq('E_zoom_ladder', async () => {
  for (let i = 0; i < 6; i++) { await page.mouse.wheel({ deltaY: -120 }); await sleep(350); }
  for (let i = 0; i < 6; i++) { await page.mouse.wheel({ deltaY: 120 }); await sleep(350); }
}, 500);

// ---- summaries --------------------------------------------------------------
const first = (fr) => fr[0];
const last = (fr) => fr[fr.length - 1];
const summarize = () => {
  const s = {};
  {
    const f = traces.A_yaw_sweep;
    const a = first(f), b = last(f);
    const camD = wrap(b.camYaw - a.camYaw);
    const gunW0 = wrap(a.hullYaw + a.turretYaw);
    const gunW1 = wrap(b.hullYaw + b.turretYaw);
    s.A = {
      camYawDeltaDeg: +deg(camD).toFixed(2),
      gunYawDeltaDeg: +deg(wrap(gunW1 - gunW0)).toFixed(2),
      gunVsCamEndDeg: +deg(wrap(gunW1 - b.camYaw)).toFixed(2),
      hullYawDeltaDeg: +deg(wrap(b.hullYaw - a.hullYaw)).toFixed(2),
    };
  }
  {
    const f = traces.B_pitch_sweep;
    const a = first(f), b = last(f);
    s.B = {
      camPitchDeltaDeg: +deg(b.camPitch - a.camPitch).toFixed(2),
      gunPitchDeltaDeg: +deg(b.gunPitch - a.gunPitch).toFixed(2),
    };
  }
  {
    const f = traces.C_drive_W;
    const a = first(f), b = last(f);
    const moved = Math.hypot(b.hullPos[0] - a.hullPos[0], b.hullPos[1] - a.hullPos[1]);
    const camMoved = Math.hypot(b.camPos[0] - a.camPos[0], b.camPos[2] - a.camPos[2]);
    s.C = {
      hullMovedM: +moved.toFixed(2),
      camMovedM: +camMoved.toFixed(2),
      camYawDriftDeg: +deg(wrap(b.camYaw - a.camYaw)).toFixed(2),
    };
  }
  {
    const f = traces.D_turn_A;
    const a = first(f), b = last(f);
    s.D = {
      hullYawDeltaDeg: +deg(wrap(b.hullYaw - a.hullYaw)).toFixed(2),
      camYawDriftDeg: +deg(wrap(b.camYaw - a.camYaw)).toFixed(2),
      turretCompensatedDeg: +deg(wrap((b.hullYaw + b.turretYaw) - (a.hullYaw + a.turretYaw))).toFixed(2),
    };
  }
  {
    const f = traces.E_zoom_ladder;
    // mode/fov timeline: collapse consecutive identical (mode, fov) pairs
    const steps = [];
    for (const fr of f) {
      const key = `${fr.mode}@${fr.fov.toFixed(1)}`;
      if (!steps.length || steps[steps.length - 1].key !== key) {
        steps.push({ key, pitchDeg: +deg(fr.camPitch).toFixed(2), aimDist: +fr.aimDist.toFixed(0) });
      }
    }
    const a = first(f), b = last(f);
    s.E = {
      timeline: steps.map((x) => `${x.key} p=${x.pitchDeg}`),
      pitchStartDeg: +deg(a.camPitch).toFixed(2),
      pitchEndDeg: +deg(b.camPitch).toFixed(2),
      pitchNetDeg: +deg(b.camPitch - a.camPitch).toFixed(2),
    };
  }
  return s;
};

const summary = summarize();
console.log(`[parity:${label}] summary:\n${JSON.stringify(summary, null, 2)}`);
if (pageErrors.length) console.log(`[parity:${label}] pageErrors:`, pageErrors.slice(0, 5));

if (jsonPath) {
  writeFileSync(jsonPath, JSON.stringify({ label, url, summary, traces }, null, 1));
  console.log(`[parity:${label}] traces -> ${jsonPath}`);
}

await browser.close();
if (server) await server.close();
process.exit(0);
