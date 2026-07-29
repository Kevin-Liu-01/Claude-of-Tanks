// TEMP r7 fx verification probe: wreck burn (TUSK GLB), fire close-up (flash/
// recoil), clear-view AP impact (spall/flinch), framed de-track, meadow drive
// dust. Output: shots/critic_fx_r7/.
import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const outDir = resolve('shots/critic_fx_r7');
mkdirSync(outDir, { recursive: true });

const server = await createServer({
  root: process.cwd(), logLevel: 'error',
  server: { port: 5800 + Math.floor(Math.random() * 90), strictPort: false, hmr: false, watch: { ignored: ['**/*'] } },
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
  console.log(`[r7] ${name}.png`);
}
// re-frame the staged camera on the target every step (the critic's r6
// staging bug: the camera was posed once and the subject drifted out)
const FRAME_TGT = `(function (az, dist, up, cy) {
  const D = window.__DEBUG;
  const t = window.__TGT;
  const look = D.rig.aimPoint.clone().set(t.state.pos.x, t.state.pos.y + cy, t.state.pos.z);
  const cam = look.clone();
  cam.x += Math.sin(az) * dist; cam.z += Math.cos(az) * dist; cam.y += up;
  D.rig.setExternalPose(cam, look, 45);
})`;

try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });
  await page.evaluate(() => { window.__DEBUG.startBattle('m1a2'); });
  await sleep(3500); // GLB swaps land

  // ---- A. wreck burn on the TUSK GLB (ammo-rack destruction, stepped) ----
  await page.evaluate((frame) => {
    const D = window.__DEBUG;
    D.game.phase = 'battle';
    D.fx.setFrozen(false);
    D.rig.release();
    const tgt = D.game.tanks.find((tk) => tk.team === 'enemy' && tk.specId && tk.specId.includes('m1a2') && tk.combat && !tk.combat.destroyed)
      || D.game.tanks.find((tk) => tk.team === 'enemy' && tk.combat && !tk.combat.destroyed);
    window.__TGT = tgt;
    tgt.combat.destroyed = true; // stop the AI before staging
    // r7 staging: park the victim on OPEN flat ground 30-40 m from the
    // player so no bush/house occludes the wreck sequence
    const p = D.game.player;
    const dir = { x: Math.sin(p.state.yaw), z: Math.cos(p.state.yaw) };
    let best = null;
    for (const dm of [28, 34, 40]) {
      for (const lat of [-10, -5, 0, 5, 10]) {
        const x = p.state.pos.x + dir.x * dm - dir.z * lat;
        const z = p.state.pos.z + dir.z * dm + dir.x * lat;
        const g = D.world.heightField.getHeightAt(x, z);
        let rough = 0;
        for (const [ox, oz] of [[4, 0], [-4, 0], [0, 4], [0, -4]]) {
          rough = Math.max(rough, Math.abs(D.world.heightField.getHeightAt(x + ox, z + oz) - g));
        }
        if (!best || rough < best.rough) best = { x, z, g, rough };
      }
    }
    tgt.state.pos.set(best.x, best.g, best.z);
    tgt.visual.syncFromState(tgt.state);
    eval(frame)(tgt.state.yaw + 2.4, 18, 4.0, 2.4);
    D.fx.setFrozen(true, 900);
    const st = tgt.state;
    D.fx.destruction(D.rig.aimPoint.clone().set(st.pos.x, st.pos.y + 1.0, st.pos.z), tgt.visual, 'ammorack');
    tgt.visual.setVisible(true); // teleported enemy may be spotting-hidden
    D.game.phase = 'shot';
  }, FRAME_TGT);
  let t = 0;
  for (const age of [0.1, 0.25, 0.55, 0.9, 1.5, 2.5, 4.5, 8.0, 20.0]) {
    await page.evaluate((o) => {
      const D = window.__DEBUG;
      D.game.phase = 'battle';
      if (o.dt > 0) D.fastForward(o.dt);
      D.game.phase = 'shot';
      D.fx.setFrozen(true, 900 + o.age);
      // pull in close for the late charred-material frames
      const dist = o.age >= 4.5 ? 12 : 18;
      const up = o.age >= 4.5 ? 2.6 : 4.0;
      window.__TGT.visual.setVisible(true);
      eval(o.frame)(window.__TGT.state.yaw + 2.4, dist, up, 2.2);
    }, { dt: age - t, age, frame: FRAME_TGT });
    t = age;
    await shot(`destroy_${String(age).replace('.', '_')}s`);
  }

  // ---- B. fire close-up: flash size/petals/ground halo + recoil travel ----
  const fired = await page.evaluate(() => {
    const D = window.__DEBUG;
    D.game.phase = 'battle';
    D.fx.setFrozen(false);
    D.rig.release();
    D.aimAtNearest();
    D.fastForward(4);
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
  console.log('[r7] close fire shell spawned:', fired);
  t = 0;
  for (const age of [0.017, 0.05, 0.1, 0.18, 0.3, 0.5]) {
    await page.evaluate((o) => {
      const D = window.__DEBUG;
      D.game.phase = 'battle';
      if (o.dt > 0) D.fastForward(o.dt);
      D.game.phase = 'shot';
      D.fx.setFrozen(true, 500 + o.age);
      // honest telemetry: apply the new pin's pose BEFORE sampling (the r6
      // probe sampled the previous frame's pose — "0.000 m at 17 ms")
      D.game.player.visual.syncFromState(D.game.player.state);
      const m = D.rig.aimPoint.clone(); D.game.player.visual.gunMuzzleWorld(m);
      window.__REC.push({ age: o.age, x: m.x, y: m.y, z: m.z });
    }, { dt: age - t, age });
    t = age;
    await shot(`fire_close_${String(Math.round(age * 1000)).padStart(3, '0')}ms`);
  }
  const rec = await page.evaluate(() => {
    const D = window.__DEBUG;
    // one extra sync so the last pin's pose is applied before sampling
    D.game.player.visual.syncFromState(D.game.player.state);
    const m = D.rig.aimPoint.clone(); D.game.player.visual.gunMuzzleWorld(m);
    window.__REC[window.__REC.length - 1] = { age: 0.5, x: m.x, y: m.y, z: m.z };
    return window.__REC;
  });
  const r0 = rec[0];
  console.log('[r7] recoil muzzle travel (m rel fire):', rec.map((r) => `${r.age}s:${Math.hypot(r.x - r0.x, r.y - r0.y, r.z - r0.z).toFixed(3)}`).join(' '));

  // ---- C. clear-view AP impact: DETERMINISTIC pen VFX + flinch -----------
  const impactOk = await page.evaluate(() => {
    const D = window.__DEBUG;
    D.game.phase = 'battle';
    D.fx.setFrozen(false);
    D.rig.release();
    const p = D.game.player;
    const tgt = D.game.tanks.find((tk) => tk.team === 'enemy' && tk.combat && !tk.specId.includes('m1a2'))
      || D.game.tanks.find((tk) => tk.team === 'enemy' && tk.combat);
    window.__TGT = tgt;
    if (tgt.visual.resetDestroyed) tgt.visual.resetDestroyed();
    tgt.combat.destroyed = true; // freeze its AI; visual stays pristine
    const dir = { x: Math.sin(p.state.yaw), z: Math.cos(p.state.yaw) };
    let best = null;
    for (const dm of [40, 48, 56]) {
      for (const lat of [-8, -4, 0, 4, 8]) {
        const x = p.state.pos.x + dir.x * dm - dir.z * lat;
        const z = p.state.pos.z + dir.z * dm + dir.x * lat;
        const g = D.world.heightField.getHeightAt(x, z);
        let rough = 0;
        for (const [ox, oz] of [[4, 0], [-4, 0], [0, 4], [0, -4]]) {
          rough = Math.max(rough, Math.abs(D.world.heightField.getHeightAt(x + ox, z + oz) - g));
        }
        if (!best || rough < best.rough) best = { x, z, g, rough };
      }
    }
    tgt.state.pos.set(best.x, best.g, best.z);
    tgt.state.yaw = p.state.yaw + Math.PI / 2; // side-on to the shot line
    tgt.visual.syncFromState(tgt.state);
    tgt.visual.setVisible(true);
    // strike point: upper side hull facing the player, normal back at us
    const n = { x: -dir.x, z: -dir.z };
    const hit = D.rig.aimPoint.clone().set(
      tgt.state.pos.x + n.x * (tgt.spec.dims.widthM * 0.5),
      tgt.state.pos.y + 1.35,
      tgt.state.pos.z + n.z * (tgt.spec.dims.widthM * 0.5));
    const nrm = hit.clone().set(n.x, 0.08, n.z).normalize();
    // camera: front-quarter, 9 m out, slightly high — hit face on camera
    const look = D.rig.aimPoint.clone().set(tgt.state.pos.x, tgt.state.pos.y + 1.3, tgt.state.pos.z);
    const cam = look.clone(); cam.x += nrm.x * 8 - dir.z * 5; cam.z += nrm.z * 8 + dir.x * 5; cam.y += 2.0;
    D.rig.setExternalPose(cam, look, 45);
    D.fx.setFrozen(true, 700);
    D.fx.impact('pen', hit, nrm, 120);
    if (D.fx.armorScar) D.fx.armorScar(tgt.visual, hit, nrm, 120);
    tgt.visual.hitFlinch(nrm.x, nrm.z, 1.2, tgt.state.yaw);
    D.game.phase = 'shot';
    return { staged: true, spec: tgt.specId };
  });
  console.log('[r7] impact stage:', JSON.stringify(impactOk));
  t = 0;
  for (const age of [0.017, 0.034, 0.05, 0.084, 0.15, 0.3, 0.6]) {
    await page.evaluate((o) => {
      const D = window.__DEBUG;
      D.game.phase = 'battle';
      if (o.dt > 0) D.fastForward(o.dt);
      D.game.phase = 'shot';
      D.fx.setFrozen(true, 700 + o.age);
      window.__TGT.visual.syncFromState(window.__TGT.state);
      window.__TGT.visual.setVisible(true);
    }, { dt: age - t, age });
    t = age;
    await shot(`impact_${String(Math.round(age * 1000)).padStart(3, '0')}ms`);
  }

  // ---- D. de-track, FRAMED on open ground (r7 staging fix) ---------------
  await page.evaluate((frame) => {
    const D = window.__DEBUG;
    D.game.phase = 'battle';
    D.fx.setFrozen(false);
    D.rig.release();
    const tgt = window.__TGT; // reuse the relocated open-ground victim
    tgt.state.speed = 0;
    if (tgt.input) { tgt.input.throttle = 0; tgt.input.steer = 0; }
    D.fx.setFrozen(true, 800);
    tgt.visual.setTrackState('trackL', true);
    D.bus.emit('module:state', { id: tgt.id, module: 'trackL', state: 'red' });
    tgt.visual.syncFromState(tgt.state);
    tgt.visual.setVisible(true);
    D.game.phase = 'shot';
    // left-rear quarter, LOW and close — the shed ribbon side on camera
    eval(frame)(tgt.state.yaw + Math.PI - 0.85, 10, 1.6, 1.0);
  }, FRAME_TGT);
  t = 0;
  for (const age of [0.06, 0.3, 1.0]) {
    await page.evaluate((o) => {
      const D = window.__DEBUG;
      D.game.phase = 'battle';
      if (o.dt > 0) D.fastForward(o.dt);
      D.game.phase = 'shot';
      D.fx.setFrozen(true, 800 + o.age);
      window.__TGT.visual.setVisible(true);
      eval(o.frame)(window.__TGT.state.yaw + Math.PI - 0.85, 10, 1.6, 1.0);
    }, { dt: age - t, age, frame: FRAME_TGT });
    t = age;
    await shot(`detrack_${String(age).replace('.', '_')}s`);
  }

  // ---- E. meadow drive dust (live, real keyboard) -------------------------
  await page.evaluate(() => {
    const D = window.__DEBUG;
    D.game.phase = 'battle';
    D.fx.setFrozen(false);
    D.rig.release();
    D.game.player.state.yaw += 0.9; // off the road onto meadow
    const c = document.querySelector('canvas'); if (c) c.focus();
  });
  await page.keyboard.down('KeyW');
  await sleep(2600); await shot('drive_meadow_a');
  await sleep(900); await shot('drive_meadow_b');
  // side-on while moving
  await page.evaluate(() => {
    const D = window.__DEBUG;
    const st = D.game.player.state;
    const side = { x: Math.cos(st.yaw), z: -Math.sin(st.yaw) };
    const ahead = { x: Math.sin(st.yaw), z: Math.cos(st.yaw) };
    const look = D.rig.aimPoint.clone().set(st.pos.x + ahead.x * 2, st.pos.y + 1.0, st.pos.z + ahead.z * 2);
    const cam = look.clone(); cam.x += side.x * 9; cam.z += side.z * 9; cam.y += 1.2;
    D.rig.setExternalPose(cam, look, 45);
  });
  await sleep(400); await shot('drive_meadow_side');
  await page.keyboard.up('KeyW');
} catch (e) {
  console.error('[r7] FAILED:', e.message);
  process.exitCode = 1;
} finally {
  if (errs.length) { console.error(`[r7] console errors (${errs.length}):`); for (const er of errs.slice(0, 10)) console.error('  ' + er); }
  await browser.close();
  await server.close();
}
