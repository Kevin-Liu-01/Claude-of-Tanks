// tools/aimflow-probe.mjs — GUNNERY r1 aim-flow regression gate.
//
// Owner-reported regressions this guards (2026-07-31):
//  1. Camera/aim coupling — THE SPEC IS THE DEPLOYED BUILD
//     (https://claude-of-tanks.vercel.app, characterized by
//     tools/aim-parity-probe.mjs): pointer-lock mouselook pans the camera and
//     the gun converges onto the reticle; the camera translates with the hull
//     but never rotates with it. In CURSOR-AIM mode (pointer lock denied —
//     embedded panes) the turret chases the cursor ray while the camera stays
//     parked (classic). The actual dead-mouse regression in narrow panes was
//     input.js isTouchLayout() reclassifying <=900 px windows as touch.
//  2. Scroll-zoom sky fling — the aim pitch is PRESERVED bidirectionally
//     across every zoom step and the arcade<->sniper boundary once the player
//     has aimed: enter battle, set a mid pitch, scroll to max sniper and back —
//     the measured view pitch never jumps more than ~1 deg at any step, and
//     repeated close-aim scope cycles never ratchet the pitch upward (the old
//     entry scan-lift + keep-pitch exit climbed to PITCH_MAX = sky).
//     The never-aimed battle opening keeps the gameplay_feel r4 dirt-guard.
//  3. Dedicated Caps Lock free-look moves the camera while the aim/turret stay put,
//     independent of the selected RMB mode. RMB aiming (settings rmbMode):
//     'hold' (default) enters sniper while held
//     and restores the prior arcade orbit + pitch on release; 'toggle' taps
//     like Shift; 'freelook' keeps the classic gun-lock free look.
//
// Evidence frames land in shots/gunnery-r1/. Exits non-zero on any failure.
// Usage: node tools/aimflow-probe.mjs
import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';

const failures = [];
let checks = 0;
function check(mode, name, cond, detail = '') {
  checks++;
  const tag = `[${mode}] ${name}`;
  if (cond) console.log(`  PASS ${tag}${detail ? ` (${detail})` : ''}`);
  else {
    failures.push(tag + (detail ? ` — ${detail}` : ''));
    console.error(`  FAIL ${tag}${detail ? ` (${detail})` : ''}`);
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const deg = (r) => r * 180 / Math.PI;

const SHOT_DIR = new URL('../shots/gunnery-r1/', import.meta.url).pathname;
mkdirSync(SHOT_DIR, { recursive: true });

const server = await createServer({
  root: process.cwd(),
  logLevel: 'error',
  server: {
    port: 7300 + Math.floor(Math.random() * 400),
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
console.log(`[aimflow-probe] vite up at ${url}`);

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
});

/** Boot one page; stubNoLock forces the cursor-aim fallback. */
async function boot({ stubNoLock }) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('favicon')) pageErrors.push(m.text());
  });
  await page.evaluateOnNewDocument((stub) => {
    try { localStorage.setItem('cot.settings.v1', JSON.stringify({ aiDifficulty: 'easy' })); } catch (_) { /* private */ }
    if (stub) {
      Element.prototype.requestPointerLock = function () {
        throw new DOMException('no lock here', 'SecurityError');
      };
      document.exitPointerLock = () => {};
    }
  }, stubNoLock);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });
  await sleep(1200);
  return { page, pageErrors };
}

/** Camera/rig/aim snapshot (world-direction yaw/pitch + reticle point). */
const view = (page) => page.evaluate(() => {
  const D = window.__DEBUG;
  const dir = new (Object.getPrototypeOf(D.camera.position).constructor)();
  D.camera.getWorldDirection(dir);
  const p = D.game.player;
  return {
    mode: D.rig.mode,
    zoom: D.rig.zoom,
    fov: D.camera.fov,
    camYaw: Math.atan2(dir.x, dir.z),
    camPitch: Math.asin(Math.max(-1, Math.min(1, dir.y))),
    camPos: [D.camera.position.x, D.camera.position.y, D.camera.position.z],
    aimPoint: [D.rig.aimPoint.x, D.rig.aimPoint.y, D.rig.aimPoint.z],
    aimDist: D.rig.aimDist,
    hullYaw: p.state.yaw,
    turretYaw: p.state.turretYaw,
    gunPitch: p.state.gunPitch,
    locked: D.input.isLocked(),
    cursorAim: D.input.isCursorAim(),
  };
});

// ===========================================================================
// LOCK mode: camera-follow, pitch ladder, ratchet, dirt-guard, RMB modes
// ===========================================================================
{
  const mode = 'lock';
  console.log(`\n[aimflow-probe] === ${mode} mode ===`);
  const { page, pageErrors } = await boot({ stubNoLock: false });

  await page.evaluate(() => window.__DEBUG.startBattle('m1a2'));
  await sleep(500);
  await page.evaluate(() => window.__DEBUG.fastForward(2));
  await page.mouse.click(800, 450);
  await sleep(600);
  check(mode, 'pointer lock engaged', await page.evaluate(() => window.__DEBUG.input.isLocked()));

  // --- 1. camera follows mouse-look; gun converges to the reticle ---------
  const f0 = await view(page);
  for (let i = 0; i < 10; i++) {
    await page.mouse.move(800 + (i + 1) * 40, 450, { steps: 1 });
    await sleep(20);
  }
  await sleep(400);
  const f1 = await view(page);
  const dYaw = wrap(f1.camYaw - f0.camYaw);
  check(mode, 'mouse-look pans the camera yaw', Math.abs(deg(dYaw)) > 20,
    `dYaw=${deg(dYaw).toFixed(1)} deg for +400 px`);
  await sleep(2400); // real traverse: let the gun converge
  const f2 = await view(page);
  const gunYawW = wrap(f2.hullYaw + f2.turretYaw);
  const followErr = Math.abs(deg(wrap(gunYawW - f2.camYaw)));
  check(mode, 'gun converges onto the camera reticle', followErr < 6,
    `gun-vs-camera yaw err ${followErr.toFixed(2)} deg`);
  await page.screenshot({ path: `${SHOT_DIR}${mode}-01-camera-follows-aim.png` });

  // --- 2a. pitch ladder: mid pitch preserved through the full zoom ladder --
  // Aim near the horizon (a genuine mid pitch onto far terrain), then scroll
  // arcade -> max sniper -> arcade. Per-step view pitch must never jump more
  // than ~1 deg (small parallax between the orbit camera and the trunnion is
  // legitimate; the old entry lift jumped 8.5 deg and could hit +30 deg).
  await page.evaluate(() => {
    const D = window.__DEBUG;
    D.rig.snapArcade(2, D.game.player.state.yaw, -10 * Math.PI / 180);
  });
  await sleep(200);
  // mouse-up sweep (each step its own frame — paired up/down moves inside one
  // frame cancel in the accumulator and never mark aimTouched): raise the
  // pitch until the aim ray lands 150-650 m out on TERRAIN, checking every
  // step so the sweep can't overshoot past the horizon into the sky, then
  // let the aim-smoothing tail settle before the first ladder sample.
  await page.mouse.move(800, 700, { steps: 1 });
  await sleep(60);
  for (let i = 0; i < 60; i++) {
    await page.mouse.move(800, 700 - (i + 1) * 8, { steps: 1 });
    await sleep(30);
    const v = await view(page);
    if (v.aimDist > 150 && v.aimDist < 650) break;
    if (v.camPitch > 0.1) break; // don't chase past the horizon
  }
  await sleep(600);
  const ladder = [await view(page)];
  check(mode, 'ladder scenario aims 150+ m out on terrain',
    ladder[0].aimDist > 150 && ladder[0].aimDist < 700,
    `aimDist=${ladder[0].aimDist.toFixed(0)} m, pitch=${deg(ladder[0].camPitch).toFixed(2)} deg`);
  // Per-step assertion (owner spec): the reticle WORLD POINT before a step is
  // preserved across it — the measured pitch must match the pitch of the ray
  // from the step's NEW camera position to the step's PREVIOUS aim point
  // (pure preservation would make the error 0; the tolerance absorbs frame
  // noise). Comparing raw pitch-vs-previous-pitch would false-fail honest
  // retargets: a live bot crossing the sight line legitimately pulls the
  // reticle (and the preserved point) nearer — WoT keeps the reticle on the
  // tank, and so do we.
  const LADDER_TOL_DEG = 1.25;
  let maxStepErr = 0;
  const stepOnce = async (dir, label) => {
    await page.mouse.wheel({ deltaY: dir > 0 ? -120 : 120 });
    await sleep(320);
    const v = await view(page);
    const prev = ladder[ladder.length - 1];
    const wantPitch = Math.atan2(
      prev.aimPoint[1] - v.camPos[1],
      Math.hypot(prev.aimPoint[0] - v.camPos[0], prev.aimPoint[2] - v.camPos[2]));
    const err = Math.abs(deg(v.camPitch - wantPitch));
    if (err > maxStepErr) maxStepErr = err;
    ladder.push(v);
    console.log(`    ${label}: mode=${v.mode} fov=${v.fov.toFixed(1)} ` +
      `pitch=${deg(v.camPitch).toFixed(2)} deg aim=${v.aimDist.toFixed(0)} m ` +
      `(preserved-point err ${err.toFixed(2)} deg)`);
  };
  for (let i = 0; i < 9; i++) await stepOnce(1, `in ${i + 1}`);
  await page.screenshot({ path: `${SHOT_DIR}${mode}-02-ladder-max-sniper.png` });
  for (let i = 0; i < 9; i++) await stepOnce(-1, `out ${i + 1}`);
  const first = ladder[0];
  const last = ladder[ladder.length - 1];
  check(mode, `reticle point preserved at every zoom step (pitch err <= ${LADDER_TOL_DEG} deg)`,
    maxStepErr <= LADDER_TOL_DEG, `max preserved-point pitch err ${maxStepErr.toFixed(2)} deg`);
  check(mode, 'no upward sky ratchet across the ladder',
    deg(last.camPitch - first.camPitch) <= 2,
    `${deg(first.camPitch).toFixed(2)} -> ${deg(last.camPitch).toFixed(2)} deg`);
  check(mode, 'no sky fling (aim still on terrain)', last.aimDist < 719,
    `aimDist=${last.aimDist.toFixed(0)} m`);
  await page.screenshot({ path: `${SHOT_DIR}${mode}-03-ladder-back-arcade.png` });

  // --- 2b. close-aim scope cycles must not ratchet the pitch upward -------
  // Aim DOWN at close ground (a deliberate close-quarters aim), then cycle
  // sniper in/out three times. The old code lifted to >= -1.5 deg on every
  // entry and kept the lift on exit: +8.5 deg after one cycle, sky-bound on
  // rising ground. Preserved aim = pitch comes back every time.
  await page.evaluate(() => {
    const D = window.__DEBUG;
    D.rig.snapArcade(2, D.game.player.state.yaw, -10 * Math.PI / 180);
  });
  await sleep(200);
  // mouse-down sweep (real per-frame deltas): push the aim onto close ground
  await page.mouse.move(800, 300, { steps: 1 });
  await sleep(60);
  for (let i = 0; i < 20; i++) {
    await page.mouse.move(800, 300 + (i + 1) * 12, { steps: 1 });
    await sleep(25);
    if (i % 4 === 3) {
      const v = await view(page);
      if (v.aimDist < 42) break;
    }
  }
  await sleep(300);
  const c0 = await view(page);
  check(mode, 'ratchet scenario aims close (<50 m)', c0.aimDist < 50,
    `aimDist=${c0.aimDist.toFixed(1)} m, pitch=${deg(c0.camPitch).toFixed(2)} deg`);
  for (let cyc = 0; cyc < 3; cyc++) {
    await page.keyboard.press('ShiftLeft');
    await sleep(350);
    await page.keyboard.press('ShiftLeft');
    await sleep(350);
  }
  const c1 = await view(page);
  const ratchet = deg(c1.camPitch - c0.camPitch);
  check(mode, 'three scope cycles do not ratchet the pitch', Math.abs(ratchet) <= 2,
    `pitch drift ${ratchet.toFixed(2)} deg over 3 cycles (was +8.5 deg on cycle 1)`);

  // --- 2c. never-aimed battle opening keeps the dirt-guard ----------------
  await page.evaluate(() => {
    const D = window.__DEBUG;
    D.rig.snapArcade(2, D.game.player.state.yaw, -10 * Math.PI / 180); // resets aimTouched
  });
  await sleep(250);
  const d0 = await view(page);
  await page.keyboard.press('ShiftLeft');
  await sleep(350);
  const d1 = await view(page);
  check(mode, 'never-aimed scope entry still scan-lifts off the dirt',
    d0.aimDist < 50 ? d1.camPitch > d0.camPitch + 0.05 : true,
    `pitch ${deg(d0.camPitch).toFixed(2)} -> ${deg(d1.camPitch).toFixed(2)} deg (aim was ${d0.aimDist.toFixed(0)} m)`);
  await page.keyboard.press('ShiftLeft');
  await sleep(350);

  // --- 3. RMB modes ---------------------------------------------------------
  // hold (default): hold enters sniper, release restores arcade + pitch
  await page.evaluate(() => {
    const D = window.__DEBUG;
    D.rig.snapArcade(2, D.game.player.state.yaw, -10 * Math.PI / 180);
  });
  await sleep(200);
  await page.mouse.move(800, 560, { steps: 1 }); // set a deliberate mid pitch
  await sleep(60);
  for (let i = 0; i < 8; i++) {
    await page.mouse.move(800, 560 - (i + 1) * 10, { steps: 1 });
    await sleep(25);
  }
  await sleep(300);
  const h0 = await view(page);
  await page.mouse.down({ button: 'right' });
  await sleep(420);
  const h1 = await view(page);
  check(mode, 'RMB hold enters sniper (hold-to-aim default)',
    h1.mode === 'SNIPER' && h1.fov < 40, `mode=${h1.mode} fov=${h1.fov.toFixed(1)}`);
  await page.screenshot({ path: `${SHOT_DIR}${mode}-04-rmb-hold-aim.png` });
  await page.mouse.up({ button: 'right' });
  await sleep(420);
  const h2 = await view(page);
  check(mode, 'RMB release restores arcade', h2.mode === 'ARCADE' && h2.fov > 50,
    `mode=${h2.mode} fov=${h2.fov.toFixed(1)}`);
  check(mode, 'RMB release preserves the aim pitch',
    Math.abs(deg(h2.camPitch - h0.camPitch)) <= 1.25,
    `pitch ${deg(h0.camPitch).toFixed(2)} -> ${deg(h2.camPitch).toFixed(2)} deg`);
  await page.screenshot({ path: `${SHOT_DIR}${mode}-05-rmb-released.png` });

  // toggle mode
  await page.evaluate(() => window.__DEBUG.input.setSetting('rmbMode', 'toggle'));
  await page.mouse.down({ button: 'right' });
  await sleep(80);
  await page.mouse.up({ button: 'right' });
  await sleep(420);
  const t1 = await view(page);
  check(mode, "rmbMode 'toggle': tap enters sniper", t1.mode === 'SNIPER',
    `mode=${t1.mode} fov=${t1.fov.toFixed(1)}`);
  await page.mouse.down({ button: 'right' });
  await sleep(80);
  await page.mouse.up({ button: 'right' });
  await sleep(420);
  const t2 = await view(page);
  check(mode, "rmbMode 'toggle': tap again exits", t2.mode === 'ARCADE',
    `mode=${t2.mode} fov=${t2.fov.toFixed(1)}`);

  // Dedicated free-look: remains available while RMB is still the default
  // hold-to-aim control. Shift is deliberately not involved (sniper toggle).
  await page.evaluate(() => window.__DEBUG.input.setSetting('rmbMode', 'hold'));
  const caps0 = await view(page);
  await page.keyboard.down('CapsLock');
  await sleep(120);
  for (let i = 0; i < 6; i++) {
    await page.mouse.move(800 - (i + 1) * 40, 450, { steps: 1 });
    await sleep(20);
  }
  await sleep(300);
  const caps1 = await view(page);
  check(mode, 'Caps Lock hold free-looks independently of RMB mode',
    Math.abs(deg(wrap(caps1.camYaw - caps0.camYaw))) > 8,
    `dYaw=${deg(wrap(caps1.camYaw - caps0.camYaw)).toFixed(1)} deg`);
  const capsAimFrozen = Math.hypot(
    caps1.aimPoint[0] - caps0.aimPoint[0], caps1.aimPoint[2] - caps0.aimPoint[2]);
  check(mode, 'Caps Lock hold keeps the aim point and turret frozen', capsAimFrozen < 1,
    `aim point moved ${capsAimFrozen.toFixed(2)} m`);
  await page.screenshot({ path: `${SHOT_DIR}${mode}-04-caps-freelook.png` });
  await page.keyboard.up('CapsLock');
  await sleep(400);
  const caps2 = await view(page);
  check(mode, 'Caps Lock release snaps the camera back to the aim',
    Math.abs(deg(wrap(caps2.camYaw - caps0.camYaw))) < 2,
    `dYaw after release ${deg(wrap(caps2.camYaw - caps0.camYaw)).toFixed(2)} deg`);

  // freelook (classic): camera moves, aim/turret frozen, snap back on release
  await page.evaluate(() => window.__DEBUG.input.setSetting('rmbMode', 'freelook'));
  await sleep(100);
  const fl0 = await view(page);
  await page.mouse.down({ button: 'right' });
  await sleep(120);
  for (let i = 0; i < 6; i++) {
    await page.mouse.move(800 + (i + 1) * 40, 450, { steps: 1 });
    await sleep(20);
  }
  await sleep(300);
  const fl1 = await view(page);
  check(mode, "rmbMode 'freelook': RMB drag free-looks the camera",
    Math.abs(deg(wrap(fl1.camYaw - fl0.camYaw))) > 8,
    `dYaw=${deg(wrap(fl1.camYaw - fl0.camYaw)).toFixed(1)} deg`);
  const aimFrozen = Math.hypot(
    fl1.aimPoint[0] - fl0.aimPoint[0], fl1.aimPoint[2] - fl0.aimPoint[2]);
  check(mode, "rmbMode 'freelook': aim point stays frozen while held", aimFrozen < 1,
    `aim point moved ${aimFrozen.toFixed(2)} m`);
  await page.mouse.up({ button: 'right' });
  await sleep(400);
  const fl2 = await view(page);
  check(mode, "rmbMode 'freelook': release snaps back to the aim",
    Math.abs(deg(wrap(fl2.camYaw - fl0.camYaw))) < 2,
    `dYaw after release ${deg(wrap(fl2.camYaw - fl0.camYaw)).toFixed(2)} deg`);
  await page.evaluate(() => window.__DEBUG.input.setSetting('rmbMode', 'hold'));

  check(mode, 'no page errors', pageErrors.length === 0,
    pageErrors.slice(0, 3).join(' | ') || 'clean');
  await page.close();
}

// ===========================================================================
// NO-LOCK (cursor-aim) mode: camera follows the gun + RMB hold still aims
// ===========================================================================
{
  const mode = 'no-lock';
  console.log(`\n[aimflow-probe] === ${mode} mode (cursor-aim fallback) ===`);
  const { page, pageErrors } = await boot({ stubNoLock: true });

  await page.evaluate(() => window.__DEBUG.startBattle('m1a2'));
  await sleep(500);
  await page.evaluate(() => window.__DEBUG.fastForward(2));
  await page.mouse.click(800, 450); // latches the cursor-aim denial
  await sleep(600);
  check(mode, 'cursor-aim fallback active', await page.evaluate(() =>
    window.__DEBUG.input.isCursorAim()));

  // CLASSIC cursor-aim contract (matches the committed/deployed build — the
  // owner's Vercel deployment is the coupling spec): the turret chases the
  // terrain point under the real cursor while the CAMERA STAYS PARKED behind
  // the tank (no camera-follow scheme; owner course-correction 2026-07-31).
  const g0 = await view(page);
  await page.mouse.move(1360, 400, { steps: 8 });
  await sleep(3200); // turret traverse window
  const g1 = await view(page);
  const camSwing = deg(wrap(g1.camYaw - g0.camYaw));
  const gunSwing = deg(wrap((g1.hullYaw + g1.turretYaw) - (g0.hullYaw + g0.turretYaw)));
  check(mode, 'turret slews toward the cursor', Math.abs(gunSwing) > 8,
    `gun swing ${gunSwing.toFixed(1)} deg`);
  check(mode, 'camera stays parked (classic cursor-aim, deployed spec)',
    Math.abs(camSwing) < 2,
    `camera swing ${camSwing.toFixed(1)} deg while gun swung ${gunSwing.toFixed(1)} deg`);
  await page.screenshot({ path: `${SHOT_DIR}${mode}-01-cursor-aim-classic.png` });
  await page.mouse.move(800, 450, { steps: 8 });
  await sleep(1200);

  // RMB hold-to-aim works without pointer lock too
  await page.mouse.down({ button: 'right' });
  await sleep(420);
  const n1 = await view(page);
  check(mode, 'RMB hold enters sniper in cursor-aim', n1.mode === 'SNIPER' && n1.fov < 40,
    `mode=${n1.mode} fov=${n1.fov.toFixed(1)}`);
  await page.mouse.up({ button: 'right' });
  await sleep(420);
  const n2 = await view(page);
  check(mode, 'RMB release restores arcade in cursor-aim', n2.mode === 'ARCADE' && n2.fov > 50,
    `mode=${n2.mode} fov=${n2.fov.toFixed(1)}`);

  check(mode, 'no page errors', pageErrors.length === 0,
    pageErrors.slice(0, 3).join(' | ') || 'clean');
  await page.close();
}

await browser.close();
await server.close();

console.log(`\n[aimflow-probe] ${checks} checks, ${failures.length} failures`);
for (const f of failures) console.error(`  FAILED: ${f}`);
process.exit(failures.length ? 1 : 0);
