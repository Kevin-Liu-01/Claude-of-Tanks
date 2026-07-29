import puppeteer from 'puppeteer';
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';
const vite = await createServer({ server: { port: 5607 }, logLevel: 'silent' });
await vite.listen();
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-angle=metal'] });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
await page.goto('http://localhost:5607/', { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });
for (const v of ['battlefield', 'player_view', 'detrack', 'combat_firing']) {
  await page.evaluate(`window.__SHOTS.set('${v}')`);
  await new Promise((r) => setTimeout(r, 700));
}
// resume the GLB idle queue (the shot sequence pauses it) and give parses time
await page.evaluate("import('/src/vehicles/modelLoader.js').then(m => m.pauseIdleQueue && m.pauseIdleQueue(false))");
await new Promise((r) => setTimeout(r, 3500));
await page.evaluate("window.__SHOTS.set('explosion')");
await new Promise((r) => setTimeout(r, 1700));
writeFileSync(process.argv[2], await page.screenshot({ type: 'png' }));
await browser.close();
await vite.close();
