// AC-130 previews (endscreen-modes-275; the owner: "when we select ac 130 game mode the tank previews should have a ac 130
// presented like the tanks"): stills of every surface that previews the player's vehicle with the AC-130 mode chosen.
//   deploy  Deploy's vehicle card (tools/fixtures/mobile-surfaces.html, the Garage UI without the scene)
//   load    the battle load's rosters with the pilot's aircraft row (tools/fixtures/battle-load-layout.html)
//   garage  the Garage pedestal in the real game (WebGL), the mode stored as the player's choice
// Run under the capture lock:
//   node tools/with-capture-lock.mjs --lock-class=render -- node tools/aircraft-previews.browser.mjs --out=<dir> [--only=deploy,load,garage]
import puppeteer from 'puppeteer';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer, preview } from 'vite';
import { launchGuardedBrowser } from './browser-launch.mjs';
import { waitForReady } from './game-readiness.mjs';

const arg = (key, fallback) => process.argv.find((v) => v.startsWith(`--${key}=`))?.slice(key.length + 3) || fallback;
const out = resolve(arg('out', '.qa-dev/aircraft-previews'));
const only = arg('only', 'deploy,load,garage').split(',');
// --dist=<dir>: the Garage from a built output (vite preview), the boot proof a chunk change needs; the fixtures need the dev server
const dist = arg('dist', '');
await mkdir(out, { recursive: true });
const server = dist
  ? await preview({ preview: { host: '127.0.0.1', port: 0, strictPort: false }, build: { outDir: resolve(dist) }, logLevel: 'error' })
  : await createServer({ server: { host: '127.0.0.1', port: 0, hmr: false }, logLevel: 'error' });
let browser;
const failures = [];
const settle = (page, ms) => page.evaluate((wait) => new Promise((r) => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(r)), wait)), ms);
try {
  if (!dist) await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await launchGuardedBrowser(puppeteer, {
    headless: true, protocolTimeout: 10 * 60 * 1000,
    args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist', '--js-flags=--max-old-space-size=3072'],
  }, { label: 'aircraft-previews' });
  const shot = async (name, run) => {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    try {
      await run(page);
      await page.screenshot({ path: resolve(out, `${name}.png`) });
      console.log(`aircraft-previews: ${name}${errors.length ? ` ERRORS ${errors.join(' | ')}` : ''}`);
      if (errors.length) failures.push(name);
    } catch (error) {
      failures.push(name);
      console.error(`aircraft-previews: ${name} FAILED ${error.message}`);
    } finally { await page.close(); }
  };
  if (only.includes('deploy')) {
    for (const mode of ['standard', 'ac130']) await shot(`deploy-${mode}`, async (page) => {
      await page.setViewport({ width: 1440, height: 900 });
      await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
      await page.goto(`${origin}/tools/fixtures/mobile-surfaces.html?locale=en-US&full`, { waitUntil: 'networkidle0', timeout: 180000 });
      await page.evaluate(() => (document.querySelector('[data-nav="deploy"]') ?? document.querySelector('.cot-battle-mode'))?.click());
      await page.waitForSelector('[data-deploy-modes] .cot-c-picker__opt[data-id="ac130"]', { timeout: 120000 });
      await page.evaluate((id) => document.querySelector(`[data-deploy-modes] .cot-c-picker__opt[data-id="${id}"]`)?.click(), mode);
      await settle(page, 1800);
    });
  }
  if (only.includes('load')) {
    await shot('battle-load-ac130', async (page) => {
      await page.setViewport({ width: 1440, height: 900 });
      await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
      await page.goto(`${origin}/tools/fixtures/battle-load-layout.html?mode=ac130&map=desert&name=Sirocco%20Wadi&allies=7&enemies=7`, { waitUntil: 'networkidle0', timeout: 180000 });
      await page.evaluate(() => {
        // the pilot's row as rosterPresentation.ts makes it (aircraftRow: the preview id, no name, no tier), its escort
        const allies = [{ id: 'ac130', name: '', tier: '', kind: 'aircraft', isPlayer: true },
          ...['leo2a4_v', 'm1a1_abrams_hc', 'type90', 'leo2a4_v', 'bmp2', 'type90'].map((id, i) => ({ id, name: id, tier: 'VIII', nation: 'Germany', callsign: `Escort ${i + 1}` }))];
        const enemies = ['t90am', 't72b3', 'c1_ariete_proto_serie1', 't90am', 't72b3', 'bmp2', 't90am'].map((id, i) => ({ id, name: id, tier: 'VIII', nation: 'Russia', callsign: `Hostile ${i + 1}` }));
        window.__LOAD_LAYOUT.screen.rosters(allies, enemies, null, null);
      });
      await settle(page, 2500);
    });
  }
  if (only.includes('garage')) {
    await shot('garage-ac130', async (page) => {
      await page.setViewport({ width: 1440, height: 900 });
      await page.evaluateOnNewDocument(() => {
        // (the launcher skips the first-game tutorial on every page, browser-launch.mjs)
        try { localStorage.setItem('cot.game.mode.v1', 'ac130'); } catch { /* a page without storage keeps the default */ }
      });
      await page.goto(`${origin}/?locale=en-US`, { waitUntil: 'domcontentloaded', timeout: 300000 });
      await waitForReady(page, 'garage', { timeout: 300000 });
      await settle(page, 6000);
    });
  }
} finally {
  await browser?.close();
  if (dist) await new Promise((done) => server.httpServer.close(done)); else await server.close();
}
console.log(`aircraft-previews: ${only.join(', ')} -> ${out}${failures.length ? `; failed: ${failures.join(', ')}` : ''}`);
if (failures.length) process.exitCode = 1;
