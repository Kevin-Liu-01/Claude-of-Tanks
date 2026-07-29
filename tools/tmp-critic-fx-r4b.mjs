// TEMP critic probe r4b — close-range fire sequence redo: settle the tank to a
// full stop FIRST, then force-fire and step frames; also measure recoil travel
// along the bore axis relative to the gun pivot (hull-motion-proof metric).
import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const outDir = resolve('shots/critic_fx_r4');
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
async function shot(name) {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log(`[critic] ${name}.png`);
}
try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });
  const fired = await page.evaluate(() => {
    const D = window.__DEBUG;
    D.startBattle('m1a2');
    D.game.phase = 'battle';
    D.fastForward(8); // flyby skip + everything settles, reload done, speed 0
    D.aimAtNearest();
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
    for (let i = 0; i < 600 && D.game.shells.filter((s) => s.isPlayer).length <= n0; i++) D.fastForward(1 / 60);
    D.flags.forceFire = false;
    D.game.phase = 'shot';
    // bore-axis recoil metric: muzzle distance from pivot along dir
    const m = D.rig.aimPoint.clone(); p.visual.gunMuzzleWorld(m);
    const pv = D.rig.aimPoint.clone(); p.visual.gunPivotWorld(pv);
    window.__RECB = [{ age: 0, ext: m.clone().sub(pv).dot(dir) }];
    window.__DIRB = { x: dir.x, y: dir.y, z: dir.z };
    return { fired: D.game.shells.filter((s) => s.isPlayer).length > n0, speed: p.state.speed };
  });
  console.log('[critic] r4b fire:', JSON.stringify(fired));
  let t = 0;
  for (const age of [0.017, 0.05, 0.1, 0.18, 0.3, 0.5, 0.9]) {
    await page.evaluate((o) => {
      const D = window.__DEBUG;
      D.game.phase = 'battle';
      if (o.dt > 0) D.fastForward(o.dt);
      D.game.phase = 'shot';
      D.fx.setFrozen(true, 500 + o.age);
      const p = D.game.player;
      const dir = window.__DIRB;
      const m = D.rig.aimPoint.clone(); p.visual.gunMuzzleWorld(m);
      const pv = D.rig.aimPoint.clone(); p.visual.gunPivotWorld(pv);
      window.__RECB.push({ age: o.age, ext: m.sub(pv).x * dir.x + m.y * 0 + 0 || 0, raw: [m.x, m.y, m.z, pv.x, pv.y, pv.z] });
    }, { dt: age - t, age });
    t = age;
    await shot(`fireb_${String(Math.round(age * 1000)).padStart(3, '0')}ms`);
  }
  // recompute extension properly from raw
  const rec = await page.evaluate(() => ({ rec: window.__RECB, dir: window.__DIRB }));
  const d = rec.dir;
  const vals = rec.rec.map((r) => {
    if (r.raw) {
      const ext = (r.raw[0] - r.raw[3]) * d.x + (r.raw[1] - r.raw[4]) * d.y + (r.raw[2] - r.raw[5]) * d.z;
      return `${r.age}s:${ext.toFixed(3)}`;
    }
    return `${r.age}s:${(r.ext || 0).toFixed(3)}`;
  });
  console.log('[critic] bore extension (m):', vals.join(' '));
} catch (e) {
  console.error('[critic] FAILED:', e.message);
  process.exitCode = 1;
} finally {
  if (errs.length) { console.error(`[critic] console errors (${errs.length}):`); for (const er of errs.slice(0, 15)) console.error('  ' + er); }
  await browser.close();
  await server.close();
}
