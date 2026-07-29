// TEMP fx r5 VERIFY — replays the critic's motion methodology after the
// r5 fixes: stepped live shell-kill of the GLB m1a2_tusk (turret-presence
// assertion at each step), close fire sequence (dust/smoke/recoil), meadow
// drive (off-road wake). Output: shots/fx_r5_verify/.
import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const outDir = resolve('shots/fx_r5_verify');
mkdirSync(outDir, { recursive: true });

const server = await createServer({
  root: process.cwd(), logLevel: 'error',
  server: { port: 5700 + Math.floor(Math.random() * 90), strictPort: false, hmr: false, watch: { ignored: ['**/*'] } },
});
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
  console.log(`[verify] ${name}.png`);
}

try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });
  await page.evaluate(() => { window.__DEBUG.startBattle('m1a2'); });
  await sleep(6000);

  // ---- C. stepped live shell kill of the m1a2_tusk ------------------------
  const killed = await page.evaluate(() => {
    const D = window.__DEBUG;
    D.game.phase = 'battle';
    D.fx.setFrozen(false);
    D.rig.release();
    const p = D.game.player;
    const tgt = D.game.tanks.find((tk) => tk.team === 'enemy' && tk.specId === 'm1a2_tusk' && tk.combat && !tk.combat.destroyed)
      || D.game.tanks.find((tk) => tk.team === 'enemy' && tk.combat && !tk.combat.destroyed);
    const muz = D.rig.aimPoint.clone(); p.visual.gunMuzzleWorld(muz);
    const piv = D.rig.aimPoint.clone(); p.visual.gunPivotWorld(piv);
    const dir = muz.clone().sub(piv).normalize(); dir.y = 0; dir.normalize();
    tgt.state.pos.set(p.state.pos.x + dir.x * 46, p.state.pos.y + 1.5, p.state.pos.z + dir.z * 46);
    tgt.state.yaw = p.state.yaw + Math.PI / 2;
    tgt.combat.hp = 1;
    tgt.visual.setVisible(true);
    p.input.aimPoint.set(tgt.state.pos.x, tgt.state.pos.y + 1.2, tgt.state.pos.z);
    D.fastForward(6.5);
    const v = D.rig.aimPoint.clone().set(tgt.state.pos.x, tgt.state.pos.y + 2.4, tgt.state.pos.z);
    const az = tgt.state.yaw + 2.4;
    const cam = v.clone(); cam.x += Math.sin(az) * 15; cam.z += Math.cos(az) * 15; cam.y += 7.5;
    D.rig.setExternalPose(cam, v, 45);
    D.fx.setFrozen(true, 900);
    const n0 = D.game.shells.filter((s) => s.isPlayer).length;
    D.flags.forceFire = true;
    for (let i = 0; i < 400 && D.game.shells.filter((s) => s.isPlayer).length <= n0; i++) D.fastForward(1 / 60);
    D.flags.forceFire = false;
    for (let i = 0; i < 120 && !tgt.combat.destroyed; i++) D.fastForward(1 / 60);
    D.game.phase = 'shot';
    window.__VICTIM = tgt.id;
    return { destroyed: tgt.combat.destroyed, id: tgt.id };
  });
  console.log('[verify] kill:', JSON.stringify(killed));
  let t = 0;
  for (const age of [0.1, 0.25, 0.55, 0.9, 1.5, 2.5, 4.5, 7.0]) {
    const probe = await page.evaluate((o) => {
      const D = window.__DEBUG;
      D.game.phase = 'battle';
      if (o.dt > 0) D.fastForward(o.dt);
      D.game.phase = 'shot';
      D.fx.setFrozen(true, 900 + o.age);
      const tgt = D.game.tanks.find((tk) => tk.id === window.__VICTIM);
      tgt.visual.setVisible(true);
      // TURRET-PRESENCE ASSERTION: a destroyed visual must still contain a
      // visible turret mesh (attached, airborne or landed).
      const root = tgt.visual.root;
      const V3 = tgt.state.pos.constructor;
      let tg = null;
      root.traverse((n) => { if (!tg && n.children && n.children.some((c) => /TurretPivot/i.test(c.name || ''))) tg = n; });
      let turretMeshes = 0, charred = 0, painted = 0, minY = 1e9, maxY = -1e9;
      if (tg) tg.traverse((n) => {
        if (n.isMesh && n.visible && !/shadowProxy/.test(n.name || '')) {
          turretMeshes++;
          const wp = n.getWorldPosition(new V3());
          minY = Math.min(minY, wp.y); maxY = Math.max(maxY, wp.y);
          if ((n.material.name || '') === '') charred++; else painted++;
        }
      });
      return { turretMeshes, charred, painted, tgY: tg ? +tg.position.y.toFixed(2) : null, span: `${minY.toFixed(1)}-${maxY.toFixed(1)}` };
    }, { dt: age - t, age });
    t = age;
    console.log(`[verify] @${age}s turret: ${JSON.stringify(probe)}${probe.turretMeshes > 0 ? ' OK' : ' *** TURRET MISSING ***'}`);
    await shot(`kill_${String(age).replace('.', '_')}s`);
  }

  // ---- A. live meadow drive (off-road dust wake) --------------------------
  await page.evaluate(() => { const c = document.querySelector('canvas'); if (c) c.focus(); });
  await page.evaluate(() => {
    const D = window.__DEBUG;
    D.game.phase = 'battle';
    D.fx.setFrozen(false);
    D.rig.release(); // back to the chase camera for the drive frames
    D.game.player.state.yaw += 0.9;
  });
  await page.keyboard.down('KeyW');
  await sleep(2400); await shot('drive_24');
  await sleep(1400); await shot('drive_38');
  await page.keyboard.up('KeyW');

  // ---- B. deterministic close fire (flash + dust + smoke + recoil) --------
  const fired = await page.evaluate(() => {
    const D = window.__DEBUG;
    D.rig.release();
    D.aimAtNearest();
    D.game.phase = 'battle';
    D.fastForward(3);
    const p = D.game.player;
    const muz = D.rig.aimPoint.clone(); p.visual.gunMuzzleWorld(muz);
    const piv = D.rig.aimPoint.clone(); p.visual.gunPivotWorld(piv);
    const dir = muz.clone().sub(piv).normalize();
    const up = muz.clone().set(0, 1, 0);
    const side = dir.clone().cross(up).normalize();
    const look = piv.clone().addScaledVector(dir, 1.2); look.y += 0.2;
    const cam = look.clone().addScaledVector(side, 13); cam.y += 1.6;
    D.rig.setExternalPose(cam, look, 45);
    D.fx.setFrozen(true, 500);
    const n0 = D.game.shells.filter((s) => s.isPlayer).length;
    D.flags.forceFire = true;
    for (let i = 0; i < 300 && D.game.shells.filter((s) => s.isPlayer).length <= n0; i++) D.fastForward(1 / 60);
    D.flags.forceFire = false;
    D.game.phase = 'shot';
    const m0 = D.rig.aimPoint.clone(); p.visual.gunMuzzleWorld(m0);
    window.__REC = [{ age: 0, x: m0.x, y: m0.y, z: m0.z }];
    return D.game.shells.filter((s) => s.isPlayer).length > n0;
  });
  console.log('[verify] fire staged:', fired);
  t = 0;
  for (const age of [0.017, 0.1, 0.3, 0.9]) {
    await page.evaluate((o) => {
      const D = window.__DEBUG;
      D.game.phase = 'battle';
      if (o.dt > 0) D.fastForward(o.dt);
      D.game.phase = 'shot';
      D.fx.setFrozen(true, 500 + o.age);
      const m = D.rig.aimPoint.clone(); D.game.player.visual.gunMuzzleWorld(m);
      window.__REC.push({ age: o.age, x: m.x, y: m.y, z: m.z });
    }, { dt: age - t, age });
    t = age;
    await shot(`fire_${String(Math.round(age * 1000)).padStart(3, '0')}ms`);
  }
  const rec = await page.evaluate(() => window.__REC);
  const r0 = rec[0];
  console.log('[verify] recoil muzzle travel (m):', rec.map((r) => `${r.age}s:${Math.hypot(r.x - r0.x, r.y - r0.y, r.z - r0.z).toFixed(3)}`).join(' '));

  // ---- D. de-track (ribbon + wheel scatter) -------------------------------
  await page.evaluate(() => {
    const D = window.__DEBUG;
    D.game.phase = 'battle';
    D.fx.setFrozen(false);
    const tgt = D.game.tanks.find((tk) => tk.team === 'enemy' && tk.combat && !tk.combat.destroyed && tk.visual);
    tgt.visual.setTrackState('trackL', true);
    D.bus.emit('module:state', { id: tgt.id, module: 'trackL', state: 'red' });
    D.fastForward(0.5);
    tgt.visual.setVisible(true);
    const st = tgt.state;
    const az = st.yaw - 2.0;
    const look = D.rig.aimPoint.clone().set(st.pos.x, st.pos.y + 1.0, st.pos.z);
    const cam = look.clone(); cam.x += Math.sin(az) * 11; cam.z += Math.cos(az) * 11; cam.y += 2.4;
    D.rig.setExternalPose(cam, look, 45);
    D.game.phase = 'shot';
  });
  await sleep(200); await shot('detrack_live');
} catch (e) {
  console.error('[verify] FAILED:', e.message);
  process.exitCode = 1;
} finally {
  if (errs.length) { console.error(`[verify] console errors (${errs.length}):`); for (const er of errs.slice(0, 15)) console.error('  ' + er); process.exitCode = 1; }
  await browser.close();
  await server.close();
}
