// TEMP critic probe (r6 judging) — detrack ribbon close framing, 3 frames.
import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const outDir = resolve('shots/critic_fx_r6_judge');
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
  console.log(`[critic] ${name}.png`);
}
try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });
  await page.evaluate(() => { window.__DEBUG.startBattle('m1a2'); });
  await sleep(500);
  const info = await page.evaluate(() => {
    const D = window.__DEBUG;
    D.game.phase = 'battle';
    D.fastForward(5); // skip flyby
    const tgt = D.game.tanks.find((tk) => tk.team === 'enemy' && tk.combat && !tk.combat.destroyed);
    if (!tgt) return { ok: false };
    tgt.visual.setTrackState('trackL', true);
    D.bus.emit('module:state', { id: tgt.id, module: 'trackL', state: 'red' });
    D.fastForward(0.5);
    const st = tgt.state;
    // camera: left-front quarter, low, 9 m out, AFTER all sim stepping
    const az = st.yaw + 2.4;
    const look = D.rig.aimPoint.clone().set(st.pos.x, st.pos.y + 1.0, st.pos.z);
    const cam = look.clone();
    cam.x += Math.sin(az) * 9; cam.z += Math.cos(az) * 9; cam.y += 1.6;
    D.rig.setExternalPose(cam, look, 45);
    D.game.phase = 'shot';
    return { ok: true, id: tgt.id, pos: [st.pos.x.toFixed(1), st.pos.y.toFixed(1), st.pos.z.toFixed(1)] };
  });
  console.log('[critic] detrack2 stage:', JSON.stringify(info));
  await sleep(200); await shot('detrack_fix_a');
  await page.evaluate(() => { const D = window.__DEBUG; D.game.phase = 'battle'; D.fastForward(0.8); D.game.phase = 'shot'; });
  await shot('detrack_fix_b');
  // other side view
  await page.evaluate(() => {
    const D = window.__DEBUG;
    const tgt = D.game.tanks.find((tk) => tk.team === 'enemy' && tk.visual && tk.visual.setTrackState && !tk.combat.destroyed);
    const st = tgt.state;
    const az = st.yaw - 2.4;
    const look = D.rig.aimPoint.clone().set(st.pos.x, st.pos.y + 1.0, st.pos.z);
    const cam = look.clone();
    cam.x += Math.sin(az) * 9; cam.z += Math.cos(az) * 9; cam.y += 1.6;
    D.rig.setExternalPose(cam, look, 45);
  });
  await sleep(150); await shot('detrack_fix_c');
} catch (e) {
  console.error('[critic] FAILED:', e.message);
  process.exitCode = 1;
} finally {
  if (errs.length) { console.error(`[critic] console errors (${errs.length}):`); for (const er of errs.slice(0, 10)) console.error('  ' + er); }
  await browser.close();
  await server.close();
}
