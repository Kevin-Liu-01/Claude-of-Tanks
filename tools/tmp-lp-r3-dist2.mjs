// Sun-only + full pair captures at 80/160/240 m for shadow-contrast decay.
import { createServer } from 'vite';
import puppeteer from 'puppeteer';

const port = 5700 + Math.floor(Math.random() * 200);
const server = await createServer({
  root: process.cwd(), logLevel: 'error',
  server: { port, strictPort: false, watch: null, hmr: false },
});
await server.listen();
const url = `http://localhost:${server.config.server.port}/`;
const browser = await puppeteer.launch({
  headless: 'new', protocolTimeout: 300000,
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080 });
page.on('pageerror', (e) => console.error('PAGEERROR', String(e)));
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });
await page.evaluate(() => window.__SHOTS.set('battlefield'));
await new Promise((r) => setTimeout(r, 2600));

const setAmbient = (on) => page.evaluate((v) => {
  const D = window.__DEBUG;
  D.lighting.hemi.intensity = v ? 0.51 : 0;
  D.scene.traverse((o) => {
    if (o.isDirectionalLight && !D.lighting.csm.lights.includes(o)) o.intensity = v ? 0.66 : 0;
  });
  D.scene.environmentIntensity = v ? 0.32 : 0;
}, on);

for (const d of [80, 160, 240]) {
  await page.evaluate((dist) => {
    const D = window.__DEBUG;
    const V = D.camera.position.constructor;
    const p = D.game.player.state.pos;
    D.rig.setExternalPose(
      new V(p.x - dist * 0.55, p.y + dist * 0.35 + 2, p.z - dist * 0.8),
      new V(p.x, p.y + 1.5, p.z), 40);
    D.lighting.updateFrustums();
    D.lighting.update(true);
  }, d);
  await setAmbient(true);
  await new Promise((r) => setTimeout(r, 600));
  await page.screenshot({ path: `shots/crops/r3lp_d2_${d}_full.png` });
  await setAmbient(false);
  await new Promise((r) => setTimeout(r, 400));
  await page.screenshot({ path: `shots/crops/r3lp_d2_${d}_sun.png` });
  console.log('captured', d);
}
await browser.close();
await server.close();
