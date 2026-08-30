// tools/feel-probe.mjs — GAME FEEL instrumentation gate.
//
// Everything here measures the tactile layer: how many frames pass between a
// player action and the game reacting, how quickly the hull answers the
// throttle and the brake, whether every trigger pull produces the full
// muzzle -> impact -> feedback chain, and whether the frame pacing during
// combined driving + firing is smooth enough that none of it is masked by a
// hitch.
//
// Same vite + puppeteer pattern as tools/screenshot.mjs / controls-probe.mjs
// (hmr:false, watch off — a sibling agent saving src/ mid-run must not
// hot-reload the page out from under the instrumentation).
//
// Sections
//   1. AIM LATENCY — frames from a mouse delta to the turret actually moving,
//      and the fraction of the commanded swing delivered in the first frame
//      (the aim-smoothing EMA shows up here as sub-unity first-frame gain).
//   2. DRIVE RESPONSE — 0->10 km/h ("does it leave the line"), 0->30 km/h,
//      brake distance and stop time from 30 km/h, reverse launch, pivot rate.
//   3. FIRE CHAIN — per shot: frames LMB->shell:fired, whether the muzzle fx,
//      camera recoil, trauma shake, hull recoil impulse and audio all fired,
//      frames fired->terminal event, frames terminal->hit feedback (hit mark).
//   4. FRAME PACING — frame-time distribution over a scripted drive+fire run
//      (p50/p95/p99/max, hitch counts) plus a GC-pressure read.
//
// Usage: node tools/feel-probe.mjs [--json docs/feel-before.json] [--label before]
// Exits non-zero only on page errors / harness failure — the numbers are
// reported, not gated, so before/after runs are always comparable.

import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const jsonOut = opt('json', '');
const label = opt('label', 'run');
const shots = opt('shots', '');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (n, d = 2) => (n == null || !Number.isFinite(n) ? 'n/a' : n.toFixed(d));

const server = await createServer({
  root: process.cwd(),
  logLevel: 'error',
  server: { port: 5400 + Math.floor(Math.random() * 500), strictPort: false, hmr: false, watch: null },
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
console.log(`[feel] vite up at ${url}`);

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('favicon')) pageErrors.push(m.text());
});
await page.evaluateOnNewDocument(() => {
  // deterministic-ish: easy bots so incoming fire never decides a measurement
  try {
    localStorage.setItem('cot.settings.v1', JSON.stringify({ aiDifficulty: 'easy', volMaster: 0 }));
  } catch (_) { /* private mode */ }
});

const results = { label, at: new Date().toISOString() };
let failed = false;

try {
  for (let attempt = 0; ; attempt++) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await page.waitForFunction('window.__GAME_READY === true', { timeout: 90000 });
      break;
    } catch (err) {
      if (attempt >= 1) throw err;
      console.warn(`[feel] load attempt failed (${err.message}) — retrying`);
      pageErrors.length = 0;
    }
  }
  await sleep(1200);

  // BOOT/ENTRY SCREEN (owned by a sibling agent — index.html #cot-boot): a
  // full-viewport splash with a "press any key" gate sits over the garage, so
  // the BATTLE click has to get past it first. Written defensively: if the
  // element is absent or already dismissed this is a no-op.
  const hadBoot = await page.evaluate(() => !!document.getElementById('cot-boot'));
  if (hadBoot) {
    for (let i = 0; i < 40; i++) {
      const gone = await page.evaluate(() => {
        const b = document.getElementById('cot-boot');
        if (!b) return true;
        const cs = getComputedStyle(b);
        return cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.02;
      });
      if (gone) break;
      await page.keyboard.press('Enter');
      await page.mouse.click(640, 620);
      await sleep(400);
    }
    // The splash is the sibling agent's in-flight work (src/ui/bootScreen.ts is
    // not wired into main.ts yet, so nothing removes the inline markup). Force
    // it out of the way HERE, in the harness only — never by editing their
    // files — so the probe's screenshots show the actual game.
    results.bootScreenStuck = await page.evaluate(() => {
      const b = document.getElementById('cot-boot');
      if (!b) return false;
      const cs = getComputedStyle(b);
      const visible = cs.display !== 'none' && parseFloat(cs.opacity) > 0.02;
      if (visible) b.style.display = 'none';
      return visible;
    });
    await sleep(700);
  }
  results.bootScreenSeen = hadBoot;

  // ---------------------------------------------------------------- harness ---
  // A single rAF sampler owns "frames": every measurement below is expressed
  // in rendered frames so the numbers mean what a player perceives.
  await page.evaluate(() => {
    const D = window.__DEBUG;
    const F = {
      frame: 0,
      frameTimes: [],       // ms between rAF callbacks
      turret: [],           // { frame, yaw } per frame
      speed: [],            // { frame, t, speed, pos } per frame
      events: [],           // { frame, t, type, ...payload }
      hooks: {},
      t0: performance.now(),
    };
    window.__FEEL = F;
    const push = (type, extra) => {
      F.events.push(Object.assign({ frame: F.frame, t: performance.now() - F.t0, type }, extra || {}));
    };
    F.push = push;

    // bus taps — the whole firing/damage chain
    D.bus.on('shell:fired', (e) => push('shell:fired', {
      isPlayer: !!e.isPlayer, caliberMm: e.caliberMm, shellId: e.shellId,
    }));
    D.bus.on('shell:hit', (e) => push('shell:hit', {
      kind: e.kind, damage: e.damage || 0, shellId: e.shellId,
      attackerIsPlayer: !!(D.game.player && e.attackerId === D.game.player.id),
      onPlayer: !!(D.game.player && e.targetId === D.game.player.id),
    }));
    // shellId matters: an ENEMY shell expiring 1 ms into our own trial used to
    // masquerade as our shot's terminal event (measured "term=0f" nonsense).
    D.bus.on('shell:expired', (e) => push('shell:expired', { shellId: e && e.shellId }));
    D.bus.on('tank:destroyed', () => push('tank:destroyed'));
    if (D.bus.on) D.bus.on('player:reload', (e) => { if (e && e.done) push('reload:done'); });

    // fx / rig / visual taps: wrap the feel-critical entry points so the probe
    // can prove the whole punch chain runs on every shot, not just the sim.
    const wrap = (obj, name, tag) => {
      if (!obj || typeof obj[name] !== 'function') { F.hooks[tag] = 'absent'; return; }
      const orig = obj[name].bind(obj);
      obj[name] = (...a) => { push(tag, { arg: typeof a[0] === 'number' ? a[0] : undefined }); return orig(...a); };
      F.hooks[tag] = 'wrapped';
    };
    wrap(D.rig, 'addTrauma', 'rig:trauma');
    wrap(D.rig, 'recoilKick', 'rig:recoil');
    wrap(D.fx, 'muzzleFlash', 'fx:muzzle');
    wrap(D.fx, 'composeFiringMoment', 'fx:composeFiring');

    // AIM PATH ISOLATION: tap the input layer's own per-frame yaw delta. This
    // separates the input smoothing (input.ts EMA) from the turret traverse
    // rate (sim) and the camera rig's own easing (not ours) — a single mouse
    // burst that leaves this function spread over N frames is N frames of
    // input mush no amount of camera tuning can recover.
    F.aimOut = []; // { frame, dx, dy }
    const cmd = D.input.consumeMouseDelta.bind(D.input);
    D.input.consumeMouseDelta = (out, dt, sniper) => {
      const r = cmd(out, dt, sniper);
      F.aimOut.push({ frame: F.frame, dx: r.x, dy: r.y });
      if (F.aimOut.length > 4000) F.aimOut.shift();
      return r;
    };

    let last = performance.now();
    const sample = () => {
      const now = performance.now();
      F.frameTimes.push(now - last);
      last = now;
      F.frame++;
      const p = D.game.player;
      if (p && p.state) {
        D.camera.getWorldDirection(F._cf || (F._cf = new (D.camera.position.constructor)()));
        F.turret.push({
          frame: F.frame, t: now - F.t0, yaw: p.state.turretYaw, gunPitch: p.state.gunPitch,
          camYaw: Math.atan2(F._cf.x, F._cf.z),
        });
        F.speed.push({
          frame: F.frame, t: now - F.t0, speed: p.state.speed, yaw: p.state.yaw,
          x: p.state.pos.x, z: p.state.pos.z, spool: p.state._spool || 0,
        });
        if (F.turret.length > 4000) F.turret.shift();
        if (F.speed.length > 4000) F.speed.shift();
      }
      if (F.frameTimes.length > 8000) F.frameTimes.shift();
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);

    F.mark = () => ({ frame: F.frame, t: performance.now() - F.t0, ev: F.events.length });
    F.reset = () => { F.events.length = 0; F.frameTimes.length = 0; F.turret.length = 0; F.speed.length = 0; };
  });

  // --- enter battle ----------------------------------------------------------
  const btn = await page.evaluate(() => {
    const b = document.querySelector('.cot-battle');
    const r = b.getBoundingClientRect();
    return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
  });
  await page.mouse.click(btn.cx, btn.cy);
  await sleep(900);
  const inBattle = await page.evaluate(() => window.__DEBUG.game.phase === 'battle');
  if (!inBattle) throw new Error('battle entry failed');
  // skip the opening cinematic (any camera input cancels it) and settle
  await page.mouse.move(700, 400);
  await sleep(2500);
  results.spec = await page.evaluate(() => {
    const p = window.__DEBUG.game.player;
    return {
      id: p.specId, topSpeedKmh: p.spec.topSpeedKmh, reverseKmh: p.spec.reverseSpeedKmh,
      weightTons: p.spec.weightTons, hp: p.spec.enginePowerHp,
      caliberMm: p.spec.gun.shells[0].caliberMm, reloadS: p.spec.gun.reloadS,
    };
  });
  results.pointerLocked = await page.evaluate(() => window.__DEBUG.input.isLocked());
  await page.evaluate(() => {
    const p = window.__DEBUG.game.player;
    window.__FEEL.driveOrigin = {
      x: p.state.pos.x, y: p.state.pos.y, z: p.state.pos.z, yaw: p.state.yaw,
    };
  });

  // ==========================================================================
  // 1. AIM LATENCY
  // ==========================================================================
  console.log('\n[feel] === 1. aim latency ===');
  const aim = { trials: [] };
  for (let i = 0; i < 6; i++) {
    await sleep(500); // let the turret and the EMA fully settle
    await page.evaluate(() => {
      const F = window.__FEEL;
      F.aimOut.length = 0;
      F.aimMark = {
        frame: F.frame,
        turretYaw: window.__DEBUG.game.player.state.turretYaw,
        camYaw: F.turret.length ? F.turret[F.turret.length - 1].camYaw : 0,
      };
    });
    // ONE discrete horizontal flick — a single movementX burst, not a ramp
    await page.mouse.move(640 + 200 * (i % 2 === 0 ? 1 : -1), 360);
    await sleep(500);
    const tr = await page.evaluate(() => {
      const F = window.__FEEL;
      const M = F.aimMark;
      const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));

      // (a) INPUT PATH: how many frames the single burst is smeared over
      const outs = F.aimOut.filter((r) => r.frame >= M.frame && Math.abs(r.dx) > 1e-6);
      const totalDx = outs.reduce((s, r) => s + Math.abs(r.dx), 0);
      const inputFrames = outs.length;
      const inputFirstFrac = totalDx > 0 && outs.length ? Math.abs(outs[0].dx) / totalDx : null;
      // frames until 90% of the commanded yaw has been handed to the rig
      let inputF90 = null, acc = 0;
      for (let k = 0; k < outs.length; k++) {
        acc += Math.abs(outs[k].dx);
        if (acc >= totalDx * 0.9 - 1e-12) { inputF90 = k + 1; break; }
      }

      // (b) PERCEIVED: camera yaw (what the player sees swing) and turret yaw
      const rows = F.turret.filter((r) => r.frame >= M.frame);
      const camTotal = rows.length ? Math.abs(wrapA(rows[rows.length - 1].camYaw - M.camYaw)) : 0;
      let camFirst = null, camF90 = null;
      for (const r of rows) {
        const d = Math.abs(wrapA(r.camYaw - M.camYaw));
        if (camFirst == null && d > 1e-4) camFirst = r.frame - M.frame;
        if (camF90 == null && camTotal > 0 && d >= camTotal * 0.9) camF90 = r.frame - M.frame;
      }
      let turFirst = null;
      const turTotal = rows.length ? Math.abs(wrapA(rows[rows.length - 1].turretYaw - M.turretYaw)) : 0;
      for (const r of rows) {
        if (Math.abs(wrapA(r.turretYaw - M.turretYaw)) > 1e-4) { turFirst = r.frame - M.frame; break; }
      }
      return {
        inputFrames, inputFirstFrac, inputF90,
        camFirstFrame: camFirst, camF90, camSwingDeg: camTotal * 57.2958,
        turretFirstFrame: turFirst, turretSwingDeg: turTotal * 57.2958,
      };
    });
    aim.trials.push(tr);
  }
  const okTr = aim.trials.filter((t) => t.inputFrames > 0 && t.camSwingDeg > 0.05);
  const avg = (f) => {
    const v = okTr.map(f).filter((x) => x != null && Number.isFinite(x));
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  aim.inputSmearFrames = avg((t) => t.inputFrames);
  aim.inputFirstFrameGain = avg((t) => t.inputFirstFrac);
  aim.inputFramesTo90pct = avg((t) => t.inputF90);
  aim.camFirstMoveFrames = avg((t) => t.camFirstFrame);
  aim.camFramesTo90pct = avg((t) => t.camF90);
  aim.camSwingDeg = avg((t) => t.camSwingDeg);
  aim.turretFirstMoveFrames = avg((t) => t.turretFirstFrame);
  aim.turretSwingDeg = avg((t) => t.turretSwingDeg);
  aim.smoothing = await page.evaluate(() => window.__DEBUG.input.getSettings().aimSmoothing);
  results.aim = aim;
  console.log(`  INPUT one flick spread over ${fmt(aim.inputSmearFrames, 2)} frames; first frame delivers ${fmt((aim.inputFirstFrameGain || 0) * 100, 1)}%, 90% by frame ${fmt(aim.inputFramesTo90pct, 2)}`);
  console.log(`  CAMERA first moves          ${fmt(aim.camFirstMoveFrames, 2)} frames; 90% of the ${fmt(aim.camSwingDeg, 2)} deg swing by frame ${fmt(aim.camFramesTo90pct, 2)}`);
  console.log(`  TURRET first moves          ${fmt(aim.turretFirstMoveFrames, 2)} frames (swing ${fmt(aim.turretSwingDeg, 2)} deg, traverse-rate limited)`);
  console.log(`  aimSmoothing setting        ${aim.smoothing}`);

  // ==========================================================================
  // 2. DRIVE RESPONSE
  // ==========================================================================
  console.log('\n[feel] === 2. drive response ===');
  const drive = {};
  // put the tank on flattish ground facing a clear heading, stopped
  await page.evaluate(() => {
    const p = window.__DEBUG.game.player;
    p.state.speed = 0; p.state.yawRate = 0; p.state._spool = 0;
  });
  await sleep(400);

  async function accelRun() {
    await page.evaluate(() => {
      const p = window.__DEBUG.game.player;
      const o = window.__FEEL.driveOrigin;
      p.state.pos.set(o.x, o.y, o.z); p.state.yaw = o.yaw;
      p.state.speed = 0; p.state._spool = 0;
      window.__FEEL.speed.length = 0;
      window.__FEEL.accMark = { frame: window.__FEEL.frame, t: performance.now() - window.__FEEL.t0 };
    });
    await page.keyboard.down('KeyW');
    await sleep(6500);
    const r = await page.evaluate(() => {
      const F = window.__FEEL;
      const rows = F.speed.filter((s) => s.frame >= F.accMark.frame);
      const at = (kmh) => {
        const target = kmh / 3.6;
        for (const s of rows) if (s.speed >= target) return (s.t - F.accMark.t) / 1000;
        return null;
      };
      return {
        t10: at(10), t20: at(20), t30: at(30),
        peakKmh: rows.length ? Math.max(...rows.map((s) => s.speed)) * 3.6 : 0,
        // how far the hull has actually travelled 300 ms in (off-the-line bite)
        firstMoveFrames: (() => {
          for (let i = 0; i < rows.length; i++) if (rows[i].speed > 0.05) return i;
          return null;
        })(),
        kmhAt300ms: (() => {
          for (const s of rows) if (s.t - F.accMark.t >= 300) return s.speed * 3.6;
          return null;
        })(),
        kmhAt1s: (() => {
          for (const s of rows) if (s.t - F.accMark.t >= 1000) return s.speed * 3.6;
          return null;
        })(),
      };
    });
    return r;
  }
  drive.accel = await accelRun();
  await page.keyboard.up('KeyW');
  await sleep(1400); // roll to a stop before the brake trial

  // BRAKE TRIAL: relaunch, latch the mark the instant the hull crosses
  // 30 km/h, then slam the handbrake. Aborted/short runs report null rather
  // than the old bug (a collided, already-stopped hull read "0.0 km/h").
  await page.evaluate(() => {
    const p = window.__DEBUG.game.player;
    const o = window.__FEEL.driveOrigin;
    p.state.pos.set(o.x, o.y, o.z); p.state.yaw = o.yaw;
    p.state.speed = 0; p.state._spool = 0;
    window.__FEEL.speed.length = 0;
    window.__FEEL.brakeMark = null;
  });
  await page.keyboard.down('KeyW');
  const reached30 = await page
    .waitForFunction(() => window.__DEBUG.game.player.state.speed * 3.6 >= 30,
      { timeout: 9000, polling: 16 })
    .then(() => true).catch(() => false);
  const brakeFrom = await page.evaluate(() => {
    const F = window.__FEEL;
    const p = window.__DEBUG.game.player;
    F.brakeMark = {
      frame: F.frame, t: performance.now() - F.t0,
      speed: p.state.speed, x: p.state.pos.x, z: p.state.pos.z,
    };
    return p.state.speed * 3.6;
  });
  await page.keyboard.up('KeyW');
  await page.keyboard.down('Space');
  await sleep(3000);
  await page.keyboard.up('Space');
  drive.brake = await page.evaluate((from) => {
    const F = window.__FEEL;
    const M = F.brakeMark;
    const rows = F.speed.filter((s) => s.frame >= M.frame);
    let stopT = null, stopDist = null, firstDecelFrames = null;
    for (const s of rows) {
      if (firstDecelFrames == null && s.speed < M.speed - 0.05) firstDecelFrames = s.frame - M.frame;
      if (Math.abs(s.speed) < 0.15) {
        stopT = (s.t - M.t) / 1000;
        stopDist = Math.hypot(s.x - M.x, s.z - M.z);
        break;
      }
    }
    return { fromKmh: from, stopTimeS: stopT, stopDistM: stopDist, biteFrames: firstDecelFrames };
  }, brakeFrom);
  drive.brake.reached30 = reached30;
  await page.evaluate(() => { window.__DEBUG.game.player.state.speed = 0; });
  await sleep(400);
  // reverse launch
  await page.evaluate(() => {
    const p = window.__DEBUG.game.player;
    p.state.speed = 0; p.state._spool = 0;
    window.__FEEL.speed.length = 0;
    window.__FEEL.revMark = { frame: window.__FEEL.frame, t: performance.now() - window.__FEEL.t0 };
  });
  await page.keyboard.down('KeyS');
  await sleep(3000);
  await page.keyboard.up('KeyS');
  drive.reverse = await page.evaluate(() => {
    const F = window.__FEEL;
    const rows = F.speed.filter((s) => s.frame >= F.revMark.frame);
    const at = (kmh) => {
      for (const s of rows) if (-s.speed >= kmh / 3.6) return (s.t - F.revMark.t) / 1000;
      return null;
    };
    return { t5: at(5), t10: at(10), peakKmh: rows.length ? -Math.min(...rows.map((s) => s.speed)) * 3.6 : 0 };
  });
  // pivot rate from a standstill
  await page.evaluate(() => {
    const p = window.__DEBUG.game.player;
    p.state.speed = 0; p.state.yawRate = 0; p.state._spool = 0;
    window.__FEEL.speed.length = 0;
    window.__FEEL.pivMark = { frame: window.__FEEL.frame, t: performance.now() - window.__FEEL.t0 };
  });
  await page.keyboard.down('KeyA');
  await sleep(1600);
  await page.keyboard.up('KeyA');
  drive.pivot = await page.evaluate(() => {
    const F = window.__FEEL;
    const rows = F.speed.filter((s) => s.frame >= F.pivMark.frame);
    const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    if (rows.length < 3) return {};
    const swept = Math.abs(wrapA(rows[rows.length - 1].yaw - rows[0].yaw)) * 57.2958;
    const dtS = (rows[rows.length - 1].t - rows[0].t) / 1000;
    // frames until the hull yaw actually starts moving
    let f0 = null;
    for (let i = 0; i < rows.length; i++) {
      if (Math.abs(wrapA(rows[i].yaw - rows[0].yaw)) > 1e-4) { f0 = i; break; }
    }
    return { degPerS: swept / Math.max(dtS, 1e-6), startFrames: f0 };
  });
  results.drive = drive;
  console.log(`  first hull motion       ${drive.accel.firstMoveFrames} frames after W`);
  console.log(`  km/h at 300 ms          ${fmt(drive.accel.kmhAt300ms, 2)}`);
  console.log(`  km/h at 1.0 s           ${fmt(drive.accel.kmhAt1s, 2)}`);
  console.log(`  0-10 km/h               ${fmt(drive.accel.t10, 2)} s`);
  console.log(`  0-20 km/h               ${fmt(drive.accel.t20, 2)} s`);
  console.log(`  0-30 km/h               ${fmt(drive.accel.t30, 2)} s   (peak ${fmt(drive.accel.peakKmh, 1)} km/h)`);
  console.log(`  brake from ${fmt(drive.brake.fromKmh, 1)} km/h    ${fmt(drive.brake.stopTimeS, 2)} s / ${fmt(drive.brake.stopDistM, 2)} m, bites in ${drive.brake.biteFrames} frames`);
  console.log(`  reverse 0-10 km/h       ${fmt(drive.reverse.t10, 2)} s (peak ${fmt(drive.reverse.peakKmh, 1)})`);
  console.log(`  pivot rate              ${fmt(drive.pivot.degPerS, 1)} deg/s, starts in ${drive.pivot.startFrames} frames`);

  // ==========================================================================
  // 3. FIRE CHAIN
  // ==========================================================================
  console.log('\n[feel] === 3. fire chain ===');
  const fire = { shots: [] };
  for (let shot = 0; shot < 5; shot++) {
    // Find a live, muzzle-clear target. The battle AI can move the initially
    // visible enemy behind cover while the drive trials run, so a one-shot
    // aim request occasionally returned null and the probe fired into dirt.
    const target = await page.evaluate(() => {
      const D = window.__DEBUG;
      const p = D.game.player;
      // This is a fire-feedback instrument, not a survivability trial: keep
      // incoming module damage from disabling the trigger halfway through.
      p.combat.hp = Math.max(p.combat.hp, 50000);
      for (const m of Object.values(p.combat.modules || {})) if (m && m.state) m.state = 'green';
      for (let retry = 0; retry < 12; retry++) {
        const aimed = D.aimAtNearest && D.aimAtNearest();
        if (aimed) return aimed;
        if (D.fastForward) D.fastForward(0.5);
      }
      return null;
    });
    if (!target) throw new Error(`no clear fire-chain target for shot ${shot + 1}`);
    // debugAimAtNearest moves the camera immediately but the physical turret
    // must still traverse. Firing before this gate made every trial terminate
    // in the nearby terrain on frame zero and measured no combat feedback.
    await page.waitForFunction(
      () => {
        const s = window.__DEBUG.aimState && window.__DEBUG.aimState();
        return s && s.errMrad <= 1.2 && s.reloadT <= 0.001 &&
          s.blockedDistM == null && s.bloomF <= 1.3;
      },
      { timeout: 12000, polling: 16 },
    ).catch(() => {});
    await page.evaluate(() => {
      const F = window.__FEEL;
      // Begin the observation window immediately before our click so enemy
      // muzzle events cannot be misattributed to this player's shot.
      F.events.length = 0;
      F.shotMark = { frame: F.frame, t: performance.now() - F.t0 };
    });
    const pre = await page.evaluate(() => {
      const p = window.__DEBUG.game.player;
      return {
        reloadT: p.combat.reload.t, destroyed: p.combat.destroyed,
        gun: p.combat.modules.gun ? p.combat.modules.gun.state : 'n/a',
        locked: window.__DEBUG.input.isLocked(), cursorAim: window.__DEBUG.input.isCursorAim(),
      };
    });
    await page.mouse.down();
    await page.mouse.up();
    await sleep(2600);
    // Keep the event window open through the ready edge. The old probe read
    // results at 2.6 s on a 6 s reload and therefore reported 0% by design.
    await page.waitForFunction(
      () => window.__DEBUG.game.player.combat.reload.t <= 0.001,
      { timeout: 25000, polling: 100 },
    ).catch(() => {});
    const s = await page.evaluate(() => {
      const F = window.__FEEL;
      const M = F.shotMark;
      const find = (type, pred) => F.events.find((e) => e.type === type && (!pred || pred(e)));
      const fired = find('shell:fired', (e) => e.isPlayer);
      const sid = fired ? fired.shellId : -1;
      // terminal event for OUR shell only (matched by shellId)
      const hit = find('shell:hit', (e) => e.attackerIsPlayer && e.shellId === sid);
      const exp = find('shell:expired', (e) => e.shellId === sid);
      const term = hit || exp;
      return {
        firedFrames: fired ? fired.frame - M.frame : null,
        firedMs: fired ? fired.t - M.t : null,
        muzzleFx: !!find('fx:muzzle'),
        muzzleFxFrames: find('fx:muzzle') ? find('fx:muzzle').frame - M.frame : null,
        rigRecoil: !!find('rig:recoil'),
        rigRecoilArg: find('rig:recoil') ? find('rig:recoil').arg : null,
        rigTrauma: !!find('rig:trauma'),
        rigTraumaArg: find('rig:trauma') ? find('rig:trauma').arg : null,
        termFrames: term && fired ? term.frame - fired.frame : null,
        termMs: term && fired ? term.t - fired.t : null,
        hitKind: hit ? hit.kind : null,
        hitDamage: hit ? hit.damage : null,
        reloadDone: !!find('reload:done'),
      };
    });
    s.pre = pre;
    fire.shots.push(s);
    await sleep(200);
  }
  const fired = fire.shots.filter((s) => s.firedFrames != null);
  fire.shotsAttempted = fire.shots.length;
  fire.shotsFired = fired.length;
  fire.firedFramesMean = fired.length ? fired.reduce((a, s) => a + s.firedFrames, 0) / fired.length : null;
  fire.firedMsMean = fired.length ? fired.reduce((a, s) => a + s.firedMs, 0) / fired.length : null;
  fire.muzzleFxRate = fired.length ? fired.filter((s) => s.muzzleFx).length / fired.length : null;
  fire.recoilRate = fired.length ? fired.filter((s) => s.rigRecoil).length / fired.length : null;
  fire.traumaRate = fired.length ? fired.filter((s) => s.rigTrauma).length / fired.length : null;
  fire.reloadCueRate = fired.length ? fired.filter((s) => s.reloadDone).length / fired.length : null;
  fire.recoilImpulse = fired.length ? fired[0].rigRecoilArg : null;
  fire.traumaImpulse = fired.length ? fired[0].rigTraumaArg : null;
  fire.hooks = await page.evaluate(() => window.__FEEL.hooks);
  results.fire = fire;
  console.log(`  shots fired             ${fire.shotsFired}/${fire.shotsAttempted}`);
  console.log(`  LMB -> shell:fired      ${fmt(fire.firedFramesMean, 2)} frames (${fmt(fire.firedMsMean, 1)} ms)`);
  console.log(`  muzzle fx on every shot ${fmt((fire.muzzleFxRate || 0) * 100, 0)}%   hooks=${JSON.stringify(fire.hooks)}`);
  console.log(`  camera recoil kick      ${fmt((fire.recoilRate || 0) * 100, 0)}%  impulse=${fire.recoilImpulse}`);
  console.log(`  trauma shake            ${fmt((fire.traumaRate || 0) * 100, 0)}%  impulse=${fire.traumaImpulse}`);
  console.log(`  reload-complete cue     ${fmt((fire.reloadCueRate || 0) * 100, 0)}%`);
  for (const s of fire.shots) {
    console.log(`    shot: fired=${s.firedFrames}f term=${s.termFrames}f (${fmt(s.termMs, 0)} ms) kind=${s.hitKind} dmg=${fmt(s.hitDamage, 0)}  [pre reloadT=${fmt(s.pre.reloadT, 3)} gun=${s.pre.gun} locked=${s.pre.locked} dead=${s.pre.destroyed}]`);
  }

  // ==========================================================================
  // 4. FRAME PACING during a combined drive + fire run
  // ==========================================================================
  console.log('\n[feel] === 4. frame pacing (drive + fire, 14 s) ===');
  await page.evaluate(() => { window.__FEEL.frameTimes.length = 0; window.__FEEL.events.length = 0; });
  await page.keyboard.down('KeyW');
  const t0 = Date.now();
  let turn = 0;
  while (Date.now() - t0 < 14000) {
    // serpentine + mouselook + fire whenever loaded
    const key = turn % 2 === 0 ? 'KeyA' : 'KeyD';
    await page.keyboard.down(key);
    await page.mouse.move(640 + (turn % 4) * 40 - 60, 360 + ((turn % 3) - 1) * 25);
    await sleep(420);
    await page.keyboard.up(key);
    const ready = await page.evaluate(() => window.__DEBUG.game.player.combat.reload.t <= 0.001);
    if (ready) { await page.mouse.down(); await page.mouse.up(); }
    await sleep(220);
    turn++;
  }
  await page.keyboard.up('KeyW');
  const pacing = await page.evaluate(() => {
    const raw = window.__FEEL.frameTimes.slice();
    const ft = raw.filter((x) => x > 0.2).sort((a, b) => a - b);
    const q = (p) => (ft.length ? ft[Math.min(ft.length - 1, Math.floor(ft.length * p))] : null);
    const mean = ft.length ? ft.reduce((a, b) => a + b, 0) / ft.length : null;
    return {
      frames: ft.length, meanMs: mean, fps: mean ? 1000 / mean : null,
      p50: q(0.5), p95: q(0.95), p99: q(0.99), max: ft.length ? ft[ft.length - 1] : null,
      // hitches: a frame more than 2x / 4x the median (what a player reads as a stutter)
      hitch2x: ft.filter((x) => x > 2 * q(0.5)).length,
      hitch4x: ft.filter((x) => x > 4 * q(0.5)).length,
      over50ms: ft.filter((x) => x > 50).length,
      heapMB: performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null,
      // WHEN the hitches landed (frame index into the run) — a cluster in the
      // first second is warm-up (shader/GLB), a spread is a live-loop problem.
      hitchAt: raw.map((x, i) => (x > 50 ? { i, ms: Math.round(x) } : null)).filter(Boolean).slice(0, 12),
      runFrames: raw.length,
    };
  });
  results.pacing = pacing;
  console.log(`  frames                  ${pacing.frames}  mean ${fmt(pacing.meanMs, 2)} ms (${fmt(pacing.fps, 1)} fps)`);
  console.log(`  p50 / p95 / p99 / max   ${fmt(pacing.p50, 2)} / ${fmt(pacing.p95, 2)} / ${fmt(pacing.p99, 2)} / ${fmt(pacing.max, 2)} ms`);
  console.log(`  hitches >2x / >4x p50   ${pacing.hitch2x} / ${pacing.hitch4x}   (>50 ms: ${pacing.over50ms})`);
  console.log(`  hitches at frame        ${JSON.stringify(pacing.hitchAt)} of ${pacing.runFrames}`);
  console.log(`  heap                    ${fmt(pacing.heapMB, 1)} MB`);

  if (shots) {
    mkdirSync(shots, { recursive: true });
    await page.screenshot({ path: `${shots}/feel_${label}_battle.png` });
    console.log(`  screenshot -> ${shots}/feel_${label}_battle.png`);
  }
} catch (err) {
  failed = true;
  console.error(`[feel] FAILED: ${err.message}`);
  results.error = err.message;
} finally {
  results.pageErrors = pageErrors.slice(0, 20);
  if (pageErrors.length) {
    console.error(`[feel] page errors (${pageErrors.length}):`);
    for (const e of pageErrors.slice(0, 10)) console.error(`  ${e}`);
  }
  if (jsonOut) {
    mkdirSync(dirname(jsonOut), { recursive: true });
    writeFileSync(jsonOut, JSON.stringify(results, null, 2));
    console.log(`\n[feel] wrote ${jsonOut}`);
  }
  await browser.close();
  await server.close();
}
process.exit(failed ? 1 : 0);
