// tools/controls-probe.mjs — controls regression gate: BATTLE entry + both
// aim-input paths (pointer-lock mouselook AND the cursor-aim fallback).
//
// Runs the game twice in headless Chromium (vite + puppeteer, same pattern as
// tools/screenshot.mjs):
//
//   NO-LOCK mode — Element.prototype.requestPointerLock is stubbed to throw a
//   synchronous SecurityError (what sandboxed iframes / embedded panes do) and
//   the viewport is 768px wide (the pane width where the settings gear used to
//   sit exactly on the BATTLE button). Asserts: the BATTLE button is actually
//   hit-testable at its center, a REAL DOM click enters battle, the one-time
//   "cursor aim" toast shows, mouse movement slews the turret onto the terrain
//   point under the cursor at real traverse speed, LMB fires a shell in the
//   reticle direction, RMB toggles sniper (FOV), A/D turn the hull, W drives.
//
//   LOCK mode — no stub; headless Chromium grants the lock. Same battle-entry
//   and combat assertions through the classic pointer-lock path, plus lock
//   actually engaging and the toast NOT appearing (no fallback regression).
//
// A garage BATTLE click must never latch a fire edge in either mode (asserted
// as zero player shells before the first deliberate battle click).
//
// Exits non-zero on any failed assertion or page error.
// Usage: node tools/controls-probe.mjs

import { createServer } from 'vite';
import puppeteer from 'puppeteer';

const failures = [];
let checks = 0;
function check(mode, name, cond, detail = '') {
  checks++;
  const tag = `[${mode}] ${name}`;
  if (cond) {
    console.log(`  PASS ${tag}${detail ? ` (${detail})` : ''}`);
  } else {
    failures.push(tag + (detail ? ` — ${detail}` : ''));
    console.error(`  FAIL ${tag}${detail ? ` (${detail})` : ''}`);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

const server = await createServer({
  root: process.cwd(),
  logLevel: 'error',
  // hmr/watch OFF: a critique-loop agent saving any src file mid-run would
  // otherwise hot-reload the page, wiping the probe's instrumentation and the
  // battle state under our feet (observed: __PROBE vanished mid-assertions).
  server: {
    port: 5300 + Math.floor(Math.random() * 600),
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
console.log(`[controls-probe] vite up at ${url}`);

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
});

/** Boot one game page; returns { page, pageErrors }. */
async function boot(mode, { stubNoLock, width, height }) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('favicon')) pageErrors.push(m.text());
  });
  await page.evaluateOnNewDocument((stub) => {
    // easy bots: the probe must never be decided by how hard the AI shoots back
    try { localStorage.setItem('cot.settings.v1', JSON.stringify({ aiDifficulty: 'easy' })); } catch (_) {}
    if (stub) {
      Element.prototype.requestPointerLock = function () {
        throw new DOMException(
          'The root document of this element is not valid for pointer lock.',
          'SecurityError'
        );
      };
      document.exitPointerLock = () => {};
    }
  }, stubNoLock);
  for (let attempt = 0; ; attempt++) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await page.waitForFunction('window.__GAME_READY === true', { timeout: 90000 });
      break;
    } catch (err) {
      if (attempt >= 1) throw err;
      console.warn(`[${mode}] load attempt failed (${err.message}) — retrying`);
      pageErrors.length = 0;
    }
  }
  await sleep(1200);
  return { page, pageErrors };
}

/** Shared battle-entry + combat assertions for one mode. */
async function runMode(mode, { stubNoLock, width, height }) {
  console.log(`\n[controls-probe] === ${mode} mode (${width}x${height}) ===`);
  const { page, pageErrors } = await boot(mode, { stubNoLock, width, height });

  // --- default binds sanity ---------------------------------------------------
  // Desktop defaults are WoT-classic (Shift sniper, RMB free-look — see
  // input.js DEFAULT_BINDINGS). Sniper stays mouse-reachable in no-lock
  // environments through the main.js cursor-aim routing: RMB toggles sniper
  // whenever input.isCursorAim() — asserted behaviorally per mode below.
  const binds = await page.evaluate(() => window.__DEBUG.input.getBindings(0));
  check(mode, 'default bind LMB=fire', binds.fire === 'Mouse0', `fire=${binds.fire}`);
  check(mode, 'default bind Shift=sniper (desktop classic)', binds.sniperToggle === 'ShiftLeft',
    `sniperToggle=${binds.sniperToggle}`);
  check(mode, 'default binds WASD hull', binds.forward === 'KeyW' && binds.back === 'KeyS' &&
    binds.left === 'KeyA' && binds.right === 'KeyD');

  // --- BATTLE button is hit-testable at its center (gear-overlap regression)
  const btn = await page.evaluate(() => {
    const b = document.querySelector('.cot-battle');
    const r = b.getBoundingClientRect();
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
    const top = document.elementFromPoint(cx, cy);
    return { cx, cy, hit: !!top && top.classList.contains('cot-battle'), topEl: top ? top.className : 'none' };
  });
  check(mode, 'BATTLE button unobstructed at center', btn.hit, `top element: "${btn.topEl}"`);

  // instrument player shell events BEFORE entering battle; rig.aimPoint is
  // captured AT fire time — a post-hoc read races camera motion under lock
  await page.evaluate(() => {
    window.__PROBE = { fired: [] };
    window.__DEBUG.bus.on('shell:fired', (p) => {
      if (p.isPlayer) {
        const ap = window.__DEBUG.rig.aimPoint;
        window.__PROBE.fired.push({
          t: performance.now(),
          muzzlePos: p.muzzlePos.slice(),
          dir: p.dir.slice(),
          aimPoint: [ap.x, ap.y, ap.z],
        });
      }
    });
  });

  // --- battle entry via a REAL mouse click on the DOM button ----------------
  await page.mouse.click(btn.cx, btn.cy);
  // boot r9 loading flow: entry now runs a real loading screen (world build +
  // staged roster + countdown, ~10 s) — wait for the phase flip and for the
  // screen (.cot-bl.on) to clear instead of the old fixed 900 ms dwell.
  let phase = 'garage';
  try {
    await page.waitForFunction('window.__DEBUG.game.phase === "battle"', { timeout: 90000 });
    await page.waitForFunction('!document.querySelector(".cot-bl.on")', { timeout: 90000 });
    phase = 'battle';
  } catch (_) {
    phase = await page.evaluate(() => window.__DEBUG.game.phase);
  }
  check(mode, 'real BATTLE click enters battle', phase === 'battle', `phase=${phase}`);
  if (phase !== 'battle') { await page.close(); return; } // everything below needs a battle
  await sleep(800); // openBattle snap + first live frames
  // The entry-click gesture is long gone once the loading screen clears — a
  // real player's first battle click re-grabs the pointer; do the same.
  if (!stubNoLock) {
    const locked0 = await page.evaluate(() => window.__DEBUG.input.isLocked());
    if (!locked0) {
      await page.mouse.click(Math.round(width / 2), Math.round(height * 0.55));
      await sleep(500);
    }
  }

  // lock state + toast expectations differ per mode
  const lockState = await page.evaluate(() => ({
    locked: window.__DEBUG.input.isLocked(),
    cursorAim: window.__DEBUG.input.isCursorAim(),
    toast: !!document.querySelector('.cot-lock-toast'),
  }));
  if (stubNoLock) {
    check(mode, 'pointer lock denied -> cursor-aim active', !lockState.locked && lockState.cursorAim,
      `locked=${lockState.locked} cursorAim=${lockState.cursorAim}`);
    check(mode, 'one-time cursor-aim toast shown', lockState.toast);
  } else {
    check(mode, 'pointer lock engaged', lockState.locked && !lockState.cursorAim,
      `locked=${lockState.locked} cursorAim=${lockState.cursorAim}`);
    check(mode, 'no cursor-aim toast in lock mode', !lockState.toast);
  }

  // let the battle-open cinematic finish (3 s flyby) before aim assertions
  await sleep(3600);

  // --- garage click must not have discharged the gun ------------------------
  const preFired = await page.evaluate(() => window.__PROBE.fired.length);
  check(mode, 'no accidental shot from BATTLE click', preFired === 0, `fired=${preFired}`);

  // --- mouse movement slews the turret ---------------------------------------
  const aimX = Math.round(width * 0.72), aimY = Math.round(height * 0.42);
  const yaw0 = await page.evaluate(() => window.__DEBUG.game.player.state.turretYaw);
  if (stubNoLock) {
    await page.mouse.move(aimX, aimY, { steps: 12 }); // real cursor -> cursor-aim ray
  } else {
    // Locked mouselook: EVERY CDP move is a relative delta (Chromium diffs
    // consecutive synthetic positions), so sweep directly from the BATTLE
    // button position — parking at screen center first would inject a huge
    // downward delta, pitch the view into the ground at the tank's feet and
    // pin the gun on its depression clamp. Swing right and slightly UP so the
    // center ray converges on distant terrain the gun can actually lay on.
    for (let i = 0; i < 10; i++) {
      await page.mouse.move(btn.cx + (i + 1) * 35, Math.max(5, btn.cy - (i + 1) * 4), { steps: 2 });
    }
  }
  await sleep(2600); // real traverse speed: let the turret converge
  const aim1 = await page.evaluate(() => {
    const p = window.__DEBUG.game.player;
    const ap = window.__DEBUG.rig.aimPoint;
    return {
      turretYaw: p.state.turretYaw,
      hullYaw: p.state.yaw,
      pos: [p.state.pos.x, p.state.pos.z],
      aimPoint: [ap.x, ap.y, ap.z],
    };
  });
  check(mode, 'mouse move turns the turret', Math.abs(wrapAngle(aim1.turretYaw - yaw0)) > 0.03,
    `turretYaw ${yaw0.toFixed(4)} -> ${aim1.turretYaw.toFixed(4)}`);
  // turret converged onto the aim point's bearing (cursor terrain point in
  // no-lock mode; screen-center raycast in lock mode)
  const bearing = Math.atan2(aim1.aimPoint[0] - aim1.pos[0], aim1.aimPoint[2] - aim1.pos[1]);
  const gunYaw = aim1.hullYaw + aim1.turretYaw;
  const err = Math.abs(wrapAngle(bearing - gunYaw));
  check(mode, 'turret converges on aim point', err < 0.1, `bearing err ${err.toFixed(4)} rad`);

  // --- LMB fires, in the reticle direction ------------------------------------
  // down/up at the CURRENT pointer position (a click-with-move would inject
  // movement deltas under pointer lock and swing the camera mid-assertion),
  // fired IMMEDIATELY after the convergence read: the reference is the
  // CONVERGED aim point — the live aim point can legitimately jump to a near
  // obstruction (bot or foliage crossing the ray) in any later instant, while
  // the gun itself cannot teleport off the lay it converged on.
  await page.mouse.down();
  await page.mouse.up();
  await sleep(700);
  const shot = await page.evaluate(() => ({ fired: window.__PROBE.fired.slice() }));
  check(mode, 'LMB fires a player shell', shot.fired.length === 1, `player shells=${shot.fired.length}`);
  if (shot.fired.length === 1) {
    const s = shot.fired[0];
    const want = [
      aim1.aimPoint[0] - s.muzzlePos[0],
      aim1.aimPoint[1] - s.muzzlePos[1],
      aim1.aimPoint[2] - s.muzzlePos[2],
    ];
    const wl = Math.hypot(...want);
    const dot = (want[0] * s.dir[0] + want[1] * s.dir[1] + want[2] * s.dir[2]) / (wl || 1);
    const ang = Math.acos(Math.max(-1, Math.min(1, dot)));
    check(mode, 'shot flies in reticle direction', ang < 0.12, `angle to converged aim point ${ang.toFixed(4)} rad`);
  }

  // --- sniper entry: Shift toggle + RMB hold-to-aim ------------------------------
  // gunnery r1 (owner): the RMB default is HOLD-TO-AIM in every environment —
  // hold enters sniper, release restores the prior arcade view (settings
  // rmbMode also offers 'toggle' and the classic 'freelook'). Shift stays the
  // mode-independent sniper toggle. Both are asserted in both probe modes.
  const rigView = () => page.evaluate(() =>
    ({ fov: window.__DEBUG.camera.fov, rigMode: window.__DEBUG.rig.mode }));
  const fov0 = await page.evaluate(() => window.__DEBUG.camera.fov);
  await page.keyboard.down('ShiftLeft');
  await sleep(80);
  await page.keyboard.up('ShiftLeft');
  await sleep(450);
  const fovSniper = await rigView();
  check(mode, 'Shift enters sniper (FOV zoom)', fovSniper.rigMode === 'SNIPER' && fovSniper.fov < 40,
    `fov ${fov0.toFixed(1)} -> ${fovSniper.fov.toFixed(1)}, mode=${fovSniper.rigMode}`);
  await page.keyboard.down('ShiftLeft');
  await sleep(80);
  await page.keyboard.up('ShiftLeft');
  await sleep(450);
  const fovBack = await rigView();
  check(mode, 'Shift again exits sniper', fovBack.rigMode === 'ARCADE' && fovBack.fov > 50,
    `fov=${fovBack.fov.toFixed(1)}, mode=${fovBack.rigMode}`);
  await page.mouse.down({ button: 'right' });
  await sleep(450);
  const rmbHeld = await rigView();
  check(mode, 'RMB hold enters sniper (hold-to-aim default)',
    rmbHeld.rigMode === 'SNIPER' && rmbHeld.fov < 40,
    `fov=${rmbHeld.fov.toFixed(1)}, mode=${rmbHeld.rigMode}`);
  await page.mouse.up({ button: 'right' });
  await sleep(450);
  const rmbBack = await rigView();
  check(mode, 'RMB release exits sniper (restores arcade)',
    rmbBack.rigMode === 'ARCADE' && rmbBack.fov > 50,
    `fov=${rmbBack.fov.toFixed(1)}, mode=${rmbBack.rigMode}`);

  // --- A/D hull turn, W drive ---------------------------------------------------
  const hull0 = await page.evaluate(() => window.__DEBUG.game.player.state.yaw);
  await page.keyboard.down('KeyA');
  await sleep(700);
  await page.keyboard.up('KeyA');
  const hullA = await page.evaluate(() => window.__DEBUG.game.player.state.yaw);
  const dA = wrapAngle(hullA - hull0);
  check(mode, 'A turns the hull', Math.abs(dA) > 0.04, `dYaw=${dA.toFixed(4)}`);
  await page.keyboard.down('KeyD');
  await sleep(700);
  await page.keyboard.up('KeyD');
  const hullD = await page.evaluate(() => window.__DEBUG.game.player.state.yaw);
  const dD = wrapAngle(hullD - hullA);
  check(mode, 'D turns the hull the other way', Math.abs(dD) > 0.04 && Math.sign(dD) !== Math.sign(dA),
    `dYaw=${dD.toFixed(4)}`);
  await page.keyboard.down('KeyW');
  await sleep(900);
  const speedW = await page.evaluate(() => window.__DEBUG.game.player.state.speed);
  await page.keyboard.up('KeyW');
  check(mode, 'W drives forward', speedW > 0.3, `speed=${speedW.toFixed(2)} m/s`);
  await page.keyboard.down('KeyS');
  await sleep(900);
  const speedS = await page.evaluate(() => window.__DEBUG.game.player.state.speed);
  await page.keyboard.up('KeyS');
  check(mode, 'S brakes/reverses', speedS < speedW - 0.2, `speed ${speedW.toFixed(2)} -> ${speedS.toFixed(2)}`);

  // --- rebind persistence (gunnery r1; lock mode only to keep runtime sane) --
  // Rebind fire onto KeyF through the input API (the settings chips call the
  // same setBinding), assert the new key actually fires a shell, then reload
  // the page and assert the binding survived localStorage round-trip.
  if (!stubNoLock) {
    await page.evaluate(() => window.__DEBUG.input.setBinding('fire', 'KeyF', 0));
    const firedBefore = await page.evaluate(() => window.__PROBE.fired.length);
    await page.keyboard.down('KeyF');
    await sleep(60);
    await page.keyboard.up('KeyF');
    await sleep(700);
    const firedAfter = await page.evaluate(() => window.__PROBE.fired.length);
    check(mode, 'rebound fire key (F) fires a shell', firedAfter === firedBefore + 1,
      `player shells ${firedBefore} -> ${firedAfter}`);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction('window.__GAME_READY === true', { timeout: 90000 });
    const persisted = await page.evaluate(() => window.__DEBUG.input.getBinding('fire', 0));
    check(mode, 'fire rebind persists across reload', persisted === 'KeyF', `fire=${persisted}`);
    await page.evaluate(() => window.__DEBUG.input.resetBindings());
    const restored = await page.evaluate(() => window.__DEBUG.input.getBinding('fire', 0));
    check(mode, 'reset restores the default fire bind', restored === 'Mouse0', `fire=${restored}`);
  }

  check(mode, 'no page errors', pageErrors.length === 0,
    pageErrors.slice(0, 3).join(' | ') || 'clean');
  await page.close();
}

let crashed = false;
try {
  // NO-LOCK first at the embedded-pane width that used to break battle entry.
  await runMode('no-lock', { stubNoLock: true, width: 768, height: 800 });
  await runMode('lock', { stubNoLock: false, width: 1600, height: 900 });
} catch (err) {
  crashed = true;
  console.error(`[controls-probe] CRASHED: ${err.stack || err.message}`);
} finally {
  await browser.close();
  await server.close();
}

console.log(`\n[controls-probe] ${checks} checks, ${failures.length} failures`);
for (const f of failures) console.error(`  FAILED: ${f}`);
process.exit(crashed || failures.length ? 1 : 0);
