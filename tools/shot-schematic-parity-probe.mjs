// Native exact-pixel regression. Owns an ordinary FIFO lease, Vite source-fixture
// server and one fresh Chromium process. This is NOT a timing certification.
// node tools/shot-schematic-parity-probe.mjs --out=/absolute/new-directory [--port=5944]
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { createCaptureLock } from './capture-lock.mjs';

const option = (name, fallback = '') => process.argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const output = option('out'), port = Number(option('port', '5944'));
if (!output || !Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Require --out=/absolute/new-directory and valid --port');
const out = resolve(output), lock = createCaptureLock();
await mkdir(out); // preserve failed runs, never overwrite their receipt
const paths = ['src/ui/shotSchematic.ts', 'src/ui/shotSchematicClient.ts', 'src/ui/shotSchematicWorker.ts',
  'src/ui/shotSchematicReference.test.ts', 'src/ui/shotSchematicBrowser.test.ts', 'tools/shot-schematic-parity-probe.mjs',
  'public/brand/favicon.svg'];
const manifest = async () => Object.fromEntries(await Promise.all(paths.map(async path => [path,
  createHash('sha256').update(await readFile(path)).digest('hex')])));
const report = { schemaVersion: 1, protocol: 'shot-schematic-native-pixel-parity-v1',
  scope: 'exact decoded RGBA on native Chromium; source-module fixture, not game performance certification',
  startedAt: new Date().toISOString(), source: await manifest(), errors: [], cleanupErrors: [],
  failedResponses: [], failedResponsesDropped: 0, pass: false };
let server, browser, cacheDir, heartbeat, leased = false, interrupted = null;
let closingBrowser;
async function withinDeadline(work, ms, label) {
  let timer;
  try {
    return await Promise.race([work, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} deadline exceeded`)), ms);
    })]);
  } finally { clearTimeout(timer); }
}
async function drainBrowser() {
  const child = browser.process();
  const exited = child && child.exitCode == null && child.signalCode == null
    ? new Promise(resolveExit => child.once('exit', resolveExit)) : Promise.resolve();
  try { await withinDeadline(browser.close(), 5000, 'Browser close'); }
  catch (error) {
    report.cleanupErrors.push(String(error));
    if (child && child.exitCode == null && child.signalCode == null) child.kill('SIGKILL');
  }
  try { await withinDeadline(exited, 5000, 'Owned browser exit'); }
  catch (error) { report.cleanupErrors.push(String(error)); }
}
const closeBrowser = () => {
  if (!browser) return Promise.resolve();
  closingBrowser ??= drainBrowser().catch(error => report.cleanupErrors.push(String(error)));
  return closingBrowser;
};
let rejectInterrupted;
const interruption = new Promise((_, reject) => { rejectInterrupted = reject; });
void interruption.catch(() => {});
const interrupt = signal => {
  interrupted ||= signal;
  rejectInterrupted(new Error(interrupted));
  void closeBrowser();
};
const onInt = () => interrupt('SIGINT'), onTerm = () => interrupt('SIGTERM');
process.on('SIGINT', onInt); process.on('SIGTERM', onTerm);
const active = () => { if (interrupted) throw new Error(interrupted); };
try {
  // The maintained FIFO has no cancellation method. Do not alter its files or
  // release another owner's lock. On queued interruption this CLI exits after
  // writing its receipt, so its pending acquire cannot subsequently run. The
  // unchanged FIFO reaps that dead PID's ticket on its next queue scan.
  const acquisition = lock.acquire(30 * 60 * 1000).then(() => {
    leased = true;
    if (interrupted) lock.release(); // Admission racing with our signal is ours.
  });
  await Promise.race([acquisition, interruption]); active();
  heartbeat = setInterval(() => lock.refresh(), 30_000); heartbeat.unref();
  cacheDir = await mkdtemp(join(tmpdir(), 'cot-schematic-vite-'));
  report.optimizerCache = { path: cacheDir, private: true, noDiscovery: true, removed: false };
  active();
  server = await createServer({ cacheDir, optimizeDeps: { noDiscovery: true },
    server: { host: '127.0.0.1', port, strictPort: true },
    plugins: [{ name: 'shot-schematic-test-only', enforce: 'pre', configureServer(vite) {
      vite.middlewares.use('/__shot-schematic-test__', (_request, response) => {
        response.statusCode = 200;
        response.setHeader('Content-Type', 'text/html');
        response.setHeader('X-Cot-Probe', report.protocol);
        response.end('<!doctype html><html><head><title>Schematic parity</title><link rel="icon" type="image/svg+xml" href="/brand/favicon.svg"></head><body><script type="module">import {runSchematicParity} from "/src/ui/shotSchematicBrowser.test.ts"; window.runSchematicParity=runSchematicParity;</script></body></html>');
      });
    } }] }); active();
  await server.listen(); active();
  browser = await puppeteer.launch({ headless: 'new', handleSIGINT: false, handleSIGTERM: false,
    timeout: 30_000, protocolTimeout: 65_000,
    args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'] }); active();
  report.browser = { version: await browser.version(), pid: browser.process()?.pid };
  const page = await browser.newPage(); page.setDefaultTimeout(60_000);
  page.on('pageerror', error => report.errors.push(String(error)));
  page.on('console', entry => { if (entry.type() === 'error') report.errors.push(entry.text()); });
  page.on('response', response => {
    const status = response.status();
    if (status < 400) return;
    if (report.failedResponses.length >= 64) { report.failedResponsesDropped++; return; }
    const url = response.url();
    report.failedResponses.push({ status, url: url.slice(0, 2048), urlTruncated: url.length > 2048 });
  });
  const navigation = await page.goto(`http://127.0.0.1:${port}/__shot-schematic-test__`, { waitUntil: 'domcontentloaded' });
  report.fixtureResponse = { status: navigation?.status() ?? null,
    marker: navigation?.headers()['x-cot-probe'] ?? null };
  if (report.fixtureResponse.status !== 200 || report.fixtureResponse.marker !== report.protocol) {
    throw new Error(`Unexpected schematic fixture response: ${JSON.stringify(report.fixtureResponse)}`);
  }
  await page.waitForFunction(() => typeof window.runSchematicParity === 'function'); active();
  report.gpu = await page.evaluate(() => {
    const canvas = document.createElement('canvas'), gl = canvas.getContext('webgl2');
    if (!gl) return null;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null;
    gl.getExtension('WEBGL_lose_context')?.loseContext(); return name;
  });
  if (!report.gpu || /swiftshader|llvmpipe|software/i.test(report.gpu)) throw new Error('Native GPU unavailable');
  report.result = await withinDeadline(page.evaluate(async () => {
    let timer;
    try {
      return await Promise.race([window.runSchematicParity(), new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Schematic parity deadline exceeded')), 60_000);
      })]);
    } finally { clearTimeout(timer); }
  }), 60_000, 'Node schematic parity');
  active(); report.pass = report.result.pass && report.errors.length === 0;
} catch (error) { report.errors.push(String(error)); }
finally {
  await closeBrowser();
  if (server) {
    try {
      server.httpServer?.closeAllConnections();
      await withinDeadline(server.close(), 10_000, 'Vite close');
    } catch (error) { report.cleanupErrors.push(String(error)); }
  }
  if (cacheDir) {
    try { await rm(cacheDir, { recursive: true, force: true }); report.optimizerCache.removed = true; }
    catch (error) { report.cleanupErrors.push(String(error)); }
  }
  clearInterval(heartbeat);
  if (leased) lock.release();
  process.off('SIGINT', onInt); process.off('SIGTERM', onTerm);
  report.interrupted = interrupted;
  report.capture = { acquired: leased, releaseAttempted: leased,
    queuedCancellation: interrupted && !leased ? 'Process exits; maintained FIFO reaps its dead PID ticket' : null };
  report.sourceAfter = await manifest();
  report.sourceUnchanged = JSON.stringify(report.source) === JSON.stringify(report.sourceAfter);
  report.pass &&= report.sourceUnchanged && report.cleanupErrors.length === 0 && !interrupted;
  report.completedAt = new Date().toISOString();
  await writeFile(resolve(out, 'receipt.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
}
console.log(JSON.stringify({ pass: report.pass, cases: report.result?.rows.length ?? 0, receipt: resolve(out, 'receipt.json'), errors: report.errors }));
if (!report.pass) process.exitCode = interrupted === 'SIGINT' ? 130 : interrupted === 'SIGTERM' ? 143 : 1;
// Only interruption uses explicit exit, after browser/server/cache/receipt
// cleanup. In particular, do not leave a live unresolved FIFO waiter behind.
if (interrupted) process.exit(process.exitCode);
