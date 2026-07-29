// TEMP fx r5 — deterministic meadow dust-wake probe: teleport the player to
// the open meadow near the m1a2_tusk spawn, drive live 4 s, capture frames.
import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const outDir = resolve('shots/fx_r5_verify');
mkdirSync(outDir, { recursive: true });
const server = await createServer({
  root: process.cwd(), logLevel: 'error',
  server: { port: 5700 + Math.floor(Math.random() * 90), strictPort: false, hmr: false, watch: { ignored: ['**/*'] } },
});
await server.listen();
const url = `http://localhost:${server.config.server.port}/`;
const browser = await puppeteer.launch({ headless: 'new', protocolTimeout: 300000, args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
const errs = [];
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon')) errs.push(m.text()); });
page.on('pageerror', (e) => errs.push(String(e)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function shot(name) {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log(`[drive] ${name}.png`);
}
try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });
  await page.evaluate(() => { window.__DEBUG.startBattle('m1a2'); });
  await sleep(6000);
  await page.evaluate(() => {
    const D = window.__DEBUG;
    D.game.phase = 'battle';
    D.fx.setFrozen(false);
    D.rig.release();
    const p = D.game.player;
    const tusk = D.game.tanks.find((tk) => tk.specId === 'm1a2_tusk');
    // park the player in the open meadow beside the tusk spawn, facing along
    // the meadow (the pre_kill framing showed open grass on both sides)
    p.state.pos.set(tusk.state.pos.x + 8, tusk.state.pos.y, tusk.state.pos.z - 14);
    p.state.yaw = tusk.state.yaw + Math.PI / 2;
    p.state.speed = 0;
    const c = document.querySelector('canvas'); if (c) c.focus();
  });
  await page.keyboard.down('KeyW');
  await sleep(2200); await shot('meadow_22');
  await sleep(1500); await shot('meadow_37');
  await page.keyboard.up('KeyW');
} catch (e) {
  console.error('[drive] FAILED:', e.message);
  process.exitCode = 1;
} finally {
  if (errs.length) { console.error(`[drive] console errors (${errs.length}):`); for (const er of errs.slice(0, 10)) console.error('  ' + er); process.exitCode = 1; }
  await browser.close();
  await server.close();
}
