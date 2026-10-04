#!/usr/bin/env node
// Native focused receipt. Run: node tools/vehicle-ground-occlusion.browser.selftest.mjs
// The ground-occlusion GLSL (src/engine/vehicleGroundOcclusion.ts) evaluated on the GPU at the receipt's ground points
// — the union points the CPU law is held to (vehicleGroundOcclusion.selftest.mjs) and the wraps, shoes, gap fade and
// tilted receivers — must equal its CPU twin: the bare geometry of one hull, then snow under a sun with two hulls.
// Uniforms come from the module's own packing; the float target is read back exactly.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { createCaptureLock } from './capture-lock.mjs';
import { nativeBrowserLaunchOptions, verifyNativeBrowserLaunch } from './native-browser-launch.mjs';
import { evaluateVehicleGroundGlsl } from './vehicle-ground-occlusion.browser.fixture.mjs';
import { vehicleGroundGlslCases } from '../src/engine/vehicleGroundOcclusion.test-support.mjs';

/** float32 on the GPU against float64 here: the edge terms' atan and the cross products' rounding */
const TOLERANCE = 5e-4;

async function bounded(promise, timeoutMs, label) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
    })]);
  } finally { clearTimeout(timer); }
}

const { labels, cases, glsl } = await vehicleGroundGlslCases();
const lock = createCaptureLock();
const report = { protocol: 'vehicle-ground-occlusion-glsl-v1', ok: false, renderer: null, cases: [], errors: [], browserClosed: false, lockReleased: false };
let browser, refresh;
try {
  await lock.acquire(45 * 60_000);
  refresh = setInterval(() => lock.refresh(), 30_000); refresh.unref();
  browser = await puppeteer.launch(nativeBrowserLaunchOptions({ headless: 'new', timeout: 30_000, protocolTimeout: 60_000,
    args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'] }));
  report.launch = verifyNativeBrowserLaunch(browser);
  const page = await browser.newPage();
  page.on('pageerror', (error) => { if (report.errors.length < 12) report.errors.push(String(error)); });
  for (const c of cases) {
    const { values, renderer } = await bounded(page.evaluate(evaluateVehicleGroundGlsl, { glsl, ...c.input }), 60_000, c.name);
    report.renderer = renderer;
    const rows = labels.map((label, i) => ({ label, gpu: +values[i].toFixed(6), cpu: +c.expected[i].toFixed(6), d: +(values[i] - c.expected[i]).toExponential(2) }));
    report.cases.push({ name: c.name, worst: Math.max(...rows.map((r) => Math.abs(r.gpu - r.cpu))), rows });
    for (const r of rows) assert.ok(Math.abs(r.gpu - r.cpu) <= TOLERANCE, `${c.name}, ${r.label}: GPU ${r.gpu} vs CPU ${r.cpu}`);
  }
  assert.deepEqual(report.errors, []);
} catch (error) {
  report.errors.push(String(error?.stack ?? error));
} finally {
  if (browser) {
    try { await bounded(browser.close(), 15_000, 'browser close'); report.browserClosed = true; }
    catch (error) { report.errors.push(String(error)); const child = browser.process(); if (child && child.exitCode === null) child.kill('SIGKILL'); }
  }
  clearInterval(refresh); lock.release(); report.lockReleased = true;
}
report.ok = report.errors.length === 0 && report.cases.length === cases.length && report.browserClosed && report.lockReleased;
console.log(JSON.stringify({ ...report, cases: report.cases.map((c) => ({ name: c.name, worst: c.worst })) }, null, 2));
if (!report.ok) { console.log(JSON.stringify(report.cases, null, 1)); process.exitCode = 1; }
else console.log(`vehicle-ground-occlusion.browser.selftest: the GLSL equals its CPU twin at ${labels.length} receivers in ${cases.length} cases (worst ${Math.max(...report.cases.map((c) => c.worst)).toExponential(2)}, tolerance ${TOLERANCE}; ${report.renderer}) PASS`);
