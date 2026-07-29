// tools/tmp-pb-r5-dynres.mjs — dynamic-resolution governor verification.
// Enters battle (pinned roster), samples __DEBUG.post.dynScale + frame time
// for N seconds at the given dsf. Expectations:
//   --dsf 1: dynScale stays EXACTLY 1.0 (retina fence — gate path untouched)
//   --dsf 2 under load: dynScale steps down (<1) once the EMA blows 18.5 ms,
//           and never below 0.75; zero console errors either way.
// Usage: node tools/tmp-pb-r5-dynres.mjs [--dsf 2] [--seconds 30]
import { createServer } from 'vite';
import puppeteer from 'puppeteer';

const args = process.argv.slice(2);
const opt = (n, fb) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : fb; };
const dsf = parseFloat(opt('dsf', '2'));
const seconds = parseFloat(opt('seconds', '30'));

const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { port: 5900 + Math.floor(Math.random() * 90), strictPort: false, hmr: false } });
await server.listen();
const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage', '--disable-frame-rate-limit', '--disable-gpu-vsync'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: dsf });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon')) errors.push(m.text()); });

await page.goto(`http://localhost:${server.config.server.port}/`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction('window.__GAME_READY === true', { timeout: 90000 });
await page.evaluate(() => {
  const D = window.__DEBUG;
  D.flags.forceRoster = ['kv2', 'jagdtiger', 'tiger2', 'object279', 'is7', 't30', 't95'];
  D.startBattle('m1a2', 'verdant');
  D.flags.forceFire = true;
});
await page.keyboard.down('KeyW');
const samples = [];
for (let t = 0; t < seconds; t += 2) {
  await new Promise((r) => setTimeout(r, 2000));
  samples.push(await page.evaluate(() => ({
    dynScale: window.__DEBUG.post.dynScale,
    ratio: window.__DEBUG.renderer.getPixelRatio(),
  })));
}
await page.keyboard.up('KeyW');
const scales = samples.map((s) => s.dynScale);
console.log(JSON.stringify({
  dsf,
  rendererRatio: samples[0].ratio,
  dynScaleSeries: scales,
  min: Math.min(...scales),
  max: Math.max(...scales),
  stepped: Math.min(...scales) < 1,
  consoleErrors: errors.slice(0, 6),
}, null, 2));
await browser.close();
await server.close();
process.exit(errors.length ? 1 : 0);
