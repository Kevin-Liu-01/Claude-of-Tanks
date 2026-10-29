#!/usr/bin/env node
// What a document can load again after the network drops and comes back (the loading states 264, Main's ruling on the
// garage lane's finding): a failed import(), a failed modulepreload and a failed stylesheet link, each tried again once
// online in the same document, then after a reload. Copyright © 2026 Kevin B. Liu.
// Run: node tools/offline-import-probe.mjs [--chrome=/path/to/chrome] [--out=/absolute/report.json]
// A capture-lock render ticket (no timing is measured); the browser is the installed Chrome unless --chrome names one.
import { createServer } from 'node:http';
import { writeFileSync } from 'node:fs';
import puppeteer from 'puppeteer';
import { launchGuardedBrowser } from './browser-launch.mjs';
import { createCaptureLock } from './capture-lock.mjs';
import { nativeBrowserLaunchOptions } from './native-browser-launch.mjs';

const FILES = {
  '/index.html': ['text/html', '<!doctype html><html><head><link rel="icon" href="data:,"></head><body></body></html>'],
  '/a.js': ['text/javascript', 'export const a = 1;'],
  '/shared.js': ['text/javascript', 'export const s = 1;'],
  // importers of /shared.js, never tried before the network comes back
  '/b.js': ['text/javascript', "import { s } from '/shared.js'; export const b = s;"],
  '/c.js': ['text/javascript', "import { s } from '/shared.js'; export const c = s;"],
  '/style.css': ['text/css', 'body{--probe:loaded}'],
};
const server = createServer((request, response) => {
  const file = FILES[new URL(request.url, 'http://x').pathname];
  if (!file) { response.writeHead(404); response.end(); return; }
  response.writeHead(200, { 'Content-Type': file[0], 'Cache-Control': 'no-store' });
  response.end(file[1]);
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;

const lock = createCaptureLock();
const report = { chrome: null, steps: [] };
let browser;
try {
  await lock.acquire(45 * 60_000, { lockClass: 'render' });
  browser = await launchGuardedBrowser(puppeteer, nativeBrowserLaunchOptions({ headless: 'new',
    executablePath: process.argv.find((arg) => arg.startsWith('--chrome='))?.slice(9)
      ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--disable-gpu'] }),
  { label: 'offline-import-probe' });
  report.chrome = await browser.version();
  const page = await browser.newPage();
  const cdp = await page.createCDPSession();
  await cdp.send('Network.enable');
  const network = (offline) => cdp.send('Network.emulateNetworkConditions',
    { offline, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await page.goto(`${origin}/index.html`);
  /** Run `code` in the page: 'ok' or the error's message. */
  const tryIn = (label, code) => page.evaluate(async (source) => {
    try { await (0, eval)(source); return 'ok'; } catch (error) { return `failed: ${error?.message ?? error}`; }
  }, code).then((result) => { report.steps.push({ label, result }); });
  const link = (rel, href) => `new Promise((done, fail) => { const l = document.createElement('link'); l.rel = '${rel}';
    l.href = '${href}'; l.onload = done; l.onerror = () => fail(new Error('link error')); document.head.append(l); })`;

  await network(true);
  await tryIn('offline: import(/a.js)', "import('/a.js')");
  await tryIn('offline: modulepreload /shared.js', link('modulepreload', '/shared.js'));
  await tryIn('offline: stylesheet /style.css', link('stylesheet', '/style.css'));
  await network(false);
  await tryIn('online: import(/a.js) again', "import('/a.js')");
  await tryIn('online: import(/a.js?bust=1), a fresh query', "import('/a.js?bust=1')");
  await tryIn('online: import(/b.js), never tried, imports the preloaded /shared.js', "import('/b.js')");
  await tryIn('online: import(/c.js?bust=1), a fresh query of another importer', "import('/c.js?bust=1')");
  await tryIn('online: import(/shared.js) itself', "import('/shared.js')");
  await tryIn('online: the failed stylesheet link still stands (as Vite\'s preload sees it)',
    "document.querySelector('link[rel=stylesheet][href=\"/style.css\"]') ? 0 : Promise.reject(new Error('gone'))");
  await tryIn('online: its sheet applies', "getComputedStyle(document.body).getPropertyValue('--probe').trim() === 'loaded' ? 0 : Promise.reject(new Error('not applied'))");
  await page.reload();
  await tryIn('after a reload: import(/a.js)', "import('/a.js')");
  await tryIn('after a reload: import(/b.js)', "import('/b.js')");
  await page.close();
} finally {
  if (browser) await browser.close();
  lock.release();
  server.close();
}
const out = process.argv.find((arg) => arg.startsWith('--out='))?.slice(6);
if (out) writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
console.log(`offline-import-probe on ${report.chrome}`);
for (const step of report.steps) console.log(`  ${step.label}: ${step.result}`);
