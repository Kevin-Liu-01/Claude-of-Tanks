#!/usr/bin/env node
// black-world.browser.selftest.mjs — the battle's black-world guard on a real GPU (2026-10-19, black-screen-228; the owner:
// "black screens are still coming up for me the first time i load into maps ... it can also happen when i esc out and
// come back in"). One dev page enters a covered solo battle on Redrock Divide and fails on a black world:
//  - at battle start (the cover lifted): the guard armed and probing, no incident, the world region not exactly black;
//  - after Esc and Resume: the same;
//  - an injected camera without layer 0 (the owner's signature: the scene pass lands nothing, the late FX and the HUD
//    still draw) is named camera-layer-mask and healed by H1 within half a second.
// Round 2 (2026-10-20):
//  - the guard's probe programs linked before the reveal (no first-probe compile on a presented frame);
//  - the scene target stays complete across a resize whose depth texture is first bound by a sampler (D1: the stale
//    depth storage left FRAMEBUFFER_INCOMPLETE_DIMENSIONS and every world draw dropped; fails on the round-1 head);
//  - Esc, LEAVE BATTLE, the Garage, BATTLE again (the owner's "esc out and come back in"): a complete scene target, no
//    incident, the world drawn;
//  - a late composite cleared to zero over a healthy scene target (D2) is named downstream-black.
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

/** The scene target's framebuffer status (resolve and MSAA) as the next scene pass binds it. */
const sceneTargetStatus = () => {
  const R = window.__DEBUG.renderer, st = window.__DEBUG.post.sceneAA.sceneTarget, gl = R.getContext();
  const previous = R.getRenderTarget();
  R.setRenderTarget(st);
  const props = R.properties.get(st);
  const status = (fb) => { if (!fb) return null; gl.bindFramebuffer(gl.FRAMEBUFFER, fb); return gl.checkFramebufferStatus(gl.FRAMEBUFFER); };
  const out = { resolve: status(props.__webglFramebuffer), msaa: status(props.__webglMultisampledFramebuffer),
    size: [st.width, st.height], depthImage: [st.depthTexture.image.width, st.depthTexture.image.height] };
  R.setRenderTarget(null);
  R.setRenderTarget(previous);
  return out;
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
  // (round 2) the probe's programs linked under the cover: the first probe never compiles on a presented frame
  report.checks.probeReadyAtReveal = await page.evaluate(() => window.__COT_BLACK_GUARD.stats().probeReady);
  assert.equal(report.checks.probeReadyAtReveal, true, 'the probe programs linked before the reveal');

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

  // (round 2, D1) a resize whose depth texture is first bound by a sampler (renderer.initTexture: three's sampler path,
  // as a soft particle, the cloud trace or a lone warm pass binds it) must leave the scene target complete
  report.checks.depthResize = await page.evaluate(async (statusSource) => {
    const status = new Function(`return (${statusSource})()`);
    const P = window.__DEBUG.post, R = window.__DEBUG.renderer;
    const css = { x: 0, y: 0, set(x, y) { this.x = x; this.y = y; return this; } };
    R.getSize(css);
    const rows = [];
    for (const scale of [0.75, 1]) {
      P.setSize(Math.round(css.x * scale), Math.round(css.y * scale));
      R.initTexture(P.sceneAA.sceneTarget.depthTexture);
      rows.push({ scale, ...status() });
    }
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return rows;
  }, sceneTargetStatus.toString());
  for (const row of report.checks.depthResize) {
    assert.equal(row.resolve, 0x8cd5, `a sampler-first depth bind after a resize to ${row.scale}: the scene target is complete (${JSON.stringify(row)})`);
    if (row.msaa !== null) assert.equal(row.msaa, 0x8cd5, 'and its multisampled framebuffer too');
  }
  await judge('after the depth resize');

  // (round 2, D1) Esc, LEAVE BATTLE, the Garage, BATTLE again: the scene target complete, no incident, the world drawn
  {
    const before = await page.evaluate(guardState);
    await page.keyboard.press('Escape');
    await sleep(800);
    await page.evaluate(() => document.querySelector('.cot-set-btn.leave')?.click());
    await sleep(500);
    await page.evaluate(() => {
      const confirm = [...document.querySelectorAll('button')].find((b) => /^(leave|confirm|yes)/i.test(b.textContent.trim())
        && b.offsetParent !== null && !b.classList.contains('leave'));
      confirm?.click();
    });
    // the Garage settled as a player sees it (its BATTLE control shown, no transition cover) before BATTLE again: an entry
    // begun while the return still presents supersedes it ("Garage return was superseded by another presentation")
    await page.waitForFunction(() => {
      const battle = document.querySelector('.cot-battle');
      return window.__DEBUG.game.phase === 'garage' && !!battle && battle.offsetParent !== null
        && !document.querySelector('.cot-trans.on, .cot-bl.on');
    }, { timeout: 120_000, polling: 250 });
    await sleep(3000);
    await page.evaluate(() => { setTimeout(() => window.__DEBUG.beginSoloBattle({ specId: 't72b3m_bulat_m', mapId: 'badlands' }), 0); });
    await page.waitForFunction(() => window.__DEBUG.game.phase === 'battle' && !document.querySelector('.cot-bl.on')
      && window.__COT_BLACK_GUARD?.stats().active === true, { timeout: 420_000, polling: 250 });
    await sleep(600);
    const status = await page.evaluate(sceneTargetStatus);
    report.checks.reentry = { status, before: before.incidents };
    assert.equal(status.resolve, 0x8cd5, `re-entry: the scene target is complete (${JSON.stringify(status)})`);
    await judge('after leave and re-entry');
    assert.equal((await page.evaluate(guardState)).incidents, before.incidents, 're-entry: no incident since the leave');
  }

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
  // the acceptance's bound is 30 frames (half a second at 60 Hz): a page this busy host starves to a few frames a second
  // (5146 ms for 8 frames, 2026-10-20) measures the host in wall time, not the guard
  assert.ok(healed.frames <= 30, `healed within 30 frames (${healed.frames} frames, ${healed.afterMs} ms)`);
  assert.equal(healed.mask & 1, 1, 'the camera sees layer 0 again');
  assert.ok(await worldZeroShare(page) < 0.8, 'the world is back');

  // (round 2, D2) downstream of the scene target: the aerial pass draws, then its destination (the late composite's
  // input) is cleared to zero for 2 s, the scene target healthy (the critic's aerialblack): named downstream-black
  const downstream = await page.evaluate(async () => {
    const P = window.__DEBUG.post, S = window.__DEBUG.scene;
    const before = (window.__GL_DIAG?.blackWorld ?? []).length;
    let ColorCtor = null;
    S.traverse((o) => { if (!ColorCtor && o.material && !Array.isArray(o.material) && o.material.color?.isColor) ColorCtor = o.material.color.constructor; });
    const saved = new ColorCtor();
    const until = performance.now() + 2000;
    const original = P.aerial.render;
    P.aerial.render = function (renderer, writeBuffer, readBuffer, ...rest) {
      const result = original.call(this, renderer, writeBuffer, readBuffer, ...rest);
      if (performance.now() < until) {
        const target = this.directColorReadBuffer === writeBuffer ? P.lateFx.target : writeBuffer;
        const previous = renderer.getRenderTarget();
        renderer.getClearColor(saved);
        const alpha = renderer.getClearAlpha();
        renderer.setRenderTarget(target); renderer.setClearColor(0x000000, 1); renderer.clear(true, false, false);
        renderer.setClearColor(saved, alpha); renderer.setRenderTarget(previous);
      }
      return result;
    };
    try {
      while (performance.now() < until + 1500) await new Promise((resolve) => requestAnimationFrame(resolve));
    } finally { P.aerial.render = original; }
    const ring = window.__GL_DIAG?.blackWorld ?? [];
    return { opened: ring.slice(before).map((r) => ({ class: r.class, healedBy: r.healedBy, closed: r.closed })) };
  });
  report.checks.downstream = downstream;
  assert.ok(downstream.opened.some((r) => r.class === 'downstream-black'), `the cleared late composite is named downstream-black (${JSON.stringify(downstream)})`);
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
