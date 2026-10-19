#!/usr/bin/env node
// black-world.browser.selftest.mjs — the battle's black-world guard on a real GPU (2026-10-19, black-screen-228; the owner:
// "black screens are still coming up for me the first time i load into maps ... it can also happen when i esc out and
// come back in"). One dev page enters a covered solo battle on Redrock Divide and fails on a black world:
//  - at battle start (the cover lifted): the guard armed and probing, no incident, the world region not exactly black;
//  - after Esc and Resume: the same;
//  - an injected camera without layer 0 (the owner's signature: the scene pass lands nothing, the late FX and the HUD
//    still draw) is named camera-layer-mask and healed by H1 within half a second.
// It takes the capture lock itself (an owned lease, run-selftests.mjs) and the hardware ANGLE path.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { createCaptureLock } from './capture-lock.mjs';
import { nativeBrowserLaunchOptions, verifyNativeBrowserLaunch } from './native-browser-launch.mjs';

const VIEW = { width: 1280, height: 720 };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function bounded(promise, ms, label) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms); })]);
  } finally { clearTimeout(timer); }
}

/** The share of the world region (the frame's centre box, the HUD at its edges) that is exactly 0,0,0. */
async function worldZeroShare(page) {
  const png = await page.screenshot({ type: 'png', captureBeyondViewport: false });
  const image = await loadImage(png);
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0);
  const { data, width, height } = context.getImageData(0, 0, image.width, image.height);
  let n = 0, zero = 0;
  for (let y = Math.floor(height * 0.14); y < Math.ceil(height * 0.8); y += 2) {
    for (let x = Math.floor(width * 0.16); x < Math.ceil(width * 0.84); x += 2) {
      if (x >= width * 0.46 && x < width * 0.54 && y >= height * 0.5 && y < height * 0.62) continue;
      const i = (y * width + x) * 4;
      n++;
      if (data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 0) zero++;
    }
  }
  return zero / n;
}

const guardState = () => {
  const guard = window.__COT_BLACK_GUARD;
  return guard ? { ...guard.stats(), receipts: (window.__GL_DIAG?.blackWorld ?? []).length,
    mask: window.__DEBUG.camera.layers.mask, phase: window.__DEBUG.game.phase } : null;
};

const lock = createCaptureLock();
const report = { errors: [], checks: {} };
let server, browser, refresh;
try {
  await lock.acquire(45 * 60_000);
  refresh = setInterval(() => lock.refresh(), 30_000); refresh.unref();
  server = await createServer({ root: process.cwd(), logLevel: 'error', server: { host: '127.0.0.1', port: 0, hmr: false } });
  await server.listen();
  browser = await puppeteer.launch(nativeBrowserLaunchOptions({ headless: 'new', timeout: 60_000, protocolTimeout: 300_000,
    defaultViewport: null, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--no-sandbox',
      '--disable-dev-shm-usage', `--window-size=${VIEW.width},${VIEW.height + 120}`] }));
  report.launch = verifyNativeBrowserLaunch(browser);
  const page = await browser.newPage();
  await page.setViewport({ ...VIEW, deviceScaleFactor: 1 });
  page.on('pageerror', (error) => report.errors.push(`pageerror: ${String(error?.message ?? error).slice(0, 300)}`));
  await page.evaluateOnNewDocument(() => {
    // the frame scheduler presents only to a focused document; a headless page has no OS focus
    Document.prototype.hasFocus = () => true;
    try { localStorage.setItem('cot.telemetry', 'off'); localStorage.setItem('cot.game.mode.v1', 'drone'); } catch { /* none */ }
  });
  const port = server.httpServer.address().port;
  await page.goto(`http://127.0.0.1:${port}/?nosplash=1&debug=1&telemetry=off&tier=desktop`, { waitUntil: 'domcontentloaded', timeout: 240_000 });
  await page.waitForFunction('window.__GAME_READY === true && !!window.__DEBUG', { timeout: 300_000, polling: 250 });
  await page.evaluate(() => { setTimeout(() => window.__DEBUG.beginSoloBattle({ specId: 't72b3m_bulat_m', mapId: 'badlands' }), 0); });
  // the cover lifted and the guard armed by the covered entry
  await page.waitForFunction(() => window.__DEBUG.game.phase === 'battle' && !document.querySelector('.cot-bl.on')
    && window.__COT_BLACK_GUARD?.stats().active === true, { timeout: 420_000, polling: 250 });

  const judge = async (label) => {
    const start = await page.evaluate(guardState);
    await sleep(3000);
    const end = await page.evaluate(guardState);
    const zero = await worldZeroShare(page);
    report.checks[label] = { start, end, zeroShare: +zero.toFixed(3) };
    assert.ok(end.active, `${label}: the guard is active`);
    assert.ok(end.probes - start.probes >= 5, `${label}: the guard probes (${end.probes - start.probes} in 3 s)`);
    assert.equal(end.incidents, 0, `${label}: no black-world incident`);
    assert.equal(end.lastLit, true, `${label}: the last probe's lit query kept cells (the world drew)`);
    assert.equal(end.lastNan, false, `${label}: no non-finite cell`);
    assert.ok(zero < 0.8, `${label}: the world region is not black (${zero.toFixed(3)} exactly zero)`);
  };
  await judge('battle start');

  // Esc (the pause menu), a dwell, Resume
  await page.keyboard.press('Escape');
  await sleep(1500);
  await page.evaluate(() => document.querySelector('.cot-set-btn.resume')?.click());
  await sleep(1000);
  await judge('after resume');

  // the owner's signature, injected: the camera loses layer 0 (the scene pass lands nothing)
  const healed = await page.evaluate(async () => {
    const C = window.__DEBUG.camera;
    const before = (window.__GL_DIAG?.blackWorld ?? []).length;
    const at = performance.now();
    C.layers.set(5);
    for (let i = 0; i < 120; i++) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const ring = window.__GL_DIAG?.blackWorld ?? [];
      const receipt = ring[ring.length - 1];
      if (ring.length > before && receipt.closed) {
        return { class: receipt.class, healedBy: receipt.healedBy, afterMs: Math.round(receipt.healedAtMs - at), frames: i + 1,
          mask: C.layers.mask, steps: receipt.steps.map((s) => s.step) };
      }
    }
    return { timedOut: true, mask: C.layers.mask, stats: window.__COT_BLACK_GUARD.stats() };
  });
  report.checks.heal = healed;
  assert.equal(healed.class, 'camera-layer-mask', 'the injected fault is named');
  assert.equal(healed.healedBy, 'H1', 'H1 heals it');
  assert.ok(healed.afterMs <= 500, `healed within half a second (${healed.afterMs} ms, ${healed.frames} frames)`);
  assert.equal(healed.mask & 1, 1, 'the camera sees layer 0 again');
  assert.ok(await worldZeroShare(page) < 0.8, 'the world is back');
} catch (error) {
  report.errors.push(String(error?.stack ?? error).slice(0, 1200));
} finally {
  if (browser) {
    try { await bounded(browser.close(), 15_000, 'browser close'); }
    catch (error) { browser.process()?.kill('SIGKILL'); report.errors.push(String(error)); }
  }
  if (server) {
    try { await bounded(server.close(), 10_000, 'server close'); }
    catch (error) { report.errors.push(String(error)); }
  }
  clearInterval(refresh); lock.release();
}
report.ok = report.errors.length === 0;
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;
