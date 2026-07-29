import { createServer } from 'vite';
import puppeteer from 'puppeteer';

const port = 5700 + Math.floor(Math.random() * 200);
const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { port, strictPort: false } });
await server.listen();
const url = `http://localhost:${server.config.server.port}/`;
const browser = await puppeteer.launch({ headless: 'new', args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080 });
page.on('pageerror', (e) => console.error('PAGEERROR', String(e)));
page.on('console', (m) => { if (m.type() === 'error') console.error('CONSOLE', m.text()); });

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });

const r1 = await page.evaluate(() => {
  let threw = null;
  try { window.__SHOTS.set('battlefield'); } catch (e) { threw = String(e && e.stack || e); }
  return { threw };
});
console.log('set result:', JSON.stringify(r1));
await new Promise((r) => setTimeout(r, 2600));
const st = await page.evaluate(() => {
  const D = window.__DEBUG;
  const g = document.querySelector('.cot-garage');
  return {
    phase: D.game.phase,
    camPos: D.camera.position.toArray().map((v) => +v.toFixed(1)),
    garageDisplay: g ? getComputedStyle(g).display : 'none?',
  };
});
console.log('state:', JSON.stringify(st));
await page.screenshot({ path: 'shots/crops/r3lp_state.png' });
await browser.close();
await server.close();
