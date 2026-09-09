#!/usr/bin/env node
// Native-only focused regression. Run: node tools/resolved-depth-copy.browser.selftest.mjs
// This is a source/pinned-Three pixel gate, not a production loading benchmark.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';
import { createCaptureLock } from './capture-lock.mjs';
import { nativeBrowserLaunchOptions, verifyNativeBrowserLaunch } from './native-browser-launch.mjs';

function sourceHash() {
  const hash = createHash('sha256');
  for (const file of ['./resolved-depth-copy.browser.selftest.mjs', './resolved-depth-copy.browser.fixture.mjs',
    '../src/engine/resolvedDepthCopy.ts', '../package-lock.json']) hash.update(readFileSync(new URL(file, import.meta.url)));
  return hash.digest('hex');
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
  await bounded(page.evaluate(async () => {
    const { installDepthCopyFixture } = await import('/tools/resolved-depth-copy.browser.fixture.mjs');
    window.__DEPTH_COPY_TEST = installDepthCopyFixture();
    window.__DEPTH_COPY_TEST.initial();
  }), 60_000, 'native initial matrix');
  await page.evaluate(() => window.__DEPTH_COPY_TEST.lose());
  await page.waitForFunction(() => window.__DEPTH_COPY_TEST.report.lost, { timeout: 5000 });
  // Never screenshot or ask the lost device to render. Restore from a new task.
  await page.evaluate(() => window.__DEPTH_COPY_TEST.restore());
  await page.waitForFunction(() => window.__DEPTH_COPY_TEST.report.restored, { timeout: 12_000 });
  await bounded(page.evaluate(() => window.__DEPTH_COPY_TEST.afterRestore()), 30_000, 'restored matrix');
  report.fixture = await page.evaluate(() => window.__DEPTH_COPY_TEST.report);
  assert.equal(report.fixture.cases.length, 12);
  assert.equal(report.fixture.lost && report.fixture.restored, true);
}

const lock = createCaptureLock();
const report = { protocol: 'resolved-depth-copy-native-v1', ok: false, sourceHash: sourceHash(),
  fixture: null, errors: [], browserClosed: false, serverClosed: false, lockReleased: false };
let server, browser, page, refresh;
try {
  await lock.acquire(45 * 60_000);
  refresh = setInterval(() => lock.refresh(), 30_000); refresh.unref();
  server = await createServer({ root: process.cwd(), logLevel: 'error',
    server: { host: '127.0.0.1', port: 0, hmr: false, watch: null },
    // Serve the owned fixture before application route rewriting can turn this
    // deliberately private test URL into the public not-found document.
    plugins: [{ name: 'resolved-depth-copy-fixture', enforce: 'pre', configureServer(instance) {
      instance.middlewares.use((request, response, next) => {
        if (request.url !== '/__depth_copy_fixture') return next();
        response.setHeader('Content-Type', 'text/html');
        response.end('<!doctype html><html><head><link rel="icon" href="data:,"></head><body data-depth-copy-fixture="1"></body></html>');
      });
    } }],
  });
  await server.listen();
  browser = await puppeteer.launch(nativeBrowserLaunchOptions({ headless: 'new',
    timeout: 30_000, protocolTimeout: 30_000,
    args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'] }));
  report.launch = verifyNativeBrowserLaunch(browser);
  report.browserVersion = await browser.version();
  page = await browser.newPage();
  page.on('pageerror', error => { if (report.errors.length < 12) report.errors.push(String(error)); });
  page.on('console', message => {
    if (message.type() === 'error' && report.errors.length < 12) report.errors.push(message.text());
  });
  const navigation = await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__depth_copy_fixture`,
    { waitUntil: 'domcontentloaded', timeout: 30_000 });
  report.documentStatus = navigation?.status();
  assert.equal(report.documentStatus, 200, 'owned native fixture must be served successfully');
  assert.equal(await page.evaluate(() => document.body.dataset.depthCopyFixture), '1',
    'native gate must run on its own fixture, not an application fallback document');
  await runFixture(page, report);
  assert.equal(sourceHash(), report.sourceHash, 'source changed during native acquisition');
  assert.deepEqual(report.errors, []);
} catch (error) {
  report.errors.push(String(error));
} finally {
  if (page) {
    try {
      report.fixture = await bounded(page.evaluate(() => {
        const fixture = window.__DEPTH_COPY_TEST;
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
  clearInterval(refresh); lock.release(); report.lockReleased = true;
}
report.ok = report.errors.length === 0 && report.fixture?.disposed === true
  && report.browserClosed && report.serverClosed && report.lockReleased;
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;
