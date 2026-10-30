#!/usr/bin/env node
// battle-camera-264: records the HUD bands battleHudLayout.ts publishes for the chase framing (src/ui/battleSight.ts:
// the bottom chrome that never moves with the sight, the first battles' controls strip as transient, the head band over
// the centre column, the layout's rise cap) on the DOM-only layout fixture (tools/fixtures/battle-hud-layout.html, no
// WebGL) at every supported battle size, idle and with the controls strip (mouse sizes), into
// tools/fixtures/hud-chase-bands.json, which src/engine/chaseFraming.selftest.mjs reads. Re-record after the HUD's
// bottom chrome or its head band moves.
//   node tools/hud-chase-bands.browser.mjs [--check]   (--check: compare with the recorded file, write nothing)
import { readFileSync, writeFileSync } from 'node:fs';
import puppeteer from 'puppeteer';
import { launchGuardedBrowser } from './browser-launch.mjs';
import { startViteChild, stubViteSocket } from './capture-hold.mjs';

const FIXTURE = new URL('./fixtures/hud-chase-bands.json', import.meta.url);
const SIZES = [[1920, 1080, false], [1440, 900, false], [1280, 720, false], [1180, 820, true], [820, 1180, true], [390, 844, true], [844, 390, true]];
const check = process.argv.includes('--check');
const wait = (ms) => new Promise((done) => setTimeout(done, ms));
let server = null, browser = null;
const sizes = {};
try {
  server = await startViteChild({ root: process.cwd(), mode: 'dev', timeoutMs: 300_000 });
  browser = await launchGuardedBrowser(puppeteer, { headless: 'new', protocolTimeout: 120_000, args: ['--no-sandbox'] });
  for (const [w, h, touch] of SIZES) {
    for (const state of touch ? ['idle'] : ['idle', 'hints']) {
      const page = await browser.newPage();
      await page.setViewport({ width: w, height: h, deviceScaleFactor: 1, isMobile: touch, hasTouch: touch });
      await stubViteSocket(page);
      // (a cold dev server's first navigation outlasts its load event: the bands are polled)
      await page.goto(`${server.url}/tools/fixtures/battle-hud-layout.html?state=${state}${touch ? '&coarse=1' : ''}`,
        { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => {});
      let bands = null;
      for (let i = 0; i < 240 && !bands; i++) {
        await wait(1000);
        bands = await page.evaluate(async (strip) => {
          const { battleBands } = await import('/src/ui/battleSight.ts');
          const b = battleBands();
          // (the strip's state once its plate shows)
          return b && (!strip || b.transient?.length) ? b : null;
        }, state === 'hints').catch(() => null);
      }
      if (!bands) throw new Error(`${w}x${h} ${state}: no bands published`);
      (sizes[`${w}x${h}`] ??= {})[state] = bands;
      console.log(`${w}x${h} ${state}: ${bands.floor.length} floor boxes, ${bands.transient?.length ?? 0} transient, ceiling ${bands.ceiling}, rise cap ${bands.riseCap ?? 'none'}`);
      await page.close();
    }
  }
} finally {
  await Promise.race([browser?.close().catch(() => {}), wait(15_000)]);
  try { browser?.process()?.kill('SIGKILL'); } catch { /* closed */ }
  await Promise.race([server?.close().catch(() => {}), wait(15_000)]);
}
const recorded = JSON.parse(readFileSync(FIXTURE, 'utf8'));
// one band per line: a re-recording reads as a diff of the boxes that moved
const lines = ['{', `  "note": ${JSON.stringify(recorded.note)},`, '  "sizes": {'];
const keys = Object.keys(sizes);
keys.forEach((size, i) => {
  lines.push(`    ${JSON.stringify(size)}: {`);
  const states = Object.keys(sizes[size]);
  states.forEach((state, j) => lines.push(`      ${JSON.stringify(state)}: ${JSON.stringify(sizes[size][state])}${j < states.length - 1 ? ',' : ''}`));
  lines.push(`    }${i < keys.length - 1 ? ',' : ''}`);
});
lines.push('  }', '}');
const text = `${lines.join('\n')}\n`;
if (check) {
  const same = JSON.stringify(recorded.sizes) === JSON.stringify(sizes);
  console.log(same ? 'hud-chase-bands: the recorded bands hold' : 'hud-chase-bands: the bands moved; re-record without --check');
  process.exit(same ? 0 : 1);
}
writeFileSync(FIXTURE, text);
console.log(`hud-chase-bands: recorded ${keys.length} sizes`);
process.exit(0);
