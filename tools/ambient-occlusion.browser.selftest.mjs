#!/usr/bin/env node
// Source-pinned native pixel regression; no game quality or capture overrides.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';
import { createCaptureLock } from './capture-lock.mjs';
import { nativeBrowserLaunchOptions, verifyNativeBrowserLaunch } from './native-browser-launch.mjs';

function sourceHash() {
  const hash = createHash('sha256');
  for (const file of ['./ambient-occlusion.browser.selftest.mjs', './ambient-occlusion.browser.fixture.mjs',
    '../src/engine/ambientOcclusionFilter.ts', '../package-lock.json']) hash.update(readFileSync(new URL(file, import.meta.url)));
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
    plugins: [{ name: 'ambient-occlusion-fixture', enforce: 'pre', configureServer(instance) {
      instance.middlewares.use((request, response, next) => {
        if (request.url !== '/__ambient_occlusion_fixture') return next();
        response.setHeader('Content-Type', 'text/html');
        response.end('<!doctype html><html><head><link rel="icon" href="data:,"></head><body data-ao-fixture="1"></body></html>');
      });
    } }],
  });
  await server.listen();
  browser = await puppeteer.launch(nativeBrowserLaunchOptions({ headless: 'new',
    timeout: 30_000, protocolTimeout: 60_000,
    args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'] }));
  report.launch = verifyNativeBrowserLaunch(browser);
  const page = await browser.newPage();
  page.on('pageerror', error => report.errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
  const response = await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__ambient_occlusion_fixture`, { waitUntil: 'domcontentloaded' });
  assert.equal(response.status(), 200);
  assert.equal(await page.evaluate(() => document.body.dataset.aoFixture), '1');
  report.fixture = await bounded(page.evaluate(async () => {
    const { checkAmbientOcclusion } = await import('/tools/ambient-occlusion.browser.fixture.mjs');
    return checkAmbientOcclusion();
  }), 60_000, 'AO pixel regression');
  assert.equal(sourceHash(), report.sourceHash, 'source changed during acquisition');
  assert.equal(report.fixture.cases.length, 7);
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
