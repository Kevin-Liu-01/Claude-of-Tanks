#!/usr/bin/env node
// Owner 2026-10-17 (out of ammo): the scope's readouts, the rack, the countdown and the warning chip keep 3 px from the
// HUD's panels and controls, which battleHudLayout measures on every relayout and publishes (src/ui/sightFurniture.ts).
// This records what it publishes on the fixture (tools/fixtures/battle-hud-layout.html, the scope up with the gun travel
// warning) at every size src/ui/hudAmmoOutPaint.selftest.mjs sweeps, so that receipt places the readouts among the real
// furniture without a browser. Each box is named by the first panel with its rect (for the receipt's messages only).
// No screenshot; accepts an existing dev server:
// node tools/hud-sight-furniture.browser.mjs --url=http://127.0.0.1:5189 [--out=tools/fixtures/hud-sight-furniture.json]
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const arg = (name, fallback) => process.argv.find((v) => v.startsWith(`--${name}=`))?.split('=').slice(1).join('=') || fallback;
const url = arg('url', 'http://127.0.0.1:5189');
const out = resolve(arg('out', 'tools/fixtures/hud-sight-furniture.json'));
const { chromium } = await import(arg('playwright-module', 'playwright'));
const STAGE = 'ammo-reload-sniper-warn';
// [width, height, touch] (hudAmmoOutPaint.selftest section 19)
const SIZES = [[800, 400], [800, 500], [900, 480], [700, 460], [700, 431], [700, 440], [700, 520], [1280, 431], [1280, 460],
  [1280, 470], [1024, 490], [1280, 520], [1024, 560], [1024, 600], [1024, 431], [1440, 431], [1280, 440], [1440, 450],
  [800, 560], [700, 580], [800, 580], [1440, 600], [900, 720], [1440, 900], [540, 720], [390, 844], [480, 640], [520, 900],
  [1280, 420], [1440, 425], [900, 700], [640, 720], [1024, 400],
  [390, 844, true], [844, 390, true], [667, 375, true], [568, 290, true], [320, 568, true], [360, 640, true], [932, 430, true],
  [740, 360, true], [640, 360, true]];
const NAMES = ['.cot-vehicle-controls>button', '.cot-shell', '.cot-con', '.cot-touch.on .round', '.cot-touch.on .joy',
  '.cot-touch.on .quick', '.cot-touch-aim.on .aimhint', '.cot-dp', '.cot-drive', '.cot-minimap', '.cot-top', '.cot-mode-status.show',
  '.cot-scope-vision', '.cot-aim-warning', '.flight-identity', '.cot-ear'];

const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--disable-gpu'] });
const sizes = {};
try {
  for (const [width, height, touch = false] of SIZES) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1,
      reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto(`${url}/tools/fixtures/battle-hud-layout.html?locale=en-US`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.__HUD_LAYOUT);
    // staged twice: the layout solver runs a frame after the first, and measures the settled layout after the second
    for (let pass = 0; pass < 2; pass++) {
      await page.evaluate((stage) => window.__HUD_LAYOUT.state(stage), STAGE);
      for (let i = 0; i < 4; i++) await page.evaluate(() => new Promise(requestAnimationFrame));
    }
    await page.waitForTimeout(400);
    sizes[`${width}x${height}${touch ? 't' : ''}`] = await page.evaluate(async (names) => {
      const { sightFurniture } = await import('/src/ui/sightFurniture.ts');
      const round = (v) => Math.round(v * 100) / 100;
      const named = names.flatMap((selector) => [...document.querySelectorAll(selector)].map((el) => {
        const r = el.getBoundingClientRect();
        return [selector, [r.left, r.top, r.right, r.bottom]];
      }));
      return sightFurniture.boxes.slice(0, sightFurniture.count).map((box) => {
        const rect = [box.x0, box.y0, box.x1, box.y1];
        const name = named.find(([, r]) => r.every((v, i) => Math.abs(v - rect[i]) < 0.01))?.[0] ?? 'panel';
        return [name, ...rect.map(round)];
      });
    }, NAMES);
    await context.close();
    console.log(`${width}x${height}${touch ? ' touch' : ''}: ${sizes[`${width}x${height}${touch ? 't' : ''}`].length} boxes`);
  }
} finally {
  await browser.close();
}
const note = 'battleHudLayout\'s published sight furniture (src/ui/sightFurniture.ts) on tools/fixtures/battle-hud-layout.html, '
  + `stage ${STAGE}; recorded by tools/hud-sight-furniture.browser.mjs for src/ui/hudAmmoOutPaint.selftest.mjs`;
// one line a box
const body = Object.entries(sizes).map(([key, boxes]) => ` ${JSON.stringify(key)}: [\n${boxes.map((box) => `  ${JSON.stringify(box)}`).join(',\n')}\n ]`);
await writeFile(out, `{"note": ${JSON.stringify(note)}, "sizes": {\n${body.join(',\n')}\n}}\n`);
console.log(`${Object.keys(sizes).length} sizes: ${out}`);
