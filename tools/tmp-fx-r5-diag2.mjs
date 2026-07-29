// TEMP fx r5 diag 2 — EXACT replica of critic stage E (real shell kill) with
// turret-mesh world-position dumps at each capture step.
import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const outDir = resolve('shots/fx_r5_diag');
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
async function shot(name) {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log(`[diag2] ${name}.png`);
}

try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });
  await page.evaluate(() => { window.__DEBUG.startBattle('m1a2'); });
  await new Promise((r) => setTimeout(r, 6000));

  // stage D-equivalent: teleport first enemy 62m in front, then kill stage E
  const killed = await page.evaluate(() => {
    const D = window.__DEBUG;
    window.__KILL = null;
    D.bus.on('tank:destroyed', (e) => { window.__KILL = e; });
    D.game.phase = 'battle';
    D.fx.setFrozen(false);
    D.rig.release();
    const p = D.game.player;
    const tgt = D.game.tanks.find((tk) => tk.team === 'enemy' && tk.combat && !tk.combat.destroyed);
    const muz = D.rig.aimPoint.clone(); p.visual.gunMuzzleWorld(muz);
    const piv = D.rig.aimPoint.clone(); p.visual.gunPivotWorld(piv);
    const dir = muz.clone().sub(piv).normalize(); dir.y = 0; dir.normalize();
    tgt.state.pos.set(p.state.pos.x + dir.x * 62, p.state.pos.y + 1.5, p.state.pos.z + dir.z * 62);
    tgt.state.yaw = p.state.yaw + Math.PI / 2;
    tgt.combat.hp = 1;
    p.input.aimPoint.set(tgt.state.pos.x, tgt.state.pos.y + 1.2, tgt.state.pos.z);
    D.fastForward(6.5);
    const v = D.rig.aimPoint.clone().set(tgt.state.pos.x, tgt.state.pos.y + 2.6, tgt.state.pos.z);
    const az = tgt.state.yaw + 2.4;
    const cam = v.clone(); cam.x += Math.sin(az) * 20; cam.z += Math.cos(az) * 20; cam.y += 4.5;
    D.rig.setExternalPose(cam, v, 45);
    D.fx.setFrozen(true, 900);
    const n0 = D.game.shells.filter((s) => s.isPlayer).length;
    D.flags.forceFire = true;
    for (let i = 0; i < 400 && D.game.shells.filter((s) => s.isPlayer).length <= n0; i++) D.fastForward(1 / 60);
    D.flags.forceFire = false;
    for (let i = 0; i < 120 && !tgt.combat.destroyed; i++) D.fastForward(1 / 60);
    D.game.phase = 'shot';
    return { destroyed: tgt.combat.destroyed, id: tgt.id, spec: tgt.specId, kill: window.__KILL };
  });
  console.log('[diag2] kill:', JSON.stringify(killed));
  if (!killed.destroyed) throw new Error('kill failed again');

  let t = 0;
  for (const age of [0.1, 0.55, 0.9, 2.5]) {
    const dump = await page.evaluate((o) => {
      const D = window.__DEBUG;
      D.game.phase = 'battle';
      if (o.dt > 0) D.fastForward(o.dt);
      D.game.phase = 'shot';
      D.fx.setFrozen(true, 900 + o.age);
      const tgt = D.game.tanks.find((tk) => tk.id === o.id);
      const root = tgt.visual.root;
      const V3 = tgt.state.pos.constructor;
      let tg = null;
      root.traverse((n) => { if (!tg && n.children && n.children.some((c) => /TurretPivot/i.test(c.name || ''))) tg = n; });
      const out = [`rootY=${root.position.y.toFixed(2)} turretG=${tg ? `${tg.position.x.toFixed(2)},${tg.position.y.toFixed(2)},${tg.position.z.toFixed(2)} rz=${tg.rotation.z.toFixed(2)}` : 'none'}`];
      let shown = 0;
      if (tg) tg.traverse((n) => {
        if (n.isMesh && n.visible && shown < 5) {
          const wp = n.getWorldPosition(new V3());
          out.push(`  "${n.name}" wy=${wp.y.toFixed(2)} matType=${n.material.type} visParents=${(() => { let p = n, ok = true; while (p) { if (!p.visible) ok = false; p = p.parent; } return ok; })()}`);
          shown++;
        }
      });
      return out;
    }, { dt: age - t, age, id: killed.id });
    t = age;
    console.log(`[diag2] @${age}s:`); for (const l of dump) console.log('   ' + l);
    await shot(`rkill_${String(age).replace('.', '_')}s`);
  }
} catch (e) {
  console.error('[diag2] FAILED:', e.message);
  process.exitCode = 1;
} finally {
  if (errs.length) { console.error(`[diag2] console errors (${errs.length}):`); for (const er of errs.slice(0, 15)) console.error('  ' + er); }
  await browser.close();
  await server.close();
}
