#!/usr/bin/env node
// Native-only exact-pass pixel regression, not a production timing benchmark.
// Run: node tools/late-fx-matrix.browser.selftest.mjs [--out=/absolute/new-directory]
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';
import { createCaptureLock } from './capture-lock.mjs';
import { nativeBrowserLaunchOptions, verifyNativeBrowserLaunch } from './native-browser-launch.mjs';

const rootDir = fileURLToPath(new URL('../', import.meta.url));

function sourceHash() {
  const hash = createHash('sha256');
  for (const file of [
    './late-fx-matrix.browser.selftest.mjs', './late-fx-matrix.browser.fixture.mjs',
    '../src/engine/post.ts', '../src/engine/sceneSourcePass.ts',
    '../src/engine/lateFxSceneView.ts',
    '../src/engine/resolvedDepthCopy.ts', '../src/fx/layers.ts', '../package-lock.json',
  ]) {
    hash.update(file); hash.update('\0');
    hash.update(readFileSync(new URL(file, import.meta.url))); hash.update('\0');
  }
  return hash.digest('hex');
}

function outputDirectory(args) {
  if (args.length === 0) return null;
  let value;
  if (args.length === 1 && args[0].startsWith('--out=')) value = args[0].slice(6);
  else if (args.length === 2 && args[0] === '--out') value = args[1];
  else throw new Error('Usage: node tools/late-fx-matrix.browser.selftest.mjs [--out=/absolute/new-directory]');
  assert.ok(value && isAbsolute(value), '--out must name an absolute, new directory');
  const directory = resolve(value);
  // Deliberately reject an existing directory; evidence is never overwritten.
  mkdirSync(directory);
  return directory;
}

async function bounded(promise, timeoutMs, label) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
    })]);
  } finally { clearTimeout(timer); }
}

async function closeBrowser(browser) {
  try { await bounded(browser.close(), 15_000, 'owned browser close'); }
  catch (error) {
    const child = browser.process();
    if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    throw error;
  }
}

async function runFixture(page, report) {
  report.fixture = await bounded(page.evaluate(async () => {
    const { installLateFxMatrixFixture } = await import('/tools/late-fx-matrix.browser.fixture.mjs');
    const fixture = installLateFxMatrixFixture();
    window.__LATE_FX_MATRIX_TEST = fixture;
    const result = fixture.run();
    return fixture.report ?? result;
  }), 60_000, 'native late-FX matrix fixture');
  assert.ok(report.fixture && typeof report.fixture === 'object', 'fixture must publish its native receipt');
  assert.equal(report.fixture.ok, true, 'all native matrix/pose/depth assertions must pass');
  assert.equal(report.fixture.cases.length, 12, 'both MSAA and AO modes require three successive frames');
  for (const row of report.fixture.cases) {
    assert.equal(row.referenceRenderScene, 'original', 'reference must exercise exact callback fallback');
    assert.equal(row.candidateRenderScene, 'retained-view', 'candidate must exercise scene-state isolation');
    assert.equal(row.referenceCallbackCalls, 1);
    assert.equal(row.candidateCallbackCalls, 0);
    assert.equal(row.directDrawObserverRestored, true);
  }
}

async function captureCanvas(page, directory, report) {
  const canvases = await page.$$('canvas');
  let visible = null;
  try {
    for (const canvas of canvases) {
      const bounds = await canvas.boundingBox();
      if (bounds && bounds.width > 0 && bounds.height > 0) { visible = canvas; break; }
    }
    assert.ok(visible, 'fixture must leave a visible canvas for the final screenshot');
    const png = await bounded(visible.screenshot({ type: 'png' }), 15_000, 'final fixture canvas screenshot');
    const path = join(directory, 'canvas.png');
    writeFileSync(path, png, { flag: 'wx' });
    report.artifacts.canvas = { path, bytes: png.length, sha256: createHash('sha256').update(png).digest('hex') };
  } finally {
    await Promise.all(canvases.map(canvas => canvas.dispose()));
  }
}

const lock = createCaptureLock();
const report = { protocol: 'late-fx-matrix-and-scene-view-native-v2', ok: false, sourceHash: null,
  fixture: null, artifacts: {}, errors: [], browserClosed: false, serverClosed: false, lockReleased: false };
let server, browser, page, refresh, outDir;
try {
  outDir = outputDirectory(process.argv.slice(2));
  report.sourceHash = sourceHash();
  await lock.acquire(45 * 60_000);
  refresh = setInterval(() => lock.refresh(), 30_000); refresh.unref();
  server = await createServer({ root: rootDir, logLevel: 'error',
    server: { host: '127.0.0.1', port: 0, hmr: false, watch: null },
    // Own the test document before public application route rewriting.
    plugins: [{ name: 'late-fx-matrix-fixture', enforce: 'pre', configureServer(instance) {
      instance.middlewares.use((request, response, next) => {
        if (request.url !== '/__late_fx_matrix_fixture') return next();
        response.setHeader('Content-Type', 'text/html');
        response.end('<!doctype html><html><head><link rel="icon" href="data:,"></head><body data-late-fx-matrix-fixture="1"></body></html>');
      });
    } }],
  });
  await server.listen();
  browser = await puppeteer.launch(nativeBrowserLaunchOptions({ headless: 'new',
    timeout: 30_000, protocolTimeout: 60_000,
    args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'] }));
  report.launch = verifyNativeBrowserLaunch(browser);
  report.browserVersion = await browser.version();
  page = await browser.newPage();
  page.on('pageerror', error => { if (report.errors.length < 12) report.errors.push(String(error)); });
  page.on('console', message => {
    if (message.type() === 'error' && report.errors.length < 12) report.errors.push(message.text());
  });
  const navigation = await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__late_fx_matrix_fixture`,
    { waitUntil: 'domcontentloaded', timeout: 30_000 });
  report.documentStatus = navigation?.status();
  assert.equal(report.documentStatus, 200, 'owned native fixture must be served successfully');
  assert.equal(await page.evaluate(() => document.body.dataset.lateFxMatrixFixture), '1',
    'native gate must run on its own fixture, not an application fallback document');
  await runFixture(page, report);
  if (outDir) await captureCanvas(page, outDir, report);
  assert.equal(sourceHash(), report.sourceHash, 'source changed during native acquisition');
  assert.deepEqual(report.errors, []);
} catch (error) {
  report.errors.push(String(error));
} finally {
  if (page) {
    try {
      report.fixture = await bounded(page.evaluate(() => {
        const fixture = window.__LATE_FX_MATRIX_TEST;
        fixture?.dispose(); return fixture?.report ?? null;
      }), 5000, 'fixture cleanup');
    } catch (error) { report.errors.push(String(error)); }
  }
  if (browser) {
    try { await closeBrowser(browser); report.browserClosed = true; }
    catch (error) { report.errors.push(String(error)); }
  }
  if (server) {
    try { await bounded(server.close(), 10_000, 'owned Vite close'); report.serverClosed = true; }
    catch (error) { report.errors.push(String(error)); }
  }
  clearInterval(refresh);
  try { lock.release(); report.lockReleased = true; }
  catch (error) { report.errors.push(String(error)); }
}
report.ok = report.errors.length === 0 && report.fixture?.ok === true && report.fixture?.disposed === true
  && report.browserClosed && report.serverClosed && report.lockReleased;
if (outDir) {
  try {
    report.artifacts.report = join(outDir, 'report.json');
    writeFileSync(report.artifacts.report, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  } catch (error) { report.errors.push(String(error)); report.ok = false; }
}
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;
