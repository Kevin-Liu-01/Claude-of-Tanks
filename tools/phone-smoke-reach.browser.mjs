#!/usr/bin/env node
// The phone smoke tile's reach (274.0, Main 2026-11-22). Copyright © 2026 Kevin B. Liu.
//
// mobile-hud-274b (114f25ecbb) stands a portrait phone's items two abreast on the speedometer and seats the smoke in the
// cell the last item leaves, inside the items rack's box. The rack (.cot-cons, position fixed over the vehicle controls)
// took every tap in its box, its empty cell included, so a finger on the smoke tile met the rack and no smoke fired: smoke
// could not be used on a portrait phone, and the training battle's smokeTouch step could not advance by tap. The rack
// now takes taps on its tiles only (battleHudLayout.css). This receipt boots a solo Standard battle in a 390x844 touch
// window and hit-tests the centre of every visible control on the left edge: the smoke, the jump and each item tile must
// be what a finger there meets. It also taps the smoke and requires a smoke charge to be spent.
//   node tools/phone-smoke-reach.browser.mjs --url=http://127.0.0.1:5189 [--spec=m1a3,leo2a6] [--out=outputs/phone-smoke-reach]
// Runs against an existing dev server or a served dist (vite preview), under the render capture lock.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { launchGuardedBrowser } from './browser-launch.mjs';
import { nativeBrowserLaunchOptions } from './native-browser-launch.mjs';
import { createCaptureLock } from './capture-lock.mjs';
import { readinessExpression } from './game-readiness.mjs';

const arg = (name, fallback) => process.argv.find((v) => v.startsWith(`--${name}=`))?.split('=').slice(1).join('=') || fallback;
const url = arg('url', 'http://127.0.0.1:5189');
const specs = arg('spec', 'm1a3,leo2a6').split(',').filter(Boolean);
const out = resolve(arg('out', 'outputs/phone-smoke-reach'));
mkdirSync(out, { recursive: true });
const { default: puppeteer } = await import('puppeteer');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FINISHED = JSON.stringify({ v: 2, garage: 'skipped', training: 'skipped', debrief: 'skipped', tour: 'skipped', offer: 'later' });
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

const lock = createCaptureLock();
let browser, refresh;
const report = { url, specs, rows: [], errors: [] };
try {
  await lock.acquire(30 * 60 * 1000, { command: 'phone-smoke-reach', lockClass: 'render' });
  refresh = setInterval(() => lock.refresh(), 30000);
  browser = await launchGuardedBrowser(puppeteer, nativeBrowserLaunchOptions({ headless: true, args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox'],
    protocolTimeout: 300000 }), { label: 'phone-smoke-reach', tutorial: 'keep' });
  for (const spec of specs) {
    const page = await browser.newPage();
    page.on('pageerror', (e) => report.errors.push(String(e.message).slice(0, 300)));
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.setUserAgent(IPHONE_UA);
    try { await page.emulateMediaFeatures([{ name: 'pointer', value: 'coarse' }, { name: 'hover', value: 'none' }]); } catch {} // (older Chromium lacks these; the touch viewport and UA still pick the phone layout)
    await page.evaluateOnNewDocument((finished) => { Document.prototype.hasFocus = () => true;
      try { localStorage.setItem('cot.telemetry', 'off'); localStorage.setItem('cot.tutorial.v1', finished); } catch {} }, FINISHED);
    await page.goto(`${url}/?nosplash=1&telemetry=off&tier=mobile`, { waitUntil: 'domcontentloaded', timeout: 240000 });
    await page.waitForFunction(`${readinessExpression('garage')} && !!window.__DEBUG`, { timeout: 420000, polling: 500 });
    await page.evaluate((id) => window.__DEBUG.selectGarageTank(id), spec);
    await page.evaluate(() => window.__DEBUG.beginSoloBattle({ gameMode: 'standard' }));
    await page.waitForFunction(readinessExpression('controlsReleased'), { timeout: 420000, polling: 1000 });
    await sleep(2500);
    const reach = await page.evaluate(() => {
      const desc = (e) => e ? `${e.tagName.toLowerCase()}${typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/).join('.') : ''}` : null;
      const nodes = [...document.querySelectorAll('[data-control="smoke"], .cot-touch.on .jump, .cot-cons > .cot-con')].filter((n) => n.checkVisibility());
      return nodes.map((n) => { const r = n.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2; const hit = document.elementFromPoint(x, y);
        return { control: n.dataset.control ?? desc(n), box: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], at: [x, y], reached: n.contains(hit), hit: desc(hit) }; });
    });
    const smoke = reach.find((r) => r.control === 'smoke');
    const before = await page.evaluate(() => window.__DEBUG.game.player?.combat?.auxiliary?.smokeCharges ?? null);
    let spent = null;
    assert.ok(typeof before === "number" && before > 0, `${spec}: the player holds smoke charges (${before})`);
    if (smoke?.reached) {
      await page.touchscreen.tap(smoke.at[0], smoke.at[1]);
      spent = await page.waitForFunction((b) => (window.__DEBUG.game.player?.combat?.auxiliary?.smokeCharges ?? b) < b,
      { timeout: 6000, polling: 100 }, before).then(() => true, () => false);
    }
    await page.screenshot({ path: `${out}/phone-${spec}.png` });
    report.rows.push({ spec, reach, smokeChargesBefore: before, smokeSpent: spent });
    console.log(`phone-smoke-reach ${spec}: ${reach.map((r) => `${r.control} ${r.reached ? 'reached' : `COVERED by ${r.hit}`}`).join(', ')}; tap spent smoke: ${spent}`);
    await page.close();
  }
  for (const row of report.rows) {
    const smoke = row.reach.find((r) => r.control === 'smoke');
    assert.ok(smoke, `${row.spec}: a smoke tile shows on the phone HUD`);
    for (const r of row.reach) assert.ok(r.reached, `${row.spec}: a finger on ${r.control} at ${r.box} meets ${r.hit}, not the control`);
    assert.equal(row.smokeSpent, true, `${row.spec}: a tap on the smoke tile fires smoke`);
  }
  assert.deepEqual(report.errors, [], 'no page errors');
  console.log(`phone-smoke-reach: PASS (${report.rows.length} battles at 390x844 touch; smoke, jump and items reached; a tap fires smoke)`);
} catch (error) {
  report.failure = String(error?.stack ?? error).slice(0, 2000);
  console.log(`phone-smoke-reach: FAIL ${String(error?.message ?? error).split('\n')[0]}`);
  process.exitCode = 1;
} finally {
  writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
  clearInterval(refresh); await browser?.close(); lock.release();
}
