// End screen by mode (endscreen-modes-275): a still of the report for every game mode, the couch battle and a room's
// round, each from tools/fixtures/end-screen-modes.html (one scripted battle through the real bookkeeper and report).
// Run under the capture lock:
//   node tools/with-capture-lock.mjs --lock-class=render -- node tools/end-screen-modes.browser.mjs --out=<dir> [--modes=a,b] [--width=1440 --height=1000] [--locale=zh-CN]
import puppeteer from 'puppeteer';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { launchGuardedBrowser } from './browser-launch.mjs';
import { GAME_MODE_IDS } from '../src/sim/gameModeCatalog.ts';

const arg = (key, fallback) => process.argv.find((v) => v.startsWith(`--${key}=`))?.slice(key.length + 3) || fallback;
const out = resolve(arg('out', '.qa-dev/end-screen-modes'));
const width = Number(arg('width', 1440)), height = Number(arg('height', 1000));
const locale = arg('locale', 'en-US');
const picks = arg('modes', '') ? arg('modes', '').split(',') : [...GAME_MODE_IDS, 'standard:couch', 'standard:room', 'standard:defeat'];
await mkdir(out, { recursive: true });
const server = await createServer({ server: { host: '127.0.0.1', port: 0, hmr: false }, logLevel: 'error' });
let browser;
const failures = [];
try {
  await server.listen();
  const port = server.httpServer.address().port;
  browser = await launchGuardedBrowser(puppeteer, { headless: true, args: ['--disable-gpu'] }, { label: 'end-screen-modes' });
  for (const pick of picks) {
    const [mode, variant = ''] = pick.split(':');
    const page = await browser.newPage();
    await page.setViewport({ width, height });
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const params = new URLSearchParams({ mode, locale });
    if (variant === 'defeat') params.set('result', 'defeat'); else if (variant) params.set('variant', variant);
    await page.goto(`http://127.0.0.1:${port}/tools/fixtures/end-screen-modes.html?${params}`, { waitUntil: 'networkidle0', timeout: 90000 });
    await page.waitForSelector('.cot-es.show', { timeout: 20000 }).catch(() => errors.push('no report'));
    await page.evaluate(() => document.fonts.ready);
    await new Promise((r) => setTimeout(r, 1800)); // count-ups, hero cards and flags land
    const name = `${mode}${variant ? `-${variant}` : ''}${locale === 'en-US' ? '' : `-${locale}`}`;
    await page.screenshot({ path: resolve(out, `${name}.png`) });
    if (errors.length) failures.push(`${name}: ${errors.join(' | ')}`);
    console.log(`end-screen-modes: ${name}${errors.length ? ` ERRORS ${errors.join(' | ')}` : ''}`);
    await page.close();
  }
} finally {
  await browser?.close();
  await server.close();
}
console.log(`end-screen-modes: ${picks.length} stills in ${out}${failures.length ? `; ${failures.length} with page errors` : ''}`);
if (failures.length) process.exitCode = 1;
