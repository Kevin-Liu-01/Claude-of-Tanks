// TEMP fx motion/composition probe (effects_combat r4 verification).
// Usage: node tools/fxprobe.mjs [phase...]   phases: composed live destroy detrack flyby
// Captures mid-motion frames + measures the muzzle-flash center-of-brightness
// against the projected barrel tip. Outputs to shots/fxprobe/.
// Live phases pin the fx clock (fx.setFrozen(true, T)) at the event moment —
// the fx clock otherwise advances on real RAF time, not sim fastForward time.

import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const phases = process.argv.slice(2).length ? process.argv.slice(2)
  : ['composed', 'live', 'destroy', 'detrack', 'flyby'];
const outDir = resolve('shots/fxprobe');
mkdirSync(outDir, { recursive: true });

const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { port: 5900 + Math.floor(Math.random() * 90), strictPort: false } });
await server.listen();
const url = `http://localhost:${server.config.server.port}/`;
const browser = await puppeteer.launch({ headless: 'new', protocolTimeout: 300000, args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
const errs = [];
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon')) errs.push(m.text()); });
page.on('pageerror', (e) => errs.push(String(e)));

async function ready() {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 90000 });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function shot(name) {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log(`[fxprobe] ${name}.png`);
}

// In-page: project the player's muzzle to screen px and scan the presented
// frame for the brightest pixel cluster near the muzzle (radius-limited so
// bright sky never dominates the centroid).
const MEASURE = `(function measure(thresh, radius) {
  const D = window.__DEBUG;
  const cam = D.camera, renderer = D.renderer;
  const p = D.game.player;
  const v = D.rig.aimPoint.clone();
  p.visual.gunMuzzleWorld(v);
  const w = renderer.domElement.width, h = renderer.domElement.height;
  const pv = v.clone().project(cam);
  const mx = (pv.x * 0.5 + 0.5) * w, my = (-pv.y * 0.5 + 0.5) * h;
  D.post.render(0);
  const gl = renderer.getContext();
  const buf = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  let sx = 0, sy = 0, n = 0, maxL = 0, atMuzzle = 0;
  for (let y = 0; y < h; y += 2) {
    const wy = h - 1 - y; // window-space y for radius test (gl origin bottom-left)
    for (let x = 0; x < w; x += 2) {
      const i = (y * w + x) * 4;
      const L = 0.299 * buf[i] + 0.587 * buf[i + 1] + 0.114 * buf[i + 2];
      const d = Math.hypot(x - mx, wy - my);
      if (d < 14 && L > atMuzzle) atMuzzle = L;
      if (d > radius) continue;
      if (L > maxL) maxL = L;
      if (L >= thresh) { sx += x; sy += wy; n++; }
    }
  }
  return { muzzlePx: [Math.round(mx), Math.round(my)],
           brightCentroidPx: n ? [Math.round(sx / n), Math.round(sy / n)] : null,
           brightCount: n, maxL: Math.round(maxL), lumAtMuzzle: Math.round(atMuzzle),
           distPx: n ? Math.round(Math.hypot(sx / n - mx, sy / n - my)) : -1 };
})`;

try {
  if (phases.includes('composed')) {
    await ready();
    for (const ageMs of [17, 50]) {
      await page.evaluate((age) => {
        const D = window.__DEBUG;
        window.__SHOTS.set('combat_firing');
        if (age !== 50) {
          D.fx.resetAll(); D.fx.resetSeed(5000);
          const p = D.game.player;
          const v1 = D.rig.aimPoint.clone(), v2 = D.rig.aimPoint.clone();
          p.visual.gunMuzzleWorld(v1); p.visual.gunPivotWorld(v2);
          const dir = v1.clone().sub(v2).normalize();
          D.fx.composeFiringMoment({ muzzlePos: v1, dir, caliberMm: 120, tracerType: 'APFSDS', ageS: age / 1000 });
        }
      }, ageMs);
      await sleep(1400);
      const m = await page.evaluate(`(${MEASURE})(230, 350)`);
      console.log(`[fxprobe] composed_${ageMs}ms measure:`, JSON.stringify(m));
      await shot(`composed_${ageMs}ms`);
    }
  }

  if (phases.includes('live')) {
    await ready();
    const fired = await page.evaluate(() => {
      const D = window.__DEBUG;
      D.startBattle('m1a2');
      D.rig.update(10, { mouseDX: 3, mouseDY: 0, wheel: 0, rmb: false, shiftPressed: false }); // skip flyby
      D.aimAtNearest();
      D.fastForward(4); // gun settles on target
      // side-on external camera at the muzzle (the gate is judged side-on)
      const p = D.game.player;
      const muz = D.rig.aimPoint.clone(); p.visual.gunMuzzleWorld(muz);
      const piv = D.rig.aimPoint.clone(); p.visual.gunPivotWorld(piv);
      const dir = muz.clone().sub(piv).normalize();
      const up = D.rig.aimPoint.clone().set(0, 1, 0);
      const side = dir.clone().cross(up).normalize();
      const look = muz.clone().addScaledVector(dir, 0.4);
      const cam = look.clone().addScaledVector(side, 10); cam.y += 1.0;
      D.rig.setExternalPose(cam, look, 45);
      // pin the fx clock, then single-step until the PLAYER's shell spawns
      D.fx.setFrozen(true, 500);
      const mine = () => D.game.shells.some((s) => s.isPlayer && !s.dead);
      D.flags.forceFire = true;
      for (let i = 0; i < 240 && !mine(); i++) D.fastForward(1 / 60);
      D.flags.forceFire = false;
      return mine();
    });
    console.log('[fxprobe] live shell spawned:', fired);
    // freeze the live sim between captures (phase toggling): otherwise the
    // RAF loop keeps stepping the battle in real time and the shell/lights
    // have moved on long before the screenshot lands
    await page.evaluate(() => { window.__DEBUG.game.phase = 'shot'; });
    let t = 0;
    for (const age of [0.017, 0.05, 0.09, 0.15, 0.25, 0.35]) {
      await page.evaluate((o) => {
        const D = window.__DEBUG;
        D.game.phase = 'battle';
        if (o.dt > 0) D.fastForward(o.dt);         // shell/recoil advance
        D.game.phase = 'shot';
        D.fx.setFrozen(true, 500 + o.age);          // view the fx at this age
      }, { dt: age - t, age });
      t = age;
      const name = `live_fire_${String(Math.round(age * 1000)).padStart(3, '0')}ms`;
      if (age <= 0.05) {
        const m = await page.evaluate(`(${MEASURE})(230, 350)`);
        console.log(`[fxprobe] ${name} measure:`, JSON.stringify(m));
      }
      await shot(name);
    }
    await page.evaluate(() => { window.__DEBUG.game.phase = 'battle'; });
    // sniper-scope flood check: re-fire scoped after reload
    await page.evaluate(() => {
      const D = window.__DEBUG;
      D.fx.setFrozen(false);
      D.rig.release();
      D.aimAtNearest();
      D.fastForward(8); // reload
      D.fx.setFrozen(true, 900);
      const n = D.game.shells.filter((s) => s.isPlayer).length;
      D.flags.forceFire = true;
      for (let i = 0; i < 600 && D.game.shells.filter((s) => s.isPlayer).length <= n; i++) D.fastForward(1 / 60);
      D.flags.forceFire = false;
      D.fastForward(0.05);
      D.fx.setFrozen(true, 900.05);
    });
    await shot('live_scoped_050ms');
  }

  if (phases.includes('destroy')) {
    await ready();
    await page.evaluate(() => {
      const D = window.__DEBUG;
      D.startBattle('m1a2');
      D.rig.update(10, { mouseDX: 3, mouseDY: 0, wheel: 0, rmb: false, shiftPressed: false });
      const tgt = D.game.tanks.find((t) => t.team === 'enemy' && t.combat && !t.combat.destroyed);
      tgt.combat.hp = 0; tgt.combat.destroyed = true; tgt._destroyedAnnounced = true;
      D.fx.setFrozen(true, 500);
      tgt.visual.setDestroyed({ pop: true });
      D.bus.emit('tank:destroyed', { id: tgt.id, specId: tgt.specId, pos: [tgt.state.pos.x, tgt.state.pos.y, tgt.state.pos.z], killerId: D.game.player.id, cause: 'ammorack' });
      const v = D.rig.aimPoint.clone().set(tgt.state.pos.x, tgt.state.pos.y + 1.2, tgt.state.pos.z);
      const c = v.clone(); c.x += 14; c.y += 5; c.z += 10;
      D.rig.setExternalPose(c, v, 45);
    });
    let t = 0;
    for (const age of [0.15, 0.6, 1.0, 1.6, 2.6, 4.0]) {
      await page.evaluate((o) => {
        const D = window.__DEBUG;
        if (o.dt > 0) D.fastForward(o.dt);
        D.fx.setFrozen(true, 500 + o.age);
      }, { dt: age - t, age });
      t = age;
      await shot(`destroy_${String(age).replace('.', '_')}s`);
    }
  }

  if (phases.includes('detrack')) {
    await ready();
    await page.evaluate(() => {
      const D = window.__DEBUG;
      D.startBattle('m1a2');
      D.rig.update(10, { mouseDX: 3, mouseDY: 0, wheel: 0, rmb: false, shiftPressed: false });
      // ally: enemies are spotting-gated invisible in battle phase
      const tgt = D.game.tanks.find((t) => !t.isPlayer && t.team !== 'enemy' && t.combat && !t.combat.destroyed);
      D.fx.setFrozen(true, 500);
      tgt.visual.setTrackState('trackL', true);
      D.bus.emit('shell:hit', { pos: [tgt.state.pos.x, tgt.state.pos.y + 0.5, tgt.state.pos.z], normal: [0, 1, 0], targetId: tgt.id, kind: 'nonpen', caliberMm: 120 });
      D.bus.emit('module:state', { id: tgt.id, module: 'trackL', state: 'red' });
      const v = D.rig.aimPoint.clone().set(tgt.state.pos.x, tgt.state.pos.y + 1.0, tgt.state.pos.z);
      const yaw = tgt.state.yaw;
      // rear-LEFT quarter so the broken left track faces the camera
      const c = v.clone(); c.x += Math.sin(yaw + Math.PI * 0.72) * 9; c.z += Math.cos(yaw + Math.PI * 0.72) * 9; c.y += 3.0;
      D.rig.setExternalPose(c, v, 45);
    });
    let t = 0;
    for (const age of [0.25, 0.85]) {
      await page.evaluate((o) => {
        const D = window.__DEBUG;
        if (o.dt > 0) D.fastForward(o.dt);
        D.fx.setFrozen(true, 500 + o.age);
      }, { dt: age - t, age });
      t = age;
      await shot(`detrack_${String(age).replace('.', '_')}s`);
    }
  }

  if (phases.includes('flyby')) {
    await ready();
    await page.evaluate(() => { window.__DEBUG.startBattle('m1a2'); });
    await sleep(250);
    await shot('flyby_start');
    await sleep(950);
    await shot('flyby_mid');
  }
} catch (e) {
  console.error('[fxprobe] FAILED:', e.message);
  process.exitCode = 1;
} finally {
  if (errs.length) { console.error(`[fxprobe] console errors (${errs.length}):`); for (const e of errs.slice(0, 20)) console.error('  ' + e); }
  await browser.close();
  await server.close();
}
