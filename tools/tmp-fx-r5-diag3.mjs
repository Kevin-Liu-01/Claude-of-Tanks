// TEMP fx r5 diag 3 — clean framed live-path kill: victim at original spot,
// forced visible, pre-kill frame + wreck frames.
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
  console.log(`[diag3] ${name}.png`);
}

try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });
  await page.evaluate(() => { window.__DEBUG.startBattle('m1a2'); });
  await new Promise((r) => setTimeout(r, 6000));

  await page.evaluate(() => {
    const D = window.__DEBUG;
    D.game.phase = 'battle';
    D.fx.setFrozen(false);
    D.rig.release();
    const tgt = D.game.tanks.find((tk) => tk.team === 'enemy' && tk.specId === 'm1a2_tusk');
    window.__TGT = tgt;
    tgt.visual.setVisible(true);
    const v = D.rig.aimPoint.clone().set(tgt.state.pos.x, tgt.state.pos.y + 2.2, tgt.state.pos.z);
    const az = tgt.state.yaw + 2.4;
    const cam = v.clone(); cam.x += Math.sin(az) * 16; cam.z += Math.cos(az) * 16; cam.y += 4.0;
    D.rig.setExternalPose(cam, v, 45);
    D.fx.setFrozen(true, 900);
    D.game.phase = 'shot';
  });
  await shot('pre_kill');

  await page.evaluate(() => {
    const D = window.__DEBUG;
    const tgt = window.__TGT;
    tgt.combat.hp = 0;
    tgt.combat.destroyed = true;
    tgt._destroyedAnnounced = true;
    tgt.visual.setDestroyed({ pop: false });
    D.bus.emit('tank:destroyed', {
      id: tgt.id, specId: tgt.specId,
      pos: [tgt.state.pos.x, tgt.state.pos.y, tgt.state.pos.z],
      killerId: D.game.player.id, cause: 'shot',
    });
  });
  let t = 0;
  for (const age of [0.1, 0.9, 2.5]) {
    await page.evaluate((o) => {
      const D = window.__DEBUG;
      D.game.phase = 'battle';
      if (o.dt > 0) D.fastForward(o.dt);
      D.game.phase = 'shot';
      window.__TGT.visual.setVisible(true);
      D.fx.setFrozen(true, 900 + o.age);
    }, { dt: age - t, age });
    t = age;
    await shot(`ckill_${String(age).replace('.', '_')}s`);
  }
} catch (e) {
  console.error('[diag3] FAILED:', e.message);
  process.exitCode = 1;
} finally {
  if (errs.length) { console.error(`[diag3] console errors (${errs.length}):`); for (const er of errs.slice(0, 15)) console.error('  ' + er); }
  await browser.close();
  await server.close();
}
