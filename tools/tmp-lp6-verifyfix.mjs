// TEMP lighting_post r6: verify the depth-packing rescue restores prop shadows.
import puppeteer from 'puppeteer';
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';

const vite = await createServer({
  server: { port: 5713, hmr: false, watch: { ignored: ['**/*'] } },
  logLevel: 'silent',
});
await vite.listen();
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-angle=metal'] });
const page = await browser.newPage();
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
await page.goto('http://localhost:5713/', { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });
await new Promise((r) => setTimeout(r, 800));
await page.evaluate("window.__SHOTS.set('player_view')");
await new Promise((r) => setTimeout(r, 1400));
writeFileSync('shots/_lp6_fix_pv.png', await page.screenshot({ type: 'png' }));
await page.evaluate("window.__SHOTS.set('combat_firing')");
await new Promise((r) => setTimeout(r, 1400));
writeFileSync('shots/_lp6_fix_cf.png', await page.screenshot({ type: 'png' }));
console.log('errors:', JSON.stringify(errs.slice(0, 5)));
await browser.close();
await vite.close();
