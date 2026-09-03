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
//   DENY-RETRY mode (lock_retry r1) — requestPointerLock is stubbed to DENY
//   ASYNCHRONOUSLY (rejected promise + 'pointerlockerror', Chrome's ~1.3 s
//   post-Esc cooldown shape) for the first 3 attempts and then delegate to
//   the native grant. Asserts the durable-latch contract: soft denials do
//   NOT flip cursor-aim or show the toast, primary-button gestures keep
//   retrying, the 3rd consecutive denial latches cursor-aim + toast, a click
//   whose lock attempt was soft-denied still fires (fire-edge re-arm), and
//   the next successful lock unlatches + removes the toast. Runs at 1280x800
//   and doubles as the battle-HUD layout gate at that width: no LEAVE BATTLE
//   button, team panels inside the viewport with uniform row metrics and
//   column-aligned tier numerals.
//
// BATTLE-ENTRY GATE DECISION (boot r9 loading flow): entering battle
// deliberately takes SECONDS — spawnTanks defers every staged visual to the
// post-ready idle pump (state.ts perf r3/r4), and the entry path builds the
// world + roster texture bakes behind the pre-battle loading screen
// (~10 s on a cold first entry). The probe's original contract — phase ===
// 'battle' within 900 ms of the click — asserted an implementation detail
// that no longer exists, and failed both modes against a perfectly healthy
// entry. A state.ts-side reordering (warming the roster before the click)
// was evaluated and REJECTED: pre-building visuals is exactly the
// load-to-ready regression the deferral ships to avoid, and the loading
// screen is the designed entry experience. The probe therefore treats the
// LOADING SCREEN as the contract and asserts the user-facing promise in two
// halves:
//   1. FEEDBACK IS IN-GESTURE — battleLoad.show() flips .cot-bl.on
//      synchronously inside the click handler; measured, the class lands
//      ~1 ms after the click event dispatches. This MUST be measured with
//      IN-PAGE timestamps (capturing click listener + MutationObserver):
//      harness-side measurement (post-click waitForFunction, rAF polling)
//      reads 750 ms+ of pure scheduling noise — the click's DISPATCH queues
//      behind idle-pump/world-build long tasks and the first rAF poll
//      starves past them — and fails a healthy entry (that scheduling
//      artifact, not the game, is what sank the old 900 ms assert).
//   2. ENTRY COMPLETES — the phase flips to 'battle' and the screen clears
//      (countdown included), each under a generous 20 s ceiling (~2x the
//      measured cold entry), so a real hang still fails the gate instead of
//      burning 90 s waits.
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
    port: 7000 + Math.floor(Math.random() * 300),
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
async function boot(mode, { stubNoLock, denyFirst = 0, width, height }) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('favicon')) pageErrors.push(m.text());
  });
  await page.evaluateOnNewDocument((stub, denyN) => {
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
    } else if (denyN > 0) {
      // DENY-RETRY mode: Chrome post-Esc cooldown shape — the request is
      // denied ASYNCHRONOUSLY (both a rejected promise and a
      // 'pointerlockerror' event fire, like real Chrome) for the first
      // denyN attempts, then the native implementation takes over.
      const native = Element.prototype.requestPointerLock;
      let attempts = 0;
      window.__LOCK_ATTEMPTS = () => attempts;
      Element.prototype.requestPointerLock = function (...a) {
        attempts += 1;
        if (attempts <= denyN) {
          setTimeout(() => document.dispatchEvent(new Event('pointerlockerror')), 0);
          return Promise.reject(new DOMException(
            'The user has exited the lock recently — cooldown active.',
            'NotAllowedError'));
        }
        return native.apply(this, a);
      };
    }
  }, stubNoLock, denyFirst);
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
  // input.ts DEFAULT_BINDINGS). Sniper stays mouse-reachable in no-lock
  // environments through the main.ts cursor-aim routing: RMB toggles sniper
  // whenever input.isCursorAim() — asserted behaviorally per mode below.
  const binds = await page.evaluate(() => window.__DEBUG.input.getBindings(0));
  check(mode, 'default bind LMB=fire', binds.fire === 'Mouse0', `fire=${binds.fire}`);
  check(mode, 'default bind Shift=sniper (desktop classic)', binds.sniperToggle === 'ShiftLeft',
    `sniperToggle=${binds.sniperToggle}`);
  check(mode, 'default bind Caps Lock=free look', binds.freeLook === 'CapsLock',
    `freeLook=${binds.freeLook}`);
  check(mode, 'default binds WASD hull', binds.forward === 'KeyW' && binds.back === 'KeyS' &&
    binds.left === 'KeyA' && binds.right === 'KeyD');

  // --- BATTLE button is hit-testable at its center (gear-overlap regression)
  const btn = await page.evaluate(() => {
    const b = document.querySelector('.cot-battle');
    const r = b.getBoundingClientRect();
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
    const top = document.elementFromPoint(cx, cy);
    return { cx, cy, hit: !!top && (top === b || b.contains(top)), topEl: top ? top.className : 'none' };
  });
  check(mode, 'BATTLE button unobstructed at center', btn.hit, `top element: "${btn.topEl}"`);

  // instrument player shell events BEFORE entering battle; rig.aimPoint is
  // captured AT fire time — a post-hoc read races camera motion under lock
  await page.evaluate(() => {
    window.__PROBE = { fired: [], blShowMs: -1 };
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
    // loading-screen latency, measured IN-PAGE (see header): first click's
    // dispatch time vs the .cot-bl 'on' class flip. MutationObserver
    // delivery is a microtask at the end of the click task, so the delta is
    // the user-felt in-gesture latency — and any slow work a regression
    // ever inserts before battleLoad.show() lands inside it.
    let clickAt = -1;
    document.addEventListener('click', () => {
      if (clickAt < 0) clickAt = performance.now();
    }, { capture: true });
    const seen = () => {
      const el = document.querySelector('.cot-bl');
      return !!(el && el.classList.contains('on'));
    };
    if (seen()) { window.__PROBE.blShowMs = -2; return; } // up before any click?!
    const mo = new MutationObserver(() => {
      if (window.__PROBE.blShowMs !== -1 || !seen()) return;
      window.__PROBE.blShowMs = clickAt < 0 ? -2 : Math.round(performance.now() - clickAt);
      mo.disconnect();
    });
    mo.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'], childList: true });
  });

  // --- battle entry via a REAL mouse click on the DOM button ----------------
  // Two-part loading-screen contract — see BATTLE-ENTRY GATE DECISION header.
  await page.mouse.click(btn.cx, btn.cy);
  // entry completes behind the loading screen: phase flip + screen clear
  // (countdown included), each under a generous-but-hang-detecting 20 s
  // ceiling (cold first entry measures ~10 s)
  let phase = 'garage';
  try {
    await page.waitForFunction('window.__DEBUG.game.phase === "battle"', { timeout: 20000 });
    await page.waitForFunction('!document.querySelector(".cot-bl.on")', { timeout: 20000 });
    phase = 'battle';
  } catch (_) {
    phase = await page.evaluate(() => window.__DEBUG.game.phase);
  }
  check(mode, 'real BATTLE click enters battle', phase === 'battle', `phase=${phase}`);
  // in-gesture feedback: the loading screen's class flip vs the click's
  // dispatch, both stamped in-page (the value is pinned by now — reading it
  // after the entry avoids polling across the world-build long tasks)
  const blShowMs = await page.evaluate(() => window.__PROBE.blShowMs);
  check(mode, 'loading screen shows inside the click gesture (<900ms)',
    blShowMs >= 0 && blShowMs < 900,
    blShowMs >= 0 ? `class flip ${blShowMs}ms after click dispatch`
      : (blShowMs === -2 ? 'screen was up before the click' : 'screen never appeared'));
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
  const verifyLockPresentation = () => {
    if (stubNoLock) {
      check(mode, 'pointer lock denied -> cursor-aim active', !lockState.locked && lockState.cursorAim,
        `locked=${lockState.locked} cursorAim=${lockState.cursorAim}`);
      check(mode, 'one-time cursor-aim toast shown', lockState.toast);
      return;
    }
    check(mode, 'pointer lock engaged', lockState.locked && !lockState.cursorAim,
      `locked=${lockState.locked} cursorAim=${lockState.cursorAim}`);
    check(mode, 'no cursor-aim toast in lock mode', !lockState.toast);
  };
  verifyLockPresentation();

  // let the battle-open cinematic finish (3 s flyby) before aim assertions
  await sleep(3600);

  // --- garage click must not have discharged the gun ------------------------
  const preFired = await page.evaluate(() => window.__PROBE.fired.length);
  check(mode, 'no accidental shot from BATTLE click', preFired === 0, `fired=${preFired}`);

  // --- mouse movement slews the turret ---------------------------------------
  const aimX = Math.round(width * 0.72), aimY = Math.round(height * 0.42);
  const yaw0 = await page.evaluate(() => window.__DEBUG.game.player.state.turretYaw);
  const moveAimInput = async () => {
    if (stubNoLock) {
      await page.mouse.move(aimX, aimY, { steps: 12 }); // real cursor -> cursor-aim ray
      return;
    }
    // Locked mouselook: EVERY CDP move is a relative delta (Chromium diffs
    // consecutive synthetic positions), so sweep directly from the BATTLE
    // button position — parking at screen center first would inject a huge
    // downward delta, pitch the view into the ground at the tank's feet and
    // pin the gun on its depression clamp. Swing right and slightly UP so the
    // center ray converges on distant terrain the gun can actually lay on.
    for (let i = 0; i < 10; i++) {
      await page.mouse.move(btn.cx + (i + 1) * 35, Math.max(5, btn.cy - (i + 1) * 4), { steps: 2 });
    }
  };
  await moveAimInput();
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
  const verifyShotDirection = () => {
    if (shot.fired.length !== 1) return;
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
  };
  verifyShotDirection();

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

  // --- every remaining rebindable desktop action reaches the live layer ---
  // The behavior-heavy paths above cover aiming, fire and movement. This
  // matrix catches the quieter controls that regress easily because their UI
  // only appears on demand: ammunition, consumables, free-look, minimap size,
  // shot log, diagnostics and Settings. Use real CDP keyboard/mouse/wheel
  // events; the action observer is diagnostic only and does not invoke them.
  const verifyDesktopInputMatrix = async () => {
    if (stubNoLock) return;
    await page.evaluate(() => {
      window.__PROBE.actions = {};
      for (const { id } of window.__DEBUG.input.actionDefs) {
        window.__DEBUG.input.onAction(id, () => {
          window.__PROBE.actions[id] = (window.__PROBE.actions[id] || 0) + 1;
        });
      }
    });
    const keyboardRoutes = [
      ['forward', 'KeyW'], ['back', 'KeyS'], ['left', 'KeyA'], ['right', 'KeyD'],
      ['handbrake', 'Space'], ['sniperToggle', 'ShiftLeft'],
      ['shell1', 'Digit1'], ['shell2', 'Digit2'], ['shell3', 'Digit3'],
      ['specialAction', 'KeyE'], ['reloadMagazine', 'KeyC'],
      ['consumable1', 'Digit4'], ['consumable2', 'Digit5'], ['consumable3', 'Digit6'],
      ['freeLook', 'CapsLock'],
    ];
    for (const [, key] of keyboardRoutes) {
      await page.keyboard.down(key); await sleep(45); await page.keyboard.up(key); await sleep(35);
    }
    // Secondary arrow/Alt bindings must travel through the same action IDs.
    for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'AltLeft']) {
      await page.keyboard.down(key); await sleep(35); await page.keyboard.up(key); await sleep(25);
    }
    // Physical mouse/wheel lanes complete the rebindable action table.
    await page.mouse.down(); await sleep(35); await page.mouse.up();
    await page.mouse.down({ button: 'right' }); await sleep(35); await page.mouse.up({ button: 'right' });
    await page.mouse.wheel({ deltaY: -120 }); await sleep(80);
    await page.mouse.wheel({ deltaY: 120 }); await sleep(80);

    const minimapBefore = await page.$eval('.cot-minimap', (node) => node.getBoundingClientRect().width);
    await page.keyboard.press('KeyM'); await sleep(120);
    const minimapAfter = await page.$eval('.cot-minimap', (node) => node.getBoundingClientRect().width);
    check(mode, 'M cycles the visible minimap size', Math.abs(minimapAfter - minimapBefore) > 20,
      `${minimapBefore.toFixed(0)}px -> ${minimapAfter.toFixed(0)}px`);
    // Return the three-step minimap cycle to its starting size.
    await page.keyboard.press('KeyM'); await page.keyboard.press('KeyM');

    await page.keyboard.press('KeyL'); await sleep(100);
    const logOpen = await page.$eval('.cot-si-log', (node) => node.classList.contains('open'));
    check(mode, 'L opens the shot information log', logOpen);
    await page.keyboard.press('KeyL');

    const debugBefore = await page.$eval('#cot-perfhud', (node) => getComputedStyle(node).display !== 'none');
    await page.keyboard.press('F8'); await sleep(100);
    const debugAfter = await page.$eval('#cot-perfhud', (node) => getComputedStyle(node).display !== 'none');
    check(mode, 'F8 toggles the diagnostics dashboard', debugAfter !== debugBefore,
      `${debugBefore} -> ${debugAfter}`);
    await page.keyboard.press('F8');

    await page.keyboard.press('Escape'); await sleep(120);
    const settingsOpen = await page.evaluate(() => window.__DEBUG.settings.isOpen());
    check(mode, 'Esc opens Settings from battle', settingsOpen);
    await page.evaluate(() => window.__DEBUG.settings.close({ noRelock: true }));

    const actionCoverage = await page.evaluate(() => ({
      counts: { ...window.__PROBE.actions },
      missing: window.__DEBUG.input.actionDefs.map(({ id }) => id)
        .filter((id) => !(window.__PROBE.actions[id] > 0)),
      held: window.__DEBUG.input.actionDefs.map(({ id }) => id)
        .filter((id) => window.__DEBUG.input.isDown(id)),
    }));
    check(mode, 'all 23 desktop actions receive real input events', actionCoverage.missing.length === 0,
      actionCoverage.missing.length ? `missing ${actionCoverage.missing.join(', ')}` : '23/23');
    check(mode, 'desktop action matrix leaves no stuck controls', actionCoverage.held.length === 0,
      actionCoverage.held.length ? `held ${actionCoverage.held.join(', ')}` : 'clean');

    // --- standard-mapping gamepad: fixed sticks + every shipped button ----
    // Chromium has no CDP gamepad injection API. Install a standards-shaped
    // navigator.getGamepads result, dispatch the real connection event, and
    // let the production rAF poller consume it exactly as it would hardware.
    const padInstalled = await page.evaluate(() => {
      const buttons = Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }));
      const pad = {
        id: 'QA standard gamepad', index: 0, connected: true, mapping: 'standard',
        timestamp: performance.now(), axes: [0, 0, 0, 0], buttons,
        vibrationActuator: null,
      };
      try {
        Object.defineProperty(navigator, 'getGamepads', {
          configurable: true, value: () => [pad],
        });
      } catch (_) { return false; }
      window.__QA_PAD = pad;
      window.__PROBE.actions = {};
      window.dispatchEvent(new Event('gamepadconnected'));
      return true;
    });
    check(mode, 'standard gamepad can connect to the live input poller', padInstalled);
    if (padInstalled) {
      // Let the first neutral poll establish the connected pad before the
      // first edge. Real hardware emits gamepadconnected while its buttons
      // are neutral; without this beat the synthetic A edge can race the
      // listener installation and make the first route appear absent.
      await sleep(120);
      const padSetButton = async (index, pressed) => {
        await page.evaluate((i, down) => {
          const b = window.__QA_PAD.buttons[i];
          b.pressed = down; b.touched = down; b.value = down ? 1 : 0;
          window.__QA_PAD.timestamp = performance.now();
        }, index, pressed);
        await sleep(85);
      };
      const padRoutes = [
        ['handbrake', 0], ['consumable3', 1], ['consumable1', 2], ['consumable2', 3],
        ['specialAction', 4], ['freeLook', 5], ['sniperToggle', 6], ['fire', 7],
        ['minimapZoom', 8], ['shell1', 12], ['reloadMagazine', 13],
        ['shell2', 14], ['shell3', 15],
      ];
      for (const [, index] of padRoutes) {
        await padSetButton(index, true); await padSetButton(index, false);
      }
      await page.evaluate(() => { window.__QA_PAD.axes[0] = 0.85; window.__QA_PAD.axes[1] = -0.9; });
      await sleep(180);
      const padMove = await page.evaluate(() => {
        const out = { x: 0, y: 0 }; window.__DEBUG.input.getPadMove(out); return out;
      });
      check(mode, 'left gamepad stick drives both movement axes', padMove.x > 0.3 && padMove.y < -0.3,
        `x=${padMove.x.toFixed(2)} y=${padMove.y.toFixed(2)}`);
      await page.evaluate(() => { window.__QA_PAD.axes[0] = 0; window.__QA_PAD.axes[1] = 0; });

      const padYaw0 = await page.evaluate(() => window.__DEBUG.game.player.state.turretYaw);
      await page.evaluate(() => { window.__QA_PAD.axes[2] = 0.9; });
      await sleep(650);
      await page.evaluate(() => { window.__QA_PAD.axes[2] = 0; });
      const padYaw1 = await page.evaluate(() => window.__DEBUG.game.player.state.turretYaw);
      check(mode, 'right gamepad stick moves the live gun aim', Math.abs(wrapAngle(padYaw1 - padYaw0)) > 0.02,
        `dYaw=${wrapAngle(padYaw1 - padYaw0).toFixed(3)}`);

      await padSetButton(9, true); await padSetButton(9, false);
      const padResult = await page.evaluate((expected) => ({
        active: window.__DEBUG.input.padActive(),
        settings: window.__DEBUG.settings.isOpen(),
        missing: expected.filter(([id]) => !(window.__PROBE.actions[id] > 0)).map(([id]) => id),
      }), [...padRoutes, ['settingsMenu', 9]]);
      check(mode, 'all configured gamepad buttons reach their actions', padResult.missing.length === 0,
        padResult.missing.length ? `missing ${padResult.missing.join(', ')}` : `${padRoutes.length + 1}/${padRoutes.length + 1}`);
      check(mode, 'START opens Settings and marks the pad active', padResult.settings && padResult.active,
        `settings=${padResult.settings} active=${padResult.active}`);
      // Resume through the real footer button. That click is the user gesture
      // which production uses to regain pointer lock; a programmatic
      // noRelock close leaves keyboard Fire intentionally gated off.
      const resume = await page.$eval('.cot-settings .resume', (node) => {
        const r = node.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      });
      await page.mouse.click(resume.x, resume.y);
      await sleep(350);
    }
  };
  await verifyDesktopInputMatrix();

  // --- rebind persistence (gunnery r1; lock mode only to keep runtime sane) --
  // Rebind fire onto KeyF through the input API (the settings chips call the
  // same setBinding), assert the new key actually fires a shell, then reload
  // the page and assert the binding survived localStorage round-trip.
  const verifyRebindPersistence = async () => {
    if (stubNoLock) return;
    // The binding check is not a reload-speed check. Long-reload vehicles can
    // still be cycling the deliberate reticle shot above after the movement
    // assertions complete, so wait for the authoritative fire gate instead
    // of making this probe timing-dependent on the selected garage tank.
    await page.waitForFunction(
      'window.__DEBUG.game.player?.combat?.reload?.t <= 0',
      { timeout: 20000 },
    );
    // The exhaustive action matrix deliberately visits every ammunition
    // slot. Re-anchor this independent rebind assertion on a loaded ready
    // cannon channel so it cannot inherit an empty/independently reloading
    // slot from the preceding coverage pass.
    await page.evaluate(() => {
      const p = window.__DEBUG.game.player;
      p.input.shellSlot = 0;
      p.combat.shellSlot = 0;
      // The gamepad matrix fires once, visits the independent launcher, and
      // can leave a cannon magazine loading in the background. Restore a
      // fully ready cannon fixture so this assertion measures the rebound F
      // route, not whichever weapon-channel cooldown the matrix exercised.
      for (const channel of p.combat.reloadChannels || []) {
        channel.t = 0;
        channel.kind = 'ready';
      }
      if (p.combat.gunReload) {
        p.combat.gunReload.t = 0;
        p.combat.gunReload.kind = 'ready';
        p.combat.reload = p.combat.gunReload;
      } else {
        p.combat.reload.t = 0;
        p.combat.reload.kind = 'ready';
      }
      if (p.combat.magazine) p.combat.magazine.rounds = p.combat.magazine.capacity;
      if (p.combat.ammo?.[0] <= 0 && p.combat.ammoCapacity?.[0] > 0) {
        p.combat.ammo[0] = 1;
      }
    });
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
  };
  await verifyRebindPersistence();

  check(mode, 'no page errors', pageErrors.length === 0,
    pageErrors.slice(0, 3).join(' | ') || 'clean');
  await page.close();
}

/**
 * DENY-RETRY mode (lock_retry r1): Chrome-cooldown-shaped ASYNC denials for
 * the first 3 attempts, native grant afterwards. Asserts the durable-latch
 * contract + the 1280px battle-HUD layout (no LEAVE BATTLE button, team
 * panels sane). See the header block.
 */
async function verifyDenyRetryHud(page, mode, width) {
  const hudLayout = await page.evaluate(() => {
    const out = {
      // The settings overlay owns the designed leave action. A raw battle-HUD
      // leave control outside that overlay is a regression.
      leaveBtn: [...document.querySelectorAll('button')].some((button) =>
        /leave battle/i.test(button.textContent || '') && button.offsetParent !== null
        && !button.closest('.cot-settings')),
      pageOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      ears: {},
    };
    const spread = (values) => (values.length > 1
      ? Math.max(...values) - Math.min(...values) : 0);
    const teamPanelLayout = (side) => {
      const ear = document.querySelector(`.cot-ear.${side}`);
      if (!ear) return null;
      const bounds = ear.getBoundingClientRect();
      const rows = [...ear.querySelectorAll('.cot-er')];
      const heights = rows.map((row) =>
        Math.round(row.getBoundingClientRect().height * 2) / 2);
      const tiers = rows.map((row) => row.querySelector('.tier')).filter(Boolean)
        .map((tier) => tier.getBoundingClientRect());
      const names = rows.map((row) => row.querySelector('.vn')).filter(Boolean)
        .map((name) => name.getBoundingClientRect());
      return {
        left: bounds.left,
        right: bounds.right,
        rows: rows.length,
        heightSpread: heights.length ? Math.max(...heights) - Math.min(...heights) : 0,
        tierColSpread: side === 'l'
          ? spread(names.map((name) => name.left))
          : spread(tiers.map((tier) => tier.left)),
      };
    };
    out.ears.l = teamPanelLayout('l');
    out.ears.r = teamPanelLayout('r');
    return out;
  });
  check(mode, 'no LEAVE BATTLE button in the battle HUD', !hudLayout.leaveBtn);
  check(mode, 'no horizontal page overflow at 1280px', !hudLayout.pageOverflow);
  const left = hudLayout.ears.l;
  const right = hudLayout.ears.r;
  check(mode, 'both team panels present with rows',
    !!left && !!right && left.rows > 0 && right.rows > 0,
    `L=${left && left.rows} R=${right && right.rows} rows`);
  if (!left || !right) return;
  check(mode, 'team panels inside the viewport',
    left.left >= -0.5 && right.right <= width + 0.5,
    `L.left=${left.left.toFixed(1)} R.right=${right.right.toFixed(1)}`);
  check(mode, 'team rows uniform height both sides',
    left.heightSpread <= 1 && right.heightSpread <= 1,
    `spread L=${left.heightSpread} R=${right.heightSpread}`);
  check(mode, 'tier numeral columns aligned both sides',
    left.tierColSpread <= 0.6 && right.tierColSpread <= 0.6,
    `spread L=${left.tierColSpread.toFixed(2)}px R=${right.tierColSpread.toFixed(2)}px`);
}

async function runDenyRetryMode() {
  const mode = 'deny-retry';
  const width = 1280, height = 800;
  console.log(`\n[controls-probe] === ${mode} mode (${width}x${height}) ===`);
  const { page, pageErrors } = await boot(mode, {
    stubNoLock: false, denyFirst: 3, width, height,
  });

  // player-shell counter (the soft-denied canvas clicks must still fire)
  await page.evaluate(() => {
    window.__PROBE = { fired: 0 };
    window.__DEBUG.bus.on('shell:fired', (p) => { if (p.isPlayer) window.__PROBE.fired++; });
  });

  // enter battle via a real BATTLE click (attempt #1: ui:battleStart relock)
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
  check(mode, 'BATTLE click enters battle', phase === 'battle', `phase=${phase}`);
  if (phase !== 'battle') { await page.close(); return; }
  await sleep(3800); // battle-open cinematic — the first live click is post-flyby

  const lockState = () => page.evaluate(() => ({
    attempts: window.__LOCK_ATTEMPTS ? window.__LOCK_ATTEMPTS() : -1,
    locked: window.__DEBUG.input.isLocked(),
    cursorAim: window.__DEBUG.input.isCursorAim(),
    toast: !!document.querySelector('.cot-lock-toast'),
    fired: window.__PROBE.fired,
  }));

  // --- denial #1 (battle-entry relock) must NOT latch or toast --------------
  let st = await lockState();
  check(mode, 'first denial does not latch cursor-aim', !st.cursorAim && !st.locked,
    `attempts=${st.attempts} cursorAim=${st.cursorAim}`);
  check(mode, 'no toast on a transient denial', !st.toast);

  // --- battle-HUD layout gate at 1280px (owner round: leave button removed,
  // team panels consistent) --------------------------------------------------
  await verifyDenyRetryHud(page, mode, width);

  // --- denial #2: a primary-button gesture RETRIES the lock -----------------
  const gx = Math.round(width / 2), gy = Math.round(height * 0.55);
  await page.mouse.click(gx, gy);
  await sleep(450);
  st = await lockState();
  check(mode, 'gesture retried the lock (attempt 2)', st.attempts === 2, `attempts=${st.attempts}`);
  check(mode, 'second denial still un-latched', !st.cursorAim && !st.toast,
    `cursorAim=${st.cursorAim} toast=${st.toast}`);

  // --- denial #3: durable latch -> cursor-aim + toast ------------------------
  await page.mouse.click(gx, gy);
  let latched = null;
  for (let i = 0; i < 10 && (!latched || !latched.toast); i++) {
    await sleep(300);
    latched = await lockState();
  }
  check(mode, '3rd consecutive denial latches cursor-aim', latched.cursorAim && !latched.locked,
    `attempts=${latched.attempts} cursorAim=${latched.cursorAim}`);
  check(mode, 'toast shows on the durable latch', latched.toast);
  check(mode, 'soft-denied canvas clicks still fired (edge re-arm)', latched.fired >= 1,
    `player shells=${latched.fired}`);

  // --- attempt #4 grants: unlatch + toast removed ----------------------------
  await page.mouse.click(gx, gy);
  let healed = null;
  for (let i = 0; i < 10; i++) {
    await sleep(250);
    healed = await lockState();
    if (healed.locked) break;
  }
  check(mode, 'later successful lock engages (retry after latch)', healed.locked,
    `attempts=${healed.attempts} locked=${healed.locked}`);
  check(mode, 'lock success unlatches cursor-aim', !healed.cursorAim);
  check(mode, 'lock success removes the toast', !healed.toast);

  check(mode, 'no page errors', pageErrors.length === 0,
    pageErrors.slice(0, 3).join(' | ') || 'clean');
  await page.close();
}

let crashed = false;
try {
  // NO-LOCK first at the embedded-pane width that used to break battle entry.
  await runMode('no-lock', { stubNoLock: true, width: 768, height: 800 });
  await runMode('lock', { stubNoLock: false, width: 1600, height: 900 });
  await runDenyRetryMode();
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
