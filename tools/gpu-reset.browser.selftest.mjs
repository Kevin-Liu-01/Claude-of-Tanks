#!/usr/bin/env node
// gpu-reset.browser.selftest (mobile-gpu-reset-277): a real WebGL context loss reaches the field record. A page with the
// game's own renderer (src/engine/renderer.ts createRenderer) and the page's telemetry switched on (?telemetry=on, so a
// headless page sends) loses its context through WEBGL_lose_context (the renderer's own requestContextRestore) and gets it
// back; the beacon it sends carries the graphics-reset record (src/engine/gpuResetReport.ts), and the rooms-free server
// rule (server/telemetryRecord.ts validateTelemetryRecord) accepts it as it would at the sink.
import { launchGuardedBrowser } from './browser-launch.mjs';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';
import { openCaptureHold } from './capture-hold.mjs';
import { validateTelemetryRecord } from '../server/telemetryRecord.ts';

const FIXTURE = `<!doctype html><html><head><meta charset="utf-8"><link rel="icon" href="data:,"></head><body style="margin:0">
<div id="stage" style="width:320px;height:240px"></div>
<script type="module">
  const beacons = window.__BEACONS = [];
  navigator.sendBeacon = (url, body) => { beacons.push({ url: String(url), body: String(body) }); return true; };
  try {
    const { createRenderer } = await import('/src/engine/renderer.ts');
    const renderer = createRenderer(document.getElementById('stage'));
    renderer.userData.gpuResetContext = () => ({ phase: 'loading', loaderPercent: 97, mode: 'network', sinceEntryMs: 6000 });
    renderer.userData.contextRecovery = { onRestored: () => true };
    window.__RENDERER = renderer;
    window.__READY = 'ok';
  } catch (error) { window.__READY = String(error && error.stack || error); }
</script></body></html>`;

async function bounded(promise, ms, label) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms); })]);
  } finally { clearTimeout(timer); }
}

let hold, server, browser;
const report = { errors: [] };
try {
  hold = await openCaptureHold({ label: 'gpu-reset.browser.selftest', timeoutMs: 45 * 60_000 });
  server = await createServer({ root: process.cwd(), logLevel: 'error',
    server: { host: '127.0.0.1', port: 0, hmr: false, watch: null },
    plugins: [{ name: 'gpu-reset-fixture', enforce: 'pre', configureServer(instance) {
      instance.middlewares.use((request, response, next) => {
        if (!request.url?.startsWith('/__gpu_reset_fixture')) return next();
        response.setHeader('Content-Type', 'text/html');
        response.end(FIXTURE);
      });
    } }],
  });
  await server.listen();
  browser = await launchGuardedBrowser(puppeteer, { headless: 'new', timeout: 30_000, protocolTimeout: 120_000,
    args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'] }, { label: 'gpu-reset.browser.selftest' });
  const page = await browser.newPage();
  page.on('pageerror', (error) => report.errors.push(String(error)));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__gpu_reset_fixture?telemetry=on`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__READY, { timeout: 120_000 });
  assert.equal(await page.evaluate(() => window.__READY), 'ok', 'the renderer is created');
  assert.equal(await page.evaluate(() => window.__BEACONS.length), 0, 'no beacon before the loss');

  // a real loss and restore through the renderer's own recovery machine
  report.outcome = await bounded(page.evaluate(() => window.__RENDERER.userData.requestContextRestore()), 30_000, 'context restore');
  assert.equal(report.outcome, 'ready', 'the context came back');
  await page.waitForFunction(() => window.__BEACONS.length > 0, { timeout: 10_000 });
  const beacon = await page.evaluate(() => window.__BEACONS[0]);
  report.endpoint = beacon.url;
  const record = JSON.parse(beacon.body);
  report.record = record;
  const errors = [record.error, ...(record.errors ?? [])].filter(Boolean);
  const reset = errors.find((entry) => entry.stage === 'gpu-reset');
  assert.ok(reset, `the beacon carries the graphics-reset record (errors: ${JSON.stringify(errors)})`);
  assert.equal(reset.code, 'gpu_reset:loading:restored');
  assert.match(reset.message, /^gpu reset 1 phase=loading loader=97 preset=\S+ tier=(mobile|desktop) mode=network sinceEntryMs=6000 back=restored afterMs=\d+$/);
  const validated = validateTelemetryRecord(record);
  assert.equal(validated.ok, true, `the sink's rule accepts the record: ${validated.error ?? ''}`);
  assert.equal(validated.record.error?.code ?? validated.record.errors?.[0]?.code, 'gpu_reset:loading:restored');
} catch (error) {
  report.errors.push(String(error?.stack || error));
} finally {
  if (browser) {
    try { await bounded(browser.close(), 15_000, 'browser close'); } catch (error) { browser.process()?.kill('SIGKILL'); report.errors.push(String(error)); }
  }
  if (server) {
    try { await bounded(server.close(), 10_000, 'server close'); } catch (error) { report.errors.push(String(error)); }
  }
  await hold?.release();
}
report.ok = report.errors.length === 0;
console.log(report.ok
  ? `gpu-reset.browser.selftest: a real context loss and restore sent the graphics-reset record (${report.record?.error?.message ?? ''}), accepted by the sink's rule PASS`
  : JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;
