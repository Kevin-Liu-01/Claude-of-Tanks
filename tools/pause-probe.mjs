// tools/pause-probe.mjs — mid-battle PAUSE regression gate (owner: "be able
// to pause as well mid game if u press escape").
//
// The Esc/settings overlay has always held the fixed-step sim; the PAUSE
// round makes it a real pause (fx clock pinned, dust/visual timelines held,
// engine/combat buses ducked, PAUSED header tag) with a clean resume (the
// frame dt clamp is extended on the resume edge so the first un-paused frame
// integrates at most ONE sim step). This probe drives the REAL input paths in
// headless Chromium (vite + puppeteer, same pattern as controls-probe.mjs):
//
//   1. real BATTLE click -> live battle, pointer lock, audio context up;
//   2. Esc opens the overlay: settings.isOpen(), PAUSED tag shown, engine +
//      combat buses duck to near-silence (music/UI bus stays up);
//   3. FREEZE: battle clock (game.timeS) and every tank pose byte-identical
//      across 3 s of wall time, shell count unchanged;
//   4. screenshot of the paused overlay mid-battle -> shots/pause-r1/;
//   5. Esc again resumes: pauseInfo.paused flips within a frame, the resume
//      frame's dt <= SIM_DT (dt-clamp proof), no teleport (displacement over
//      the first ~0.5 s stays a fraction of a hull length), sim advances
//      again, buses restore;
//   6. pointer lock re-engages after resume (close relock or the canvas
//      click retry path — whichever lands first);
//   7. Esc -> Leave Battle from the paused overlay lands in the garage with
//      all pause state cleared;
//   8. garage Esc keeps its old meaning: panel opens, NO paused tag, NO duck;
//   9. end-overlay Esc keeps its old meaning (spec: pause is live-battle
//      only): panel opens over the report with no pause treatment.
//
// Exits non-zero on any failed assertion or page error.
// Usage: node tools/pause-probe.mjs

import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'vite';
import puppeteer from 'puppeteer';

const SIM_DT = 1 / 60; // mirror of src/sim/movement.ts (dt-clamp assertion)
const SHOT_DIR = path.join(process.cwd(), 'shots', 'pause-r1');

const failures = [];
let checks = 0;
function check(name, cond, detail = '') {
  checks++;
  if (cond) console.log(`  PASS ${name}${detail ? ` (${detail})` : ''}`);
  else {
    failures.push(name + (detail ? ` — ${detail}` : ''));
    console.error(`  FAIL ${name}${detail ? ` (${detail})` : ''}`);
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = await createServer({
  root: process.cwd(),
  logLevel: 'error',
  // own 7xxx port band (never 5001/5002); hmr/watch OFF so a mid-run source
  // save can never hot-reload the page under the assertions.
  server: {
    port: 7400 + Math.floor(Math.random() * 300),
    strictPort: false,
    hmr: false,
    watch: null,
  },
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
console.log(`[pause-probe] vite up at ${url}`);

const browser = await puppeteer.launch({
  headless: 'new',
  args: [
    '--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage',
    // the duck assertions read scheduled AudioParam values — the context
    // must actually RUN in headless for setValueAtTime pins to land
    '--autoplay-policy=no-user-gesture-required',
  ],
});

const width = 1600;
const height = 900;
const page = await browser.newPage();
await page.setViewport({ width, height, deviceScaleFactor: 1 });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('favicon')) pageErrors.push(m.text());
});
await page.evaluateOnNewDocument(() => {
  // easy bots — the probe must never be decided by how hard the AI shoots back
  try { localStorage.setItem('cot.settings.v1', JSON.stringify({ aiDifficulty: 'easy' })); } catch (_) {}
});

// in-page helpers (serializable snapshots only)
const snap = () => page.evaluate(() => {
  const g = window.__DEBUG.game;
  return {
    t: performance.now(),
    phase: g.phase,
    timeS: g.timeS,
    shells: g.shells.length,
    poses: g.tanks
      .filter((e) => e.state)
      .map((e) => [e.id, e.state.pos.x, e.state.pos.y, e.state.pos.z, e.state.yaw, e.state.turretYaw]),
  };
});
const pauseState = () => page.evaluate(() => ({
  open: window.__DEBUG.settings.isOpen(),
  paused: window.__DEBUG.pauseInfo.paused,
  resumes: window.__DEBUG.pauseInfo.resumes,
  lastResumeDtR: window.__DEBUG.pauseInfo.lastResumeDtR,
  pausedClass: document.querySelector('.cot-settings').classList.contains('paused'),
  tagVisible: (() => {
    const el = document.querySelector('.cot-set-paused');
    return !!el && getComputedStyle(el).display !== 'none';
  })(),
  phase: window.__DEBUG.game.phase,
  locked: window.__DEBUG.input.isLocked(),
}));
const busGains = () => page.evaluate(() =>
  (window.__COT_AUDIO && window.__COT_AUDIO.ctx) ? window.__COT_AUDIO.busGains() : null);
async function pollBus(name, test, timeoutMs = 2500) {
  let g = null;
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    g = await busGains();
    if (g && test(g)) return { ok: true, g };
    await sleep(150);
  }
  return { ok: false, g };
}
const maxDisp = (a, b) => {
  const byId = new Map(a.poses.map((p) => [p[0], p]));
  let worst = 0;
  for (const p of b.poses) {
    const q = byId.get(p[0]);
    if (!q) continue;
    const d = Math.hypot(p[1] - q[1], p[3] - q[3]);
    if (d > worst) worst = d;
  }
  return worst;
};

try {
  console.log('\n[pause-probe] === boot + battle entry ===');
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 90000 });
  await sleep(1200);

  const btn = await page.evaluate(() => {
    const r = document.querySelector('.cot-battle').getBoundingClientRect();
    return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
  });
  await page.mouse.click(btn.cx, btn.cy);
  let phase = 'garage';
  try {
    await page.waitForFunction('window.__DEBUG.game.phase === "battle"', { timeout: 20000 });
    await page.waitForFunction('!document.querySelector(".cot-bl.on")', { timeout: 20000 });
    phase = 'battle';
  } catch (_) {
    phase = await page.evaluate(() => window.__DEBUG.game.phase);
  }
  check('BATTLE click enters battle', phase === 'battle', `phase=${phase}`);
  if (phase !== 'battle') throw new Error('no battle — aborting');
  // Player entry now holds the simulation behind a visible five-second
  // countdown. Pause semantics begin at rollout, not while the roster is
  // intentionally frozen.
  await page.waitForFunction('window.__DEBUG.game.preBattleS <= 0', { timeout: 12000 });
  await sleep(600); // first live simulation beats after rollout

  // audio context + pointer lock via a real canvas click (the gesture path)
  await page.mouse.click(Math.round(width / 2), Math.round(height * 0.55));
  await sleep(700);
  const g0 = await busGains();
  check('audio context up (engine bus at battle level)', !!g0 && g0.engine > 0.5,
    g0 ? `engine=${g0.engine.toFixed(3)} pauseK=${g0.pauseK}` : 'no ctx');

  // live sim sanity: the battle clock and at least one hull actually move
  const m0 = await snap();
  await sleep(800);
  const m1 = await snap();
  check('sim is live before pause', m1.timeS > m0.timeS + 0.4 && maxDisp(m0, m1) > 0.05,
    `dt=${(m1.timeS - m0.timeS).toFixed(2)}s maxDisp=${maxDisp(m0, m1).toFixed(2)}m`);

  console.log('\n[pause-probe] === Esc pauses ===');
  await page.keyboard.press('Escape');
  await page.waitForFunction('window.__DEBUG.settings.isOpen()', { timeout: 2500 });
  await page.waitForFunction('window.__DEBUG.pauseInfo.paused === true', { timeout: 2500 });
  let st = await pauseState();
  check('Esc opens the settings overlay mid-battle', st.open);
  check('overlay pause gate engaged', st.paused);
  check('PAUSED tag shown (battle style)', st.pausedClass && st.tagVisible,
    `class=${st.pausedClass} tag=${st.tagVisible}`);
  const duck = await pollBus('duck', (g) => g.engine < 0.1 && g.sfx < 0.1);
  check('engine+combat buses ducked to near-silence', duck.ok,
    duck.g ? `engine=${duck.g.engine.toFixed(3)} sfx=${duck.g.sfx.toFixed(3)}` : 'no ctx');
  check('UI/music bus stays up while paused', !!duck.g && duck.g.music > 0.5,
    duck.g ? `music=${duck.g.music.toFixed(3)}` : 'no ctx');

  // FREEZE: 3 s of wall time, zero sim advancement
  const s1 = await snap();
  await sleep(3000);
  const s2 = await snap();
  check('battle clock frozen across 3s', s2.timeS === s1.timeS,
    `timeS ${s1.timeS.toFixed(3)} -> ${s2.timeS.toFixed(3)}`);
  check('every tank pose frozen across 3s',
    JSON.stringify(s1.poses) === JSON.stringify(s2.poses),
    `maxDisp=${maxDisp(s1, s2).toFixed(4)}m over ${Math.round(s2.t - s1.t)}ms`);
  check('no shells advanced/spawned while paused', s2.shells === s1.shells,
    `shells ${s1.shells} -> ${s2.shells}`);

  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const shotPath = path.join(SHOT_DIR, 'paused-overlay.png');
  await page.screenshot({ path: shotPath });
  console.log(`  shot: ${shotPath}`);

  console.log('\n[pause-probe] === Esc resumes ===');
  await page.keyboard.press('Escape');
  await page.waitForFunction('!window.__DEBUG.settings.isOpen()', { timeout: 2500 });
  await page.waitForFunction('window.__DEBUG.pauseInfo.paused === false', { timeout: 1500 });
  const s3 = await snap(); // first live sample right after the resume edge
  st = await pauseState();
  check('resume within a frame of closing', !st.open && !st.paused);
  check('resume dt clamped (first frame <= SIM_DT)',
    st.resumes >= 1 && st.lastResumeDtR > 0 && st.lastResumeDtR <= SIM_DT + 1e-9,
    `resumes=${st.resumes} lastResumeDtR=${(st.lastResumeDtR * 1000).toFixed(2)}ms`);
  check('no teleport on resume (paused 3s never integrated)',
    maxDisp(s2, s3) < 4 && s3.timeS - s2.timeS < 0.5,
    `maxDisp=${maxDisp(s2, s3).toFixed(2)}m simDt=${(s3.timeS - s2.timeS).toFixed(3)}s ` +
    `over ${Math.round(s3.t - s2.t)}ms wall`);
  await sleep(800);
  const s4 = await snap();
  check('sim advances again after resume', s4.timeS > s3.timeS + 0.4,
    `timeS +${(s4.timeS - s3.timeS).toFixed(2)}s`);
  const rest = await pollBus('restore', (g) => g.engine > 0.5 && g.pauseK === 1);
  check('audio buses restore on resume', rest.ok,
    rest.g ? `engine=${rest.g.engine.toFixed(3)} pauseK=${rest.g.pauseK}` : 'no ctx');

  // pointer lock re-acquire: close-relock or the canvas-click retry path
  let relock = await pauseState();
  let relockPath = 'relocked on close';
  if (!relock.locked) {
    relockPath = 'canvas click retry';
    await page.mouse.click(Math.round(width / 2), Math.round(height * 0.55));
    for (let i = 0; i < 10 && !relock.locked; i++) {
      await sleep(200);
      relock = await pauseState();
    }
  }
  check('pointer lock re-engages after resume', relock.locked, relockPath);

  console.log('\n[pause-probe] === Leave Battle from pause ===');
  await page.keyboard.press('Escape');
  await page.waitForFunction('window.__DEBUG.pauseInfo.paused === true', { timeout: 2500 });
  const leave = await page.evaluate(() => {
    const b = document.querySelector('.cot-set-btn.leave');
    if (!b || b.offsetParent === null) return null;
    const r = b.getBoundingClientRect();
    return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
  });
  check('Leave Battle row present on the paused overlay', !!leave);
  if (leave) {
    const leaveStartedAt = performance.now();
    await page.mouse.click(leave.cx, leave.cy);
    await page.waitForFunction('window.__DEBUG.game.phase === "garage"', { timeout: 15000 });
    const leaveElapsedMs = performance.now() - leaveStartedAt;
    st = await pauseState();
    check('leave-battle from pause lands in the garage',
      st.phase === 'garage' && !st.open && !st.paused && !st.pausedClass,
      `phase=${st.phase} open=${st.open} paused=${st.paused}`);
    check('leave-battle remains responsive on a cold return', leaveElapsedMs < 12000,
      `${Math.round(leaveElapsedMs)}ms`);
    const gRest = await pollBus('garage-restore', (g) => g.engine > 0.5 && g.pauseK === 1);
    check('pause duck cleared on leave-battle', gRest.ok,
      gRest.g ? `engine=${gRest.g.engine.toFixed(3)} pauseK=${gRest.g.pauseK}` : 'no ctx');
  }

  console.log('\n[pause-probe] === garage Esc unchanged ===');
  await page.keyboard.press('Escape');
  await page.waitForFunction('window.__DEBUG.settings.isOpen()', { timeout: 2500 });
  st = await pauseState();
  const gGar = await busGains();
  check('garage Esc still opens settings', st.open && st.phase === 'garage');
  check('no pause concept in the garage', !st.paused && !st.pausedClass && !st.tagVisible,
    `paused=${st.paused} class=${st.pausedClass} tag=${st.tagVisible}`);
  check('no audio duck in the garage', !!gGar && gGar.pauseK === 1 && gGar.engine > 0.5,
    gGar ? `engine=${gGar.engine.toFixed(3)} pauseK=${gGar.pauseK}` : 'no ctx');
  await page.keyboard.press('Escape');
  await page.waitForFunction('!window.__DEBUG.settings.isOpen()', { timeout: 2500 });
  check('garage Esc closes settings again', true);

  console.log('\n[pause-probe] === end-overlay Esc unchanged ===');
  await page.evaluate(() => window.__DEBUG.startBattle('m1a2'));
  await page.waitForFunction('window.__DEBUG.game.phase === "battle"', { timeout: 10000 });
  await sleep(600); // a few live ticks
  await page.evaluate(() => window.__DEBUG.slayEnemies());
  let endUp = false;
  try {
    await page.waitForFunction(
      () => window.__DEBUG.game.result === 'victory' &&
        document.querySelector('.cot-es')?.classList.contains('show'),
      { timeout: 20000 });
    endUp = true;
  } catch (_) { /* fall through to the check */ }
  check('end overlay shows after victory', endUp);
  if (endUp) {
    await page.keyboard.press('Escape');
    await page.waitForFunction('window.__DEBUG.settings.isOpen()', { timeout: 2500 });
    st = await pauseState();
    const gEnd = await busGains();
    check('end-overlay Esc opens settings WITHOUT pause treatment',
      st.open && !st.paused && !st.pausedClass,
      `paused=${st.paused} class=${st.pausedClass}`);
    check('no pause duck over the end overlay', !!gEnd && gEnd.pauseK === 1,
      gEnd ? `pauseK=${gEnd.pauseK}` : 'no ctx');
    await page.keyboard.press('Escape');
    await page.waitForFunction('!window.__DEBUG.settings.isOpen()', { timeout: 2500 });
  }

  check('no page errors', pageErrors.length === 0,
    pageErrors.slice(0, 3).join(' | ') || 'clean');
} catch (err) {
  failures.push(`CRASHED: ${err.message}`);
  console.error(`[pause-probe] CRASHED: ${err.stack || err.message}`);
} finally {
  await browser.close();
  await server.close();
}

console.log(`\n[pause-probe] ${checks} checks, ${failures.length} failures`);
for (const f of failures) console.error(`  FAILED: ${f}`);
process.exit(failures.length ? 1 : 0);
