#!/usr/bin/env node
// armour-default.browser.mjs — armour colours on for everyone, once, with a one-time tip, on the live game (273).
// First-party tooling: Kevin B. Liu.
//
// A profile saved before the flip with the colours off (cot.settings.v1 armorAimOverlay: false, no flip marker):
//   1. the boot turns them on and saves so, and marks the tip due;
//   2. the first battle shows the tip in the battle's notice region: a keyboard's own key on the desktop, the Settings
//      row on a phone; the marker is done;
//   3. (desktop) H turns the colours off; after a reload they stay off, and the next battle shows no tip.
// Shots and report.json to the evidence folder.
//
//   node tools/armour-default.browser.mjs --view=desktop --locale=en
//   node tools/armour-default.browser.mjs --view=phone --locale=cn
//
// Holds the shared capture lock (render class) for one batch, and launches its browser through launchGuardedBrowser.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';
import { launchGuardedBrowser } from './browser-launch.mjs';
import { openCaptureHold } from './capture-hold.mjs';
import { readinessExpression } from './game-readiness.mjs';
import { nativeBrowserLaunchOptions } from './native-browser-launch.mjs';

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const VIEW = arg('view', 'desktop');
const LOCALE = arg('locale', 'en');
const VIEWS = {
  desktop: { width: 1920, height: 1080, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  phone: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
assert.ok(VIEWS[VIEW] && (LOCALE === 'en' || LOCALE === 'cn'), 'usage: --view=desktop|phone --locale=en|cn');
const OUT = resolve(arg('out', resolve(process.cwd(), `../armour-default-273-evidence/${VIEW}-${LOCALE}`)));
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const touch = VIEW === 'phone';
const report = { view: VIEW, locale: LOCALE, checks: {}, errors: [], startedAt: new Date().toISOString() };

let server, browser, hold;
try {
  hold = await openCaptureHold({ label: 'armour-default', place: `armour-${VIEW}-${LOCALE}`, lockClass: 'render', timeoutMs: 90 * 60_000 });
  server = await createServer({ root: process.cwd(), logLevel: 'error', server: { host: '127.0.0.1', port: 0, hmr: false } });
  await server.listen();
  browser = await launchGuardedBrowser(puppeteer, nativeBrowserLaunchOptions({ headless: 'new', timeout: 120_000, protocolTimeout: 600_000,
    defaultViewport: null, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage',
      `--window-size=${VIEWS[VIEW].width},${VIEWS[VIEW].height + 120}`] }), { label: 'armour-default' });
  const page = await browser.newPage();
  await page.setViewport(VIEWS[VIEW]);
  if (touch) {
    await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1');
    try { await page.emulateMediaFeatures([{ name: 'pointer', value: 'coarse' }, { name: 'hover', value: 'none' }]); } catch { /* older engine */ }
  }
  page.on('pageerror', (error) => report.errors.push(`pageerror: ${String(error?.message ?? error).slice(0, 300)}`));
  // the profile before the flip, seeded once (a reload keeps what the page saved)
  await page.evaluateOnNewDocument(() => {
    Document.prototype.hasFocus = () => true;
    try {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('cot.telemetry', 'off');
      localStorage.setItem('cot.tutorial.v1', '{"v":2,"garage":"skipped","training":"skipped","debrief":"skipped","tour":"skipped","offer":"later"}'); // the journey finished, its offer answered (tutorialRecord.ts TUTORIAL_FINISHED_RECORD)
      localStorage.setItem('cot.settings.v1', JSON.stringify({ armorAimOverlay: false, sensitivity: 1.4, revision: 2 }));
      localStorage.removeItem('cot.armourOverlayDefault.v1');
    } catch { /* none */ }
  });
  const url = `http://127.0.0.1:${server.httpServer.address().port}${LOCALE === 'cn' ? '/cn' : ''}/?nosplash=1&telemetry=off&tier=${touch ? 'mobile' : 'desktop'}`;
  const boot = async () => {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 300_000 });
    await page.waitForFunction(`${readinessExpression('garage')} && !!window.__DEBUG`, { timeout: 600_000, polling: 500 });
  };
  const stored = () => page.evaluate(() => ({
    settings: JSON.parse(localStorage.getItem('cot.settings.v1') || 'null'),
    marker: localStorage.getItem('cot.armourOverlayDefault.v1'),
  }));
  /** A battle: start it, wait for the rollout, and read the battle's notice region for 10 s. */
  async function battle(name) {
    await page.evaluate(() => window.__DEBUG.beginSoloBattle({}));
    await page.waitForFunction(`${readinessExpression('controlsReleased')}`, { timeout: 900_000, polling: 1000 });
    let tip = null;
    for (let i = 0; i < 40 && !tip; i++) {
      tip = await page.evaluate(() => {
        const notice = [...document.querySelectorAll('.cot-battle-notices .cot-c-notice, .cot-battle-notices [role="status"], .cot-battle-notices > *')]
          .find((node) => /armor|装甲/i.test(node.textContent || ''));
        return notice ? (notice.textContent || '').replace(/\s+/g, ' ').trim() : null;
      });
      if (!tip) await sleep(250);
    }
    await page.screenshot({ path: resolve(OUT, `${name}.png`) });
    return tip;
  }

  // 1. the flip at boot
  await boot();
  const afterBoot = await stored();
  report.checks.boot = afterBoot;
  assert.equal(afterBoot.settings?.armorAimOverlay, true, 'the profile saved off is turned on at boot, and saved so');
  assert.equal(afterBoot.settings?.sensitivity, 1.4, 'the rest of the record is kept');
  assert.equal(afterBoot.marker, 'tip', 'its tip is due');
  // 2. the first battle's tip
  const tip = await battle('battle1-tip');
  report.checks.tip = tip;
  assert.ok(tip, 'the first battle shows the tip');
  if (touch) assert.ok(/›/.test(tip), 'a phone reads the Settings row');
  else assert.ok(/\bH\b/.test(tip), 'a keyboard reads its own key (H)');
  assert.equal((await stored()).marker, 'done', 'the tip is done once shown');
  if (!touch) {
    // 3. H turns them off; it sticks over a reload, and the next battle has no tip
    await page.mouse.click(VIEWS[VIEW].width / 2, VIEWS[VIEW].height * 0.6);
    await page.keyboard.press('KeyH');
    await sleep(500);
    report.checks.afterH = (await stored()).settings?.armorAimOverlay;
    assert.equal(report.checks.afterH, false, 'H turns the colours off, saved');
    await boot();
    const reloaded = await stored();
    report.checks.reload = reloaded;
    assert.equal(reloaded.settings?.armorAimOverlay, false, 'off sticks over a reload (the flip ran once)');
    const second = await battle('battle2-no-tip');
    report.checks.secondTip = second;
    assert.equal(second, null, 'the next battle shows no tip');
  }
  report.ok = true;
} catch (error) {
  report.ok = false;
  report.failure = String(error?.stack ?? error).slice(0, 2000);
  console.error(error);
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  writeFileSync(resolve(OUT, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  await browser?.close().catch(() => {});
  await server?.close().catch(() => {});
  await hold?.release();
  console.log(`[armour] ${report.ok ? 'PASS' : 'FAIL'} → ${OUT} ${JSON.stringify(report.checks)}`);
}
