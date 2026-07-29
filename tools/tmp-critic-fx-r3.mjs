// TEMP critic probe (effects_combat r3 judging) — capture mid-motion frame
// sequences: battle-start flyby, live rough-ground drive (suspension/dust),
// deterministic fire sequence (flash/recoil/smoke), tracer+impact wide shot,
// and a real shell-kill destruction sequence. Output: shots/critic_fx_r3/.
import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const outDir = resolve('shots/critic_fx_r3');
mkdirSync(outDir, { recursive: true });

const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { port: 5600 + Math.floor(Math.random() * 90), strictPort: false } });
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

  // ---- A. battle-start flyby (live, wall clock) -------------------------
  await page.evaluate(() => { window.__DEBUG.startBattle('m1a2'); });
  await sleep(200); await shot('flyby_02');
  await sleep(600); await shot('flyby_08');
  await sleep(700); await shot('flyby_15');
  await sleep(700); await shot('flyby_22');
  await sleep(700); await shot('flyby_29');
  await sleep(800); await shot('flyby_37'); // should be handed off to chase cam

  // ---- B. live drive over rough ground (chase cam, real keyboard) -------
  await sleep(600);
  await page.evaluate(() => { const c = document.querySelector('canvas'); if (c) c.focus(); });
  // telemetry sampler: speed, visual pitch/roll, y — 25 Hz
  await page.evaluate(() => {
    const D = window.__DEBUG;
    window.__TEL = [];
    window.__TELIV = setInterval(() => {
      const s = D.game.player.state;
      window.__TEL.push({ t: D.game.timeS, v: +s.speed.toFixed(2), p: +s.visualPitch.toFixed(4), r: +s.visualRoll.toFixed(4), y: +s.pos.y.toFixed(2) });
    }, 40);
  });
  await page.keyboard.down('KeyW');
  await sleep(900); await shot('drive_09');
  await sleep(700); await shot('drive_16');
  await page.keyboard.down('KeyD'); // carve a turn for sway
  await sleep(700); await shot('drive_23');
  await sleep(700); await shot('drive_30');
  await page.keyboard.up('KeyD');
  await sleep(700); await shot('drive_37');
  await sleep(900); await shot('drive_46');
  await page.keyboard.up('KeyW');
  const tel = await page.evaluate(() => { clearInterval(window.__TELIV); return window.__TEL; });
  console.log('[critic] drive telemetry n=' + tel.length);
  const mv = tel.filter((s) => s.v > 0.5);
  const pmin = Math.min(...tel.map((s) => s.p)), pmax = Math.max(...tel.map((s) => s.p));
  const rmin = Math.min(...tel.map((s) => s.r)), rmax = Math.max(...tel.map((s) => s.r));
  console.log(`[critic] speed max=${Math.max(...tel.map((s) => s.v))} moving=${mv.length}/${tel.length} pitch[${pmin},${pmax}] roll[${rmin},${rmax}]`);

  // ---- C. deterministic fire close-up (side cam at muzzle) --------------
  const fired = await page.evaluate(() => {
    const D = window.__DEBUG;
    D.aimAtNearest();
    D.game.phase = 'battle';
    D.fastForward(3); // gun settles
    const p = D.game.player;
    const muz = D.rig.aimPoint.clone(); p.visual.gunMuzzleWorld(muz);
    const piv = D.rig.aimPoint.clone(); p.visual.gunPivotWorld(piv);
    const dir = muz.clone().sub(piv).normalize();
    const up = muz.clone().set(0, 1, 0);
    const side = dir.clone().cross(up).normalize();
    // frame the whole tank side-on so recoil travel + hull rock are visible
    const look = piv.clone().addScaledVector(dir, 1.2); look.y += 0.2;
    const cam = look.clone().addScaledVector(side, 13); cam.y += 1.6;
    D.rig.setExternalPose(cam, look, 45);
    D.fx.setFrozen(true, 500);
    const n0 = D.game.shells.filter((s) => s.isPlayer).length;
    D.flags.forceFire = true;
    for (let i = 0; i < 300 && D.game.shells.filter((s) => s.isPlayer).length <= n0; i++) D.fastForward(1 / 60);
    D.flags.forceFire = false;
    D.game.phase = 'shot';
    return D.game.shells.filter((s) => s.isPlayer).length > n0;
  });
  console.log('[critic] close fire shell spawned:', fired);
  let t = 0;
  for (const age of [0.017, 0.05, 0.1, 0.18, 0.3, 0.5, 0.9]) {
    await page.evaluate((o) => {
      const D = window.__DEBUG;
      D.game.phase = 'battle';
      if (o.dt > 0) D.fastForward(o.dt);
      D.game.phase = 'shot';
      D.fx.setFrozen(true, 500 + o.age);
    }, { dt: age - t, age });
    t = age;
    await shot(`fire_close_${String(Math.round(age * 1000)).padStart(3, '0')}ms`);
  }

  // ---- D. tracer + impact + hit reaction (wide perpendicular cam) -------
  const impactOk = await page.evaluate(() => {
    const D = window.__DEBUG;
    D.game.phase = 'battle';
    D.fx.setFrozen(false);
    D.rig.release();
    const p = D.game.player;
    // teleport a healthy enemy 62 m ahead of the gun line
    const tgt = D.game.tanks.find((tk) => tk.team === 'enemy' && tk.combat && !tk.combat.destroyed);
    const muz = D.rig.aimPoint.clone(); p.visual.gunMuzzleWorld(muz);
    const piv = D.rig.aimPoint.clone(); p.visual.gunPivotWorld(piv);
    const dir = muz.clone().sub(piv).normalize(); dir.y = 0; dir.normalize();
    tgt.state.pos.set(p.state.pos.x + dir.x * 62, p.state.pos.y + 1.5, p.state.pos.z + dir.z * 62);
    tgt.state.yaw = p.state.yaw + Math.PI / 2; // side-on: guaranteed pen face
    tgt.combat.hp = Math.max(tgt.combat.hp, 800); // must SURVIVE (hit reaction, not kill)
    D.fastForward(1.2); // settle to ground + spotting tick
    // aim center mass
    p.input.aimPoint.set(tgt.state.pos.x, tgt.state.pos.y + 1.1, tgt.state.pos.z);
    D.fastForward(2.5);
    // wide camera perpendicular to the gun line, seeing muzzle AND target
    const mid = muz.clone().lerp(tgt.state.pos, 0.5); mid.y += 1.0;
    const side = dir.clone().cross(muz.clone().set(0, 1, 0)).normalize();
    const cam = mid.clone().addScaledVector(side, 44); cam.y += 4;
    D.rig.setExternalPose(cam, mid, 50);
    D.fx.setFrozen(true, 700);
    const n0 = D.game.shells.filter((s) => s.isPlayer).length;
    D.flags.forceFire = true;
    for (let i = 0; i < 400 && D.game.shells.filter((s) => s.isPlayer).length <= n0; i++) D.fastForward(1 / 60);
    D.flags.forceFire = false;
    D.game.phase = 'shot';
    return { fired: D.game.shells.filter((s) => s.isPlayer).length > n0, hp0: tgt.combat.hp };
  });
  console.log('[critic] impact stage:', JSON.stringify(impactOk));
  t = 0;
  for (const age of [0.017, 0.034, 0.05, 0.084, 0.15, 0.3, 0.6]) {
    await page.evaluate((o) => {
      const D = window.__DEBUG;
      D.game.phase = 'battle';
      if (o.dt > 0) D.fastForward(o.dt);
      D.game.phase = 'shot';
      D.fx.setFrozen(true, 700 + o.age);
    }, { dt: age - t, age });
    t = age;
    await shot(`impact_${String(Math.round(age * 1000)).padStart(3, '0')}ms`);
  }

  // ---- E. real shell-kill destruction sequence --------------------------
  const killed = await page.evaluate(() => {
    const D = window.__DEBUG;
    D.game.phase = 'battle';
    D.fx.setFrozen(false);
    D.rig.release();
    const p = D.game.player;
    const tgt = D.game.tanks.find((tk) => tk.team === 'enemy' && tk.combat && !tk.combat.destroyed);
    tgt.combat.hp = 1; // next pen kills through the REAL pipeline
    p.input.aimPoint.set(tgt.state.pos.x, tgt.state.pos.y + 1.2, tgt.state.pos.z);
    D.fastForward(6.5); // reload + settle
    // external cam framing the victim from 3/4 front, 20 m
    const v = D.rig.aimPoint.clone().set(tgt.state.pos.x, tgt.state.pos.y + 2.6, tgt.state.pos.z);
    const az = tgt.state.yaw + 2.4;
    const cam = v.clone(); cam.x += Math.sin(az) * 20; cam.z += Math.cos(az) * 20; cam.y += 4.5;
    D.rig.setExternalPose(cam, v, 45);
    D.fx.setFrozen(true, 900);
    const n0 = D.game.shells.filter((s) => s.isPlayer).length;
    D.flags.forceFire = true;
    for (let i = 0; i < 400 && D.game.shells.filter((s) => s.isPlayer).length <= n0; i++) D.fastForward(1 / 60);
    D.flags.forceFire = false;
    // step until the victim dies (shell flight ~0.05 s) or 1 s cap
    for (let i = 0; i < 60 && !tgt.combat.destroyed; i++) D.fastForward(1 / 60);
    D.game.phase = 'shot';
    return { destroyed: tgt.combat.destroyed, id: tgt.id };
  });
  console.log('[critic] kill stage:', JSON.stringify(killed));
  // NOTE: fx clock was pinned at 900 when the shell fired; the kill lands
  // ~0.05-0.1 s later. View ages are measured from firing.
  t = 0;
  for (const age of [0.1, 0.25, 0.55, 0.9, 1.5, 2.5, 4.5, 7.0]) {
    await page.evaluate((o) => {
      const D = window.__DEBUG;
      D.game.phase = 'battle';
      if (o.dt > 0) D.fastForward(o.dt);
      D.game.phase = 'shot';
      D.fx.setFrozen(true, 900 + o.age);
    }, { dt: age - t, age });
    t = age;
    await shot(`destroy_${String(age).replace('.', '_')}s`);
  }
} catch (e) {
  console.error('[critic] FAILED:', e.message);
  process.exitCode = 1;
} finally {
  if (errs.length) { console.error(`[critic] console errors (${errs.length}):`); for (const er of errs.slice(0, 15)) console.error('  ' + er); }
  await browser.close();
  await server.close();
}
