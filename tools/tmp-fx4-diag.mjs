// TEMP fx r4 diagnostic — replicate critic destroy2 flow with instrumentation.
import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const outDir = resolve('shots/fx_r4');
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
async function shot(name) {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log(`[diag] ${name}.png`);
}
try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 90000 });

  const kd = await page.evaluate(() => {
    const D = window.__DEBUG;
    D.startBattle('m1a2');
    D.rig.update(10, { mouseDX: 3, mouseDY: 0, wheel: 0, rmb: false, shiftPressed: false });
    D.aimAtNearest();
    D.fastForward(9);
    D.aimAtNearest();
    D.fastForward(2);
    // instrument the bus
    window.__EVTS = [];
    D.bus.on('tank:destroyed', (e) => window.__EVTS.push(['tank:destroyed', e.id, e.cause]));
    D.bus.on('shell:hit', (e) => window.__EVTS.push(['shell:hit', e.kind]));
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
    D.flags.forceFire = true;
    let steps = 0;
    for (; steps < 200 && !live(); steps++) D.fastForward(1 / 60);
    D.flags.forceFire = false;
    let fs = 0;
    for (; fs < 30 && !tgt.combat.destroyed; fs++) D.fastForward(1 / 60);
    const v = D.rig.aimPoint.clone().set(tgt.state.pos.x, tgt.state.pos.y + 2.4, tgt.state.pos.z);
    const az = tgt.state.yaw + 2.3;
    const cam = v.clone(); cam.x += Math.sin(az) * 19; cam.z += Math.cos(az) * 19; cam.y += 4.0;
    D.rig.setExternalPose(cam, v, 45);
    D.game.phase = 'shot';
    D.fx.setFrozen(true, 900 + (steps + fs) / 60);
    // pool live counts
    const pools = {};
    for (const k of Object.keys(D.fx.group.children[0] ? {} : {})) {} // noop
    const P = D.fx && D.fx.group; // fx group
    return {
      steps, fs, destroyed: tgt.combat.destroyed, spec: tgt.specId,
      evts: window.__EVTS,
      clockNow: 900 + (steps + fs) / 60,
    };
  });
  console.log('[diag] destroy stage:', JSON.stringify(kd));
  const counts = await page.evaluate(() => {
    const D = window.__DEBUG;
    // reach the particle pools through the fx closure? Not exposed; count via scene meshes.
    const out = {};
    D.fx.group.traverse((o) => {
      if (o.geometry && o.geometry.isInstancedBufferGeometry) {
        out[o.name || (o.geometry._capacity ? 'cap' + o.geometry._capacity : 'geo')] =
          (out[o.name] || 0) + o.geometry.instanceCount;
      }
    });
    return out;
  });
  console.log('[diag] instance counts:', JSON.stringify(counts));
  const base = (kd.steps + kd.fs) / 60;
  let tt = base;
  for (const age of [0.08, 0.45, 1.4, 4.0]) {
    const a = base + age;
    await page.evaluate((o) => {
      const D = window.__DEBUG;
      D.game.phase = 'battle';
      if (o.dt > 0) D.fastForward(o.dt);
      D.game.phase = 'shot';
      D.fx.setFrozen(true, 900 + o.a);
    }, { dt: a - tt, a });
    tt = a;
    await shot(`diag_destroy_${String(age).replace('.', '_')}s`);
  }
} catch (e) {
  console.error('[diag] FAILED:', e.message);
  process.exitCode = 1;
} finally {
  if (errs.length) { console.error(`[diag] console errors (${errs.length}):`); for (const er of errs.slice(0, 15)) console.error('  ' + er); }
  await browser.close();
  await server.close();
}
