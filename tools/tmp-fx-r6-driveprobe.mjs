// TEMP r6: focused meadow dust-wake probe — drive open grass, side/chase frames.
import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const outDir = resolve('shots/critic_fx_r6');
mkdirSync(outDir, { recursive: true });
const server = await createServer({ root: process.cwd(), logLevel: 'error',
  server: { port: 5700 + Math.floor(Math.random() * 90), strictPort: false, hmr: false, watch: { ignored: ['**/*'] } } });
await server.listen();
const url = `http://localhost:${server.config.server.port}/`;
const browser = await puppeteer.launch({ headless: 'new', protocolTimeout: 300000, args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function shot(name) {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log(`[probe] ${name}.png`);
}
try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });
  await page.evaluate(() => { window.__DEBUG.startBattle('m1a2'); });
  await sleep(4300); // flyby (4s) done
  await page.evaluate(() => { const c = document.querySelector('canvas'); if (c) c.focus(); });
  // teleport onto open meadow, aim across it
  await page.evaluate(() => {
    const D = window.__DEBUG;
    const p = D.game.player;
    p.state.pos.x = -40; p.state.pos.z = -60;
    p.state.yaw = 2.2; // open grass heading
  });
  await page.keyboard.down('KeyW');
  await sleep(4200); // reach speed on grass
  await shot('meadow_wake_chase');
  await page.evaluate(() => {
    const D = window.__DEBUG;
    const st = D.game.player.state;
    const side = { x: Math.cos(st.yaw), z: -Math.sin(st.yaw) };
    const back = { x: -Math.sin(st.yaw), z: -Math.cos(st.yaw) };
    const look = D.rig.aimPoint.clone().set(st.pos.x + back.x * 4, st.pos.y + 1.2, st.pos.z + back.z * 4);
    const cam = look.clone(); cam.x += side.x * 14; cam.z += side.z * 14; cam.y += 2.2;
    D.rig.setExternalPose(cam, look, 45);
  });
  await sleep(400); await shot('meadow_wake_side');
  await sleep(600); await shot('meadow_wake_side2');
  await page.keyboard.up('KeyW');
  const v = await page.evaluate(() => window.__DEBUG.game.player.state.speed.toFixed(2));
  console.log('[probe] speed at capture:', v);
} finally { await browser.close(); await server.close(); }
if (errs.length) { console.log('ERRORS:', errs.slice(0, 5)); process.exit(1); }
