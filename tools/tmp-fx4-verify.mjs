// TEMP fx r4 verify — motion frames for kill / fire / drive / tracer / flyby.
import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const outDir = resolve('shots/fx_r4');
mkdirSync(outDir, { recursive: true });
const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { port: 5600 + Math.floor(Math.random() * 90), strictPort: false, hmr: false } });
await server.listen();
const url = `http://localhost:${server.config.server.port}/`;
const browser = await puppeteer.launch({ headless: 'new', protocolTimeout: 300000, args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
const errs = [];
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon')) errs.push(m.text()); });
page.on('pageerror', (e) => errs.push(String(e)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function shot(name) {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log(`[fx4] ${name}.png`);
}
try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 90000 });

  // ---- A. FLYBY: real-time frames through the opening cinematic ----------
  await page.evaluate(() => { window.__DEBUG.startBattle('m1a2'); });
  for (const [name, ms] of [['flyby_a', 200], ['flyby_b', 800], ['flyby_c', 800], ['flyby_d', 900]]) {
    await sleep(ms);
    await shot(name);
  }
  await sleep(1500);

  // ---- B. CRITIC-FLOW REPLICA kill (frozen-stepped, ally race included) ---
  const kd = await page.evaluate(() => {
    const D = window.__DEBUG;
    D.rig.update(10, { mouseDX: 3, mouseDY: 0, wheel: 0, rmb: false, shiftPressed: false });
    D.aimAtNearest();
    D.fastForward(9);
    D.aimAtNearest();
    D.fastForward(2);
    const p = D.game.player;
    const tgt = D.game.tanks.find((tk) => tk.team === 'enemy' && tk.combat && !tk.combat.destroyed);
    const muz = D.rig.aimPoint.clone(); p.visual.gunMuzzleWorld(muz);
    const piv = D.rig.aimPoint.clone(); p.visual.gunPivotWorld(piv);
    const dir = muz.clone().sub(piv).normalize(); dir.y = 0; dir.normalize();
    tgt.state.pos.set(p.state.pos.x + dir.x * 42, p.state.pos.y + 1.2, p.state.pos.z + dir.z * 42);
    tgt.state.yaw = p.state.yaw + Math.PI / 2;
    tgt.combat.hp = 1;
    D.fastForward(0.8);
    D.aimAtNearest();
    D.fastForward(4.5);
    D.fx.setFrozen(true, 900);
    const live = () => D.game.shells.some((s) => s.isPlayer && !s.dead);
    // volley until the kill lands (ricochet dice) — re-pin the target and
    // re-lead before each shot so the sequence stays framed
    let steps = 0, fs = 0;
    for (let volley = 0; volley < 4 && !tgt.combat.destroyed; volley++) {
      tgt.state.pos.set(p.state.pos.x + dir.x * 42, p.state.pos.y + 1.2, p.state.pos.z + dir.z * 42);
      tgt.state.speed = 0;
      tgt.state.yaw = p.state.yaw + Math.PI / 2 - 0.5; // angled: better pen odds
      D.aimAtNearest();
      for (let k = 0; k < 40; k++) D.fastForward(1 / 60); // settle + reload tick
      D.flags.forceFire = true;
      for (steps = 0; steps < 260 && !live(); steps++) D.fastForward(1 / 60);
      D.flags.forceFire = false;
      for (fs = 0; fs < 30 && !tgt.combat.destroyed; fs++) D.fastForward(1 / 60);
    }
    const v = D.rig.aimPoint.clone().set(tgt.state.pos.x, tgt.state.pos.y + 2.4, tgt.state.pos.z);
    const az = tgt.state.yaw + 2.3;
    const cam = v.clone(); cam.x += Math.sin(az) * 19; cam.z += Math.cos(az) * 19; cam.y += 4.0;
    D.rig.setExternalPose(cam, v, 45);
    D.game.phase = 'shot';
    D.fx.setFrozen(true, 900 + (steps + fs) / 60);
    return { steps, fs, destroyed: tgt.combat.destroyed };
  });
  console.log('[fx4] kill stage:', JSON.stringify(kd));
  const base = (kd.steps + kd.fs) / 60;
  let tt = base;
  for (const age of [0.08, 0.45, 1.4, 4.0, 6.5]) {
    const a = base + age;
    await page.evaluate((o) => {
      const D = window.__DEBUG;
      D.game.phase = 'battle';
      if (o.dt > 0) D.fastForward(o.dt);
      D.game.phase = 'shot';
      D.fx.setFrozen(true, 900 + o.a);
    }, { dt: a - tt, a });
    tt = a;
    await shot(`kill_${String(age).replace('.', '_')}s`);
  }

  // ---- C. FIRE close-up (side-on, frozen-stepped like critic fire2) ------
  const fi = await page.evaluate(() => {
    const D = window.__DEBUG;
    D.game.phase = 'battle';
    D.fx.setFrozen(false);
    D.rig.release();
    D.aimAtNearest();
    D.fastForward(6);
    const p = D.game.player;
    const muz = D.rig.aimPoint.clone(); p.visual.gunMuzzleWorld(muz);
    const piv = D.rig.aimPoint.clone(); p.visual.gunPivotWorld(piv);
    const dir = muz.clone().sub(piv).normalize();
    const side = dir.clone().cross(muz.clone().set(0, 1, 0)).normalize();
    const look = piv.clone().addScaledVector(dir, 1.0); look.y += 0.1;
    const cam = look.clone().addScaledVector(side, 12); cam.y += 1.3;
    D.rig.setExternalPose(cam, look, 45);
    D.fx.setFrozen(true, 500);
    const live = () => D.game.shells.some((s) => s.isPlayer && !s.dead);
    D.flags.forceFire = true;
    let steps = 0;
    for (; steps < 300 && !live(); steps++) D.fastForward(1 / 60);
    D.flags.forceFire = false;
    D.game.phase = 'shot';
    return { fired: live(), steps };
  });
  console.log('[fx4] fire stage:', JSON.stringify(fi));
  let t = 0;
  for (const age of [0.017, 0.05, 0.1, 0.3]) {
    await page.evaluate((o) => {
      const D = window.__DEBUG;
      D.game.phase = 'battle';
      if (o.dt > 0) D.fastForward(o.dt);
      D.game.phase = 'shot';
      D.fx.setFrozen(true, 500 + o.age);
    }, { dt: age - t, age });
    t = age;
    await shot(`fire_${String(Math.round(age * 1000)).padStart(3, '0')}ms`);
  }

  // ---- D. TRACER motion: live unfrozen shot toward a far ridge -----------
  await page.evaluate(() => {
    const D = window.__DEBUG;
    D.game.phase = 'battle';
    D.fx.setFrozen(false);
    D.rig.release();
    D.fastForward(5); // reload
    const p = D.game.player;
    // chase-cam-ish external pose behind and above the player
    const fwd = D.rig.aimPoint.clone().set(Math.sin(p.state.yaw), 0, Math.cos(p.state.yaw));
    const cam = p.state.pos.clone().addScaledVector(fwd, -14); cam.y += 6;
    const look = p.state.pos.clone().addScaledVector(fwd, 30); look.y += 2;
    D.rig.setExternalPose(cam, look, 50);
    D.flags.forceFire = true;
    let steps = 0;
    const live = () => D.game.shells.some((s) => s.isPlayer && !s.dead);
    for (; steps < 200 && !live(); steps++) D.fastForward(1 / 60);
    D.flags.forceFire = false;
  });
  await shot('tracer_000ms');
  await sleep(150);
  await shot('tracer_150ms');
  await sleep(150);
  await shot('tracer_300ms');
  await sleep(300);
  await shot('tracer_600ms');

  // ---- E. DRIVE: road + grass wake at speed (real time) ------------------
  await page.evaluate(() => {
    const D = window.__DEBUG;
    D.fx.setFrozen(false);
    const p = D.game.player;
    p.input.throttle = 1;
    D.flags.forceFire = false;
    D.rig.release();
  });
  // let it accelerate in real time with the throttle pinned by fastForward pumps
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => {
      const D = window.__DEBUG;
      const p = D.game.player;
      p.input.throttle = 1;
      D.fastForward(0.9);
      // chase pose behind the moving tank
      const fwd = D.rig.aimPoint.clone().set(Math.sin(p.state.yaw), 0, Math.cos(p.state.yaw));
      const cam = p.state.pos.clone().addScaledVector(fwd, -15); cam.y += 5.5;
      const look = p.state.pos.clone().addScaledVector(fwd, 8); look.y += 1.5;
      D.rig.setExternalPose(cam, look, 50);
    });
    await shot(`drive_${i}`);
    await sleep(250);
  }
} catch (e) {
  console.error('[fx4] FAILED:', e.message);
  process.exitCode = 1;
} finally {
  if (errs.length) { console.error(`[fx4] console errors (${errs.length}):`); for (const er of errs.slice(0, 15)) console.error('  ' + er); }
  await browser.close();
  await server.close();
}
