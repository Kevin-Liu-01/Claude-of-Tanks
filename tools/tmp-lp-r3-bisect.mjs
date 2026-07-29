// Bisect why the tank shadow is invisible at 80 m: ambient dilution vs CSM
// fade vs PCF blur. Fixed pose, four captures.
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

const pose = () => page.evaluate(() => {
  const D = window.__DEBUG;
  const V = D.camera.position.constructor;
  const p = D.game.player.state.pos;
  const d = 80;
  D.rig.setExternalPose(
    new V(p.x - d * 0.55, p.y + d * 0.35 + 2, p.z - d * 0.8),
    new V(p.x, p.y + 1.5, p.z), 40);
  D.lighting.updateFrustums();
  D.lighting.update(true);
});

await pose();
await new Promise((r) => setTimeout(r, 600));
await page.screenshot({ path: 'shots/crops/r3lp_bx_base.png' });

// B: kill ambient (hemi + anti-sun fill + IBL) — sun/shadow only
await page.evaluate(() => {
  const D = window.__DEBUG;
  D.lighting.hemi.intensity = 0;
  D.scene.traverse((o) => {
    if (o.isDirectionalLight && !D.lighting.csm.lights.includes(o)) o.intensity = 0;
  });
  D.scene.environmentIntensity = 0;
});
await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: 'shots/crops/r3lp_bx_noambient.png' });

// C: restore ambient; disable csm fade
await page.evaluate(() => {
  const D = window.__DEBUG;
  D.lighting.hemi.intensity = 0.51;
  D.scene.traverse((o) => {
    if (o.isDirectionalLight && !D.lighting.csm.lights.includes(o)) o.intensity = 0.66;
  });
  D.scene.environmentIntensity = 0.32;
  D.lighting.csm.fade = false;
  D.lighting.csm.updateFrustums();
  D.lighting.update(true);
});
await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: 'shots/crops/r3lp_bx_nofade.png' });

// D: fade back on; crisp PCF radius
await page.evaluate(() => {
  const D = window.__DEBUG;
  D.lighting.csm.fade = true;
  D.lighting.csm.updateFrustums();
  for (const l of D.lighting.csm.lights) { l.shadow.radius = 0.6; l.shadow.needsUpdate = true; }
  D.lighting.update(true);
});
await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: 'shots/crops/r3lp_bx_crisp.png' });

await browser.close();
await server.close();
