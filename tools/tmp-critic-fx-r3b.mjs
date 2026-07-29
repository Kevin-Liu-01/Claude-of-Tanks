// TEMP critic probe r3b — corrected recoil + destruction staging.
import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const outDir = resolve('shots/critic_fx_r3');
mkdirSync(outDir, { recursive: true });
const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { port: 5700 + Math.floor(Math.random() * 90), strictPort: false } });
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
  console.log(`[critic] ${name}.png`);
}

try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 90000 });

  // ---- C2. fire close-up: freeze IMMEDIATELY at shell spawn --------------
  const info = await page.evaluate(() => {
    const D = window.__DEBUG;
    D.startBattle('m1a2');
    D.rig.update(10, { mouseDX: 3, mouseDY: 0, wheel: 0, rmb: false, shiftPressed: false });
    D.aimAtNearest();
    D.fastForward(9); // battle-start full reload + gun settle
    D.aimAtNearest();
    D.fastForward(2);
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
    // barrel tip screen-x helps measure recoil travel across frames
    const v = D.rig.aimPoint.clone(); p.visual.gunMuzzleWorld(v);
    v.project(D.camera);
    return { fired: live(), steps, muzXpx: Math.round((v.x * 0.5 + 0.5) * 1600) };
  });
  console.log('[critic] fire2 stage:', JSON.stringify(info));
  let t = 0;
  const muzX = [];
  for (const age of [0.017, 0.067, 0.13, 0.22, 0.35, 0.6]) {
    const mx = await page.evaluate((o) => {
      const D = window.__DEBUG;
      D.game.phase = 'battle';
      if (o.dt > 0) D.fastForward(o.dt);
      D.game.phase = 'shot';
      D.fx.setFrozen(true, 500 + o.age);
      const p = D.game.player;
      const v = D.rig.aimPoint.clone(); p.visual.gunMuzzleWorld(v);
      v.project(D.camera);
      return Math.round((v.x * 0.5 + 0.5) * 1600);
    }, { dt: age - t, age });
    t = age;
    muzX.push({ age, mx });
    await shot(`fire2_${String(Math.round(age * 1000)).padStart(3, '0')}ms`);
  }
  console.log('[critic] muzzle screen-x by age (recoil trace):', JSON.stringify(muzX));

  // ---- E2. destruction: sticky-aim tracked victim, framed at kill -------
  const kd = await page.evaluate(() => {
    const D = window.__DEBUG;
    D.game.phase = 'battle';
    D.fx.setFrozen(false);
    D.rig.release();
    const p = D.game.player;
    // teleport victim 42 m ahead on the gun line, then sticky-aim it
    const tgt = D.game.tanks.find((tk) => tk.team === 'enemy' && tk.combat && !tk.combat.destroyed);
    const muz = D.rig.aimPoint.clone(); p.visual.gunMuzzleWorld(muz);
    const piv = D.rig.aimPoint.clone(); p.visual.gunPivotWorld(piv);
    const dir = muz.clone().sub(piv).normalize(); dir.y = 0; dir.normalize();
    tgt.state.pos.set(p.state.pos.x + dir.x * 42, p.state.pos.y + 1.2, p.state.pos.z + dir.z * 42);
    tgt.state.yaw = p.state.yaw + Math.PI / 2;
    tgt.combat.hp = 1;
    D.fastForward(0.8); // ground settle + spot
    D.aimAtNearest();   // sticky track (42 m — nearest by far)
    D.fastForward(4.5); // reload + gun settle ON the mover
    D.fx.setFrozen(true, 900);
    const live = () => D.game.shells.some((s) => s.isPlayer && !s.dead);
    D.flags.forceFire = true;
    let steps = 0;
    for (; steps < 200 && !live(); steps++) D.fastForward(1 / 60);
    D.flags.forceFire = false;
    // flight to 42 m is ~2 sim steps; step until destroyed (cap 0.5 s)
    let fs = 0;
    for (; fs < 30 && !tgt.combat.destroyed; fs++) D.fastForward(1 / 60);
    // camera: 3/4 view of the victim at its FINAL position, 18 m out
    const v = D.rig.aimPoint.clone().set(tgt.state.pos.x, tgt.state.pos.y + 2.4, tgt.state.pos.z);
    const az = tgt.state.yaw + 2.3;
    const cam = v.clone(); cam.x += Math.sin(az) * 19; cam.z += Math.cos(az) * 19; cam.y += 4.0;
    D.rig.setExternalPose(cam, v, 45);
    D.game.phase = 'shot';
    D.fx.setFrozen(true, 900 + (steps + fs) / 60);
    return { fired: live() || tgt.combat.destroyed, steps, fs, destroyed: tgt.combat.destroyed, id: tgt.id, spec: tgt.specId };
  });
  console.log('[critic] destroy2 stage:', JSON.stringify(kd));
  const base = (kd.steps + kd.fs) / 60;
  let tt = base;
  for (const age of [0.08, 0.2, 0.45, 0.8, 1.4, 2.4, 4.0, 6.5]) {
    const a = base + age;
    await page.evaluate((o) => {
      const D = window.__DEBUG;
      D.game.phase = 'battle';
      if (o.dt > 0) D.fastForward(o.dt);
      D.game.phase = 'shot';
      D.fx.setFrozen(true, 900 + o.a);
    }, { dt: a - tt, a });
    tt = a;
    await shot(`destroy2_${String(age).replace('.', '_')}s`);
  }
} catch (e) {
  console.error('[critic] FAILED:', e.message);
  process.exitCode = 1;
} finally {
  if (errs.length) { console.error(`[critic] console errors (${errs.length}):`); for (const er of errs.slice(0, 15)) console.error('  ' + er); }
  await browser.close();
  await server.close();
}
