// TEMP r5 LP probe 2: fog paint localization (red fog test) + muzzle offset.
import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { writeFileSync } from 'node:fs';

const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { port: 5992, strictPort: false } });
await server.listen();
const url = `http://localhost:${server.config.server.port}/`;
const browser = await puppeteer.launch({ headless: 'new', args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message.slice(0, 200)));
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });
const settle = (ms) => new Promise((r) => setTimeout(r, ms));

const info = await page.evaluate(async () => {
  await window.__SHOTS.set('battlefield');
  const D = window.__DEBUG;
  return {
    density: D.scene.fog ? D.scene.fog.density : null,
    color: D.scene.fog ? D.scene.fog.color.toArray().map((v) => +v.toFixed(3)) : null,
    camFov: D.camera.fov,
  };
});
console.log('fog', JSON.stringify(info));

await settle(1500);
const shot1 = await page.screenshot({ type: 'png', encoding: 'base64' });
writeFileSync('shots/crops_r5lp/probe2_base.png', Buffer.from(shot1, 'base64'));

// red fog: where does the fog term actually paint?
await page.evaluate(() => { window.__DEBUG.scene.fog.color.setRGB(1, 0, 0); });
await settle(1200);
const shot2 = await page.screenshot({ type: 'png', encoding: 'base64' });
writeFileSync('shots/crops_r5lp/probe2_redfog.png', Buffer.from(shot2, 'base64'));

// halve density (keep red) to see scaling
await page.evaluate(() => { window.__DEBUG.scene.fog.density *= 0.25; });
await settle(1200);
const shot3 = await page.screenshot({ type: 'png', encoding: 'base64' });
writeFileSync('shots/crops_r5lp/probe2_redfog_quarter.png', Buffer.from(shot3, 'base64'));

console.log('done');
await browser.close();
await server.close();
