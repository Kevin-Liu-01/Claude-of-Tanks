// Boot-time attribution probe (perf engineer tooling).
// Usage: node tools/bootprobe.mjs [--dsf 2]
// Starts vite, loads the game with the V8 sampling profiler attached, waits
// for __GAME_READY, and prints the top self-time functions plus the
// loadToReady total — so load-time regressions can be attributed to a module
// instead of guessed at. Complements perfprobe.mjs (steady-state frames).

import { createServer } from 'vite';
import puppeteer from 'puppeteer';

const args = process.argv.slice(2);
function opt(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
}
const dsf = parseFloat(opt('dsf', '2'));

const port = 5900 + Math.floor(Math.random() * 90);
const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { port, strictPort: false } });
await server.listen();
const url = `http://localhost:${server.config.server.port}/`;

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: dsf });
await page.evaluateOnNewDocument(() => {
  window.__READY_AT = -1;
  const iv = setInterval(() => {
    if (window.__GAME_READY === true) { window.__READY_AT = performance.now(); clearInterval(iv); }
  }, 25);
});

const cdp = await page.createCDPSession();
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 250 }); // µs
await cdp.send('Profiler.start');

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForFunction('window.__GAME_READY === true', { timeout: 90000 });
const loadToReadyMs = await page.evaluate(() => window.__READY_AT);
const { profile } = await cdp.send('Profiler.stop');

// Aggregate self time per function (sampling profile: hit counts x interval).
const nodesById = new Map(profile.nodes.map((n) => [n.id, n]));
const selfUs = new Map();
for (const n of profile.nodes) {
  const f = n.callFrame;
  const key = `${f.functionName || '(anonymous)'} @ ${f.url.replace(/^.*\/(src|node_modules)\//, '$1/').split('?')[0]}:${f.lineNumber + 1}`;
  selfUs.set(key, (selfUs.get(key) || 0) + (n.hitCount || 0));
}
const totalHits = [...selfUs.values()].reduce((a, b) => a + b, 0);
const intervalUs = profile.endTime && profile.startTime && totalHits
  ? (profile.endTime - profile.startTime) / totalHits
  : 250;
const rows = [...selfUs.entries()]
  .map(([k, hits]) => ({ fn: k, ms: (hits * intervalUs) / 1000 }))
  .sort((a, b) => b.ms - a.ms)
  .slice(0, 30);

console.log(JSON.stringify({ dsf, loadToReadyMs: Math.round(loadToReadyMs), top: rows.map((r) => `${r.ms.toFixed(0)}ms ${r.fn}`) }, null, 2));

await browser.close();
await server.close();
