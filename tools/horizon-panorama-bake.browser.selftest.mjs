#!/usr/bin/env node
// Drift receipt on the far panorama's bake: Saltwind's far country as gauntlet wave 47 passed it. It detects a change
// to the bake — its relief, light, tones, haze and the strip's fill — that would move the far country off the look the
// critics scored. It does NOT predict a capture's frames: the game's output grade (post.ts) is not modelled, and over
// Saltwind's candidates this proxy and the frames' own levels moved apart (wave 47's edge-w frame: the ridge 20.7
// levels under the sky with 17.8 of shading, by silhouette; this proxy, before the grade, about 52 and 28). A pass says
// the bake is the scored one; it says nothing about a new look, which needs a capture and a wave.
//
// Saltwind's ring and far country are baked on a real WebGL context under the sky the game published for it and the
// battlefield's ground and rock means (CAPTURE, as that capture recorded them); the shell is rendered alone from the
// capture's edge-w camera and its far country over the western channel measured by silhouette (every pixel under each
// column's skyline) through the aerial pass's haze law (each column's distance to the shell, each pixel's layer mean),
// against the sky at the horizon: its contrast (sky - median) and its shading (p90 - p10). Separately, the band check
// (wave 32's "uniform bright haze stripe, lighter than the range above it"): the strip's fill, the band an elevated
// camera sees under the ridge, against the ridge above it in the atlas — never brighter, and where it was scored.
//
// A re-pin needs a new capture and a wave. HORIZON_BAKE_MEASURE=<runs> prints the proxy of that many fresh pages and
// its spread instead of asserting.
//   node tools/horizon-panorama-bake.browser.selftest.mjs
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';
import { createCaptureLock } from './capture-lock.mjs';
import { nativeBrowserLaunchOptions, verifyNativeBrowserLaunch } from './native-browser-launch.mjs';

// Saltwind's published sky and the battlefield's ground and rock means as the wave-47 capture recorded them (paircap's
// after side, edge-w: scene.userData.atmosphere, the bake's stats; the rock mean is recorded, the map keeps its own
// pale limestone, ownRock); the census edge-w camera and its box over the far ridge across the western channel (x
// 320-1420, y 250-438 of the 1600 x 900 frame, here of the fixture's 800 x 450), and the atlas window of the band (u
// 0.20-0.38)
const CAPTURE = Object.freeze({
  map: 'saltwind',
  sky: { horizon: [0.6458, 0.7692, 0.716], sunHorizon: [0.805, 0.8812, 0.7725], fogTint: [0.3325, 0.4793, 0.5583],
    fogMix: 0.48, overcast: 0 },
  ground: [0.074, 0.071, 0.0144], rock: [0.1887, 0.1562, 0.1418],
  views: [{ name: 'edge-w', position: [-412, -5.2986, 120], quaternion: [0, 0.7071068, 0, 0.7071068], fov: 55, box: [160, 125, 710, 219] }],
  band: { u0: 0.2, u1: 0.38 },
});

// ---- PINS ----
// Saltwind's far country as gauntlet wave 47 scored it: candidate 2, mountains-saltwind 27e035a34, shot in the pair
// ticket held 02:54:40-02:55:57 on 2026-10-04 (ANGLE Metal, Apple M5 Max). PINS are that tree's proxy on this receipt's
// platform, the medians of 6 fresh pages over 2 browser launches (ANGLE (Apple, ANGLE Metal Renderer: Apple M5 Max,
// Unspecified Version)); their spread, run to run: contrast 0.00, shading 0.00, band 0.00 levels. The same tree on
// SwiftShader reads 52.42, 28.33 and -6.79 (7 pages over 4 launches, bit-identical), 0.26 levels from these at most;
// the record's four-decimal rounding moves them by under 0.001. TOLERANCE is half a level: over those spreads, and well
// inside the distance to Saltwind's other candidates (on SwiftShader: candidate 1, held, 1.0 below in contrast and 17.3
// in shading; candidate 3, unscored, 3.0 above and 8.1 below).
const PINS = Object.freeze({ contrast: 52.41, shading: 28.59, band: -6.78 });
const TOLERANCE = 0.5;
// ---- end PINS ----

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

const measureRuns = Math.max(0, Math.floor(Number(process.env.HORIZON_BAKE_MEASURE ?? 0)) || 0);
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
    timeout: 30_000, protocolTimeout: 300_000,
    args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'] }));
  report.launch = verifyNativeBrowserLaunch(browser);
  const runs = [];
  for (let run = 0; run < Math.max(1, measureRuns); run++) {
    const page = await browser.newPage();
    page.on('pageerror', error => report.errors.push(String(error)));
    page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
    const response = await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__horizon_panorama_bake_fixture`, { waitUntil: 'domcontentloaded' });
    assert.equal(response.status(), 200);
    assert.equal(await page.evaluate(() => document.body.dataset.bakeFixture), '1');
    runs.push(await bounded(page.evaluate(async (spec) => {
      const { measureHorizonPanoramaBake } = await import('/tools/horizon-panorama-bake.browser.fixture.mjs');
      return measureHorizonPanoramaBake(spec);
    }, CAPTURE), 240_000, 'the panorama bake'));
    await page.close();
  }
  assert.equal(sourceHash(), report.sourceHash, 'source changed during acquisition');
  report.proxy = runs.map(({ gpu, baked, stats, views, band }) => {
    const v = views?.['edge-w'];
    return { gpu, baked, haze: stats.haze, tone: stats.tone, pixels: v?.pixels ?? 0,
      contrast: v ? v.sky - v.median : NaN, shading: v ? v.p90 - v.p10 : NaN, band: band ? band.fill - band.ridge : NaN,
      ridge: band?.ridge ?? NaN, fill: band?.fill ?? NaN };
  });
  if (measureRuns > 0) {
    const spread = (k) => Math.max(...report.proxy.map((p) => p[k])) - Math.min(...report.proxy.map((p) => p[k]));
    report.spread = { contrast: spread('contrast'), shading: spread('shading'), band: spread('band') };
  } else {
    const [p] = report.proxy;
    assert.ok(!/swiftshader|llvmpipe|softpipe|software/i.test(p.gpu), `a hardware renderer (${p.gpu}): the pins are native`);
    assert.ok(p.baked && p.haze === 'law' && p.tone === 'ground', 'baked under the published sky\'s haze law and the battlefield\'s means');
    assert.ok(p.pixels > 2000, `the far country stands over the western channel (${p.pixels} pixels)`);
    const off = (k) => `${p[k].toFixed(2)} for ${PINS[k]} (a re-pin needs a capture and a wave)`;
    assert.ok(Math.abs(p.contrast - PINS.contrast) <= TOLERANCE, `the far ridge under the sky as wave 47 scored it: ${off('contrast')}`);
    assert.ok(Math.abs(p.shading - PINS.shading) <= TOLERANCE, `the far ridge's shading as wave 47 scored it: ${off('shading')}`);
    // the band check, its own assertions: the fill under the ridge never brighter than the ridge above it, and where
    // wave 47 scored it
    assert.ok(p.band <= 0, `the band under the ridge no brighter than the ridge (fill - ridge ${p.band.toFixed(2)})`);
    assert.ok(Math.abs(p.band - PINS.band) <= TOLERANCE, `the band as wave 47 scored it: ${off('band')}`);
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
