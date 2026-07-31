#!/usr/bin/env node
// settings-sound-shot.mjs — one-off visual check for the SOUND overhaul's
// settings additions (Crew voices & alarms slider + heartbeat toggle).
// Boots headless on a 7xxx port, opens the garage gear → SOUND tab, captures
// shots/audio-probe/settings-sound-tab.png.
import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const outDir = resolve('shots/audio-probe');
mkdirSync(outDir, { recursive: true });
const server = await createServer({
  root: process.cwd(),
  logLevel: 'error',
  server: { port: 7600 + Math.floor(Math.random() * 200), strictPort: false, hmr: false, watch: { ignored: ['**/*'] } },
  optimizeDeps: { entries: ['index.html'], include: ['three'] },
});
await server.listen();
const url = `http://localhost:${server.config.server.port}/`;
const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1 });
let code = 0;
try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 90000 });
  await new Promise((r) => setTimeout(r, 1500));
  await page.evaluate(() => document.querySelector('.cot-gear').dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await new Promise((r) => setTimeout(r, 400));
  await page.evaluate(() => {
    for (const t of document.querySelectorAll('.cot-set-tab')) {
      if (t.dataset.tab === 'sound') t.click();
    }
  });
  await new Promise((r) => setTimeout(r, 400));
  const ok = await page.evaluate(() => {
    const labels = [...document.querySelectorAll('.cot-set-row .lb')].map((x) => x.textContent);
    return {
      voiceSlider: labels.some((l) => /Crew voices & alarms/.test(l)),
      heartbeat: labels.some((l) => /heartbeat/i.test(l)),
      labels,
    };
  });
  await page.screenshot({ path: `${outDir}/settings-sound-tab.png` });
  console.log('[settings-shot] voice slider present:', ok.voiceSlider, '| heartbeat toggle present:', ok.heartbeat);
  console.log('[settings-shot] rows:', ok.labels.join(' | '));
  if (!ok.voiceSlider || !ok.heartbeat) code = 1;
} catch (err) {
  console.error('[settings-shot] FAIL', err.message);
  code = 1;
} finally {
  await browser.close();
  await server.close();
}
process.exit(code);
