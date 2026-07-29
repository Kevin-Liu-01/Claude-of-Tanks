// Where does the vehicle shadow die with camera distance?
// Places external poses at 15/40/80/160/240 m from the player tank.
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

for (const d of [15, 40, 80, 160, 240]) {
  await page.evaluate((dist) => {
    const D = window.__DEBUG;
    const THREEV = D.camera.position.constructor;
    const p = D.game.player.state.pos;
    // camera SOUTH-WEST of the tank at elevation, looking at the hull —
    // sun az 115 deg means shadows rake toward WNW; from this angle the
    // shadow side faces camera-left, clearly visible.
    const pos = new THREEV(p.x - dist * 0.55, p.y + dist * 0.35 + 2, p.z - dist * 0.8);
    const look = new THREEV(p.x, p.y + 1.5, p.z);
    D.rig.setExternalPose(pos, look, 40);
    D.lighting.updateFrustums();
    D.lighting.update(true);
  }, d);
  await new Promise((r) => setTimeout(r, 700));
  await page.screenshot({ path: `shots/crops/r3lp_dist_${d}.png` });
  console.log('captured', d);
}
await browser.close();
await server.close();
