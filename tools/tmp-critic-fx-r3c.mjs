// TEMP critic probe r3c — gun recoil timeline via recoilKick + manual syncs.
// tankFactory contract: each syncFromState call advances self-timed recoil 1/60 s.
import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const outDir = resolve('shots/critic_fx_r3');
mkdirSync(outDir, { recursive: true });
const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { port: 5800 + Math.floor(Math.random() * 90), strictPort: false } });
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
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 90000 });
  // stage exactly like the combat_firing recipe but WITHOUT fx, camera dead
  // side-on at the gun: recoil travel reads as pure screen-x motion.
  await page.evaluate(() => {
    window.__SHOTS.set('combat_firing');
    const D = window.__DEBUG;
    D.fx.resetAll(); // no flash occluding the barrel
    const p = D.game.player;
    const muz = D.rig.aimPoint.clone(); p.visual.gunMuzzleWorld(muz);
    const piv = D.rig.aimPoint.clone(); p.visual.gunPivotWorld(piv);
    const dir = muz.clone().sub(piv).normalize();
    const side = dir.clone().cross(muz.clone().set(0, 1, 0)).normalize();
    const look = piv.clone().addScaledVector(dir, 2.2);
    const cam = look.clone().addScaledVector(side, 9);
    D.rig.setExternalPose(cam, look, 40);
    window.__REC = { p };
  });
  // fresh kick, then walk the timeline: capture at k syncs (k/60 s)
  const trace = await page.evaluate(() => {
    const D = window.__DEBUG;
    const p = window.__REC.p;
    p.visual.recoilKick();
    const out = [];
    const px = () => {
      const v = D.rig.aimPoint.clone();
      p.visual.gunMuzzleWorld(v);
      v.project(D.camera);
      return Math.round((v.x * 0.5 + 0.5) * 1600 * 10) / 10;
    };
    out.push({ k: 0, mx: px() });
    for (let k = 1; k <= 40; k++) {
      p.visual.syncFromState(p.state);
      out.push({ k, mx: px() });
    }
    return out;
  });
  console.log('[critic] recoil muzzle-x trace (px per 1/60s):', JSON.stringify(trace));
  // frames at rest / full recoil / hold / return for visual check
  for (const k of [0, 4, 10, 24]) {
    await page.evaluate((kk) => {
      const D = window.__DEBUG;
      const p = window.__REC.p;
      p.visual.resetDestroyed && p.visual.resetDestroyed();
      // re-kick and advance kk syncs from rest
      p.visual.recoilKick();
      // recoilKick starts a fresh timeline; advance
      for (let i = 0; i < kk; i++) p.visual.syncFromState(p.state);
      D.lighting.update(true);
    }, k);
    await shot(`recoil_k${String(k).padStart(2, '0')}`);
  }
} catch (e) {
  console.error('[critic] FAILED:', e.message);
  process.exitCode = 1;
} finally {
  if (errs.length) { console.error(`[critic] console errors (${errs.length}):`); for (const er of errs.slice(0, 15)) console.error('  ' + er); }
  await browser.close();
  await server.close();
}
