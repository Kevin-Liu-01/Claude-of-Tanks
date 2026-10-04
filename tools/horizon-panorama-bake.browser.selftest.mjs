#!/usr/bin/env node
// Native pixel regression on the far panorama's bake (gauntlet wave 32, Saltwind: the ghost range "about 11 of 255
// levels below the sky, with about 8 levels of internal shading", "the stripe under the range 10-15 levels brighter than
// the range"; ridges that read as real sit about 25 below the sky with about 30 levels of shading). Saltwind's ring and
// far country are baked on a real WebGL context under the sky the game publishes for it and the battlefield's ground and
// rock means, both pinned from the game's own capture (CAPTURE below); the fixture reads the atlas back and measures the
// ridge and the band under it as the frame shows them (the aerial pass's haze law over the shell's depth from the
// map's edge, the sky at the horizon). DISPLAY_SLOPE carries those levels through the game's display transform (the
// output grade): the frame's levels per fixture level, fitted on the same capture.
//   node tools/horizon-panorama-bake.browser.selftest.mjs
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';
import { createCaptureLock } from './capture-lock.mjs';
import { nativeBrowserLaunchOptions, verifyNativeBrowserLaunch } from './native-browser-launch.mjs';

// Saltwind's published sky and the battlefield's ground and rock means, as the game's capture of b3736eb7c recorded them
// (paircap, the after side's edge-w view: scene.userData.atmosphere, the bake's stats); the windows over the far ridge
// across the western channel (edge-w, sky-w) and the karst country to the north (establishing)
const CAPTURE = Object.freeze({
  map: 'saltwind',
  sky: { horizon: [0.6458, 0.7692, 0.716], sunHorizon: [0.805, 0.8812, 0.7725],
    fogTint: [0.3325, 0.4793, 0.5583], fogMix: 0.48, overcast: 0 },
  ground: [0.074, 0.071, 0.0144], rock: [0.1887, 0.1562, 0.1418],
  shellD: 2900, layer: 0.9,
  windows: [{ name: 'west', u0: 0.40, u1: 0.60 }, { name: 'north', u0: 0.20, u1: 0.38 }],
});
// the game's display transform over these levels (the output grade after the aerial pass), fitted on the same capture's
// edge-w frames against the fixture's west window: the ridge under the sky 22.1 frame levels for 50.0 fixture levels, its
// p10..p90 spread 16.8 for 9.5 (the grade compresses the bright end toward the sky and spreads the mid-tones)
const DISPLAY_SLOPE = Object.freeze({ contrast: 0.441, shading: 1.756 });

function sourceHash() {
  const hash = createHash('sha256');
  for (const file of ['./horizon-panorama-bake.browser.selftest.mjs', './horizon-panorama-bake.browser.fixture.mjs',
    '../src/world/horizonPanorama.ts', '../src/world/maps/horizon.ts', '../src/world/maps/saltwind.ts', '../src/engine/hazeLaw.ts',
    '../package-lock.json']) hash.update(readFileSync(new URL(file, import.meta.url)));
  return hash.digest('hex');
}
async function bounded(promise, ms, label) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    })]);
  } finally { clearTimeout(timer); }
}

const lock = createCaptureLock();
const report = { sourceHash: sourceHash(), errors: [] };
let server, browser, refresh;
try {
  await lock.acquire(45 * 60_000);
  refresh = setInterval(() => lock.refresh(), 30_000); refresh.unref();
  server = await createServer({ root: process.cwd(), logLevel: 'error',
    server: { host: '127.0.0.1', port: 0, hmr: false, watch: null },
    plugins: [{ name: 'horizon-panorama-bake-fixture', enforce: 'pre', configureServer(instance) {
      instance.middlewares.use((request, response, next) => {
        if (request.url !== '/__horizon_panorama_bake_fixture') return next();
        response.setHeader('Content-Type', 'text/html');
        response.end('<!doctype html><html><head><link rel="icon" href="data:,"></head><body data-bake-fixture="1"></body></html>');
      });
    } }],
  });
  await server.listen();
  browser = await puppeteer.launch(nativeBrowserLaunchOptions({ headless: 'new',
    timeout: 30_000, protocolTimeout: 180_000,
    args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'] }));
  report.launch = verifyNativeBrowserLaunch(browser);
  const page = await browser.newPage();
  page.on('pageerror', error => report.errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
  const response = await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__horizon_panorama_bake_fixture`, { waitUntil: 'domcontentloaded' });
  assert.equal(response.status(), 200);
  assert.equal(await page.evaluate(() => document.body.dataset.bakeFixture), '1');
  report.fixture = await bounded(page.evaluate(async (spec) => {
    const { measureHorizonPanoramaBake } = await import('/tools/horizon-panorama-bake.browser.fixture.mjs');
    return measureHorizonPanoramaBake(spec);
  }, CAPTURE), 150_000, 'the panorama bake');
  assert.equal(sourceHash(), report.sourceHash, 'source changed during acquisition');
  const { baked, stats, windows } = report.fixture;
  assert.ok(baked && stats.haze === 'law' && stats.tone === 'ground', 'baked under the published sky\'s haze law and the battlefield\'s means');
  report.levels = {};
  for (const [name, w] of Object.entries(windows)) {
    const contrast = DISPLAY_SLOPE.contrast * (w.sky - w.ridge), shading = DISPLAY_SLOPE.shading * (w.p90 - w.p10), band = w.band - w.ridge;
    report.levels[name] = { contrast: +contrast.toFixed(1), shading: +shading.toFixed(1), bandOverRidge: +band.toFixed(1) };
    assert.ok(w.texels > 2000, `${name}: the far country stands above the ring`);
    assert.ok(contrast >= 20, `${name}: the ridge at least 20 levels under the sky (${contrast.toFixed(1)})`);
    assert.ok(shading >= 20, `${name}: at least 20 levels of shading within the ridge (${shading.toFixed(1)})`);
    assert.ok(!(band > 0), `${name}: the band under the ridge no brighter than the ridge (${band.toFixed(1)})`);
  }
} catch (error) {
  report.errors.push(String(error));
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
