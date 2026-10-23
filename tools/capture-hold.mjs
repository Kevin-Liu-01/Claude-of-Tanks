// One GPU capture hold that serves shots only (2026-10-22, item 240).
//
// Holds were spent loading pages: at load 200-600 a Studio map took 1-9 min to come up inside the hold and its shots
// 2-5 s each (world-polish 2026-10-22: three maps' loads were 1,070 s of a 1,142 s hold, then the hold cap), and a
// hero-card hold spent 70-143 s of 103-212 s starting vite, Chrome and the page. runWarmHold moves that work into the
// queue wait: `warm` runs while the ticket waits in its place (acquire's `prepare`), its pages are frozen once warm
// (Page.setWebLifecycleState: no frames are drawn during other lanes' holds), and the hold thaws them and runs `shoot`.
//
//   import { runWarmHold, startViteChild, warmPage } from '../tools/capture-hold.mjs';
//   await runWarmHold({
//     label: 'my-lane',
//     place: 'my-lane-item',                      // a killed run rejoins at its first stamp
//     warm: async () => {                         // outside the lock: servers, browser, every page loaded to ready
//       const server = await startViteChild({ root, mode: 'preview' });   // a built dist: no transforms at load
//       const browser = await puppeteer.launch({ headless: 'new', protocolTimeout: 600_000, timeout: 180_000 });
//       const page = await warmPage(browser, `${server.url}/?studio=1&map=verdant`, { ready: 'window.__STUDIO?.ready' });
//       return { pages: [page], page, close: async () => { await browser.close(); await server.close(); } };
//     },
//     shoot: async ({ page, signal }) => { /* shots only; stop when signal.aborted */ },
//   });
//
// The hold's own limit (`holdMinutes`, default 18) starts when the lock is taken: at the limit `signal` aborts, and a
// shoot still running after `graceSeconds` has its warm resources closed (the browser stops drawing) before the lock is
// released. The wait (`waitHours`) is the queue's, never the hold's: do not wrap the process in a short alarm.
import { spawn } from 'node:child_process';
import { constants } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createCaptureLock } from './capture-lock.mjs';

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/** Freeze a puppeteer page: no tasks, timers or frames run until thawPage (Chrome's page lifecycle "frozen"). */
export async function freezePage(page) {
  const session = await page.createCDPSession();
  await session.send('Page.setWebLifecycleState', { state: 'frozen' });
  return session;
}

/** Thaw a frozen page and make it visible again: a frozen page comes back hidden, and a hidden page draws no frames. */
export async function thawPage(page, session) {
  const cdp = session ?? await page.createCDPSession();
  await cdp.send('Page.setWebLifecycleState', { state: 'active' });
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await page.bringToFront();
}

/**
 * A Vite server in a child process (tools/vite-child.mjs): an in-process server's transforms block the event loop, and
 * with it the lock's heartbeats. `mode: 'preview'` serves the built `outDir` (default dist) through the project's
 * config — no transforms, the fastest page loads — and `mode: 'dev'` serves the sources; `config` replaces the inline
 * Vite config whole (e.g. `configFile: false` and a private `cacheDir`). The child exits with its parent. Resolves
 * { url, child, close } once it serves.
 */
export function startViteChild({ root = process.cwd(), mode = 'preview', outDir = 'dist', port = 5600 + (process.pid % 300),
  config = null, timeoutMs = 300_000, env = process.env } = {}) {
  const inline = config ?? (mode === 'preview'
    ? { root, logLevel: 'error', build: { outDir }, preview: { host: '127.0.0.1', port, strictPort: false } }
    : { root, logLevel: 'error', server: { host: '127.0.0.1', port, strictPort: false, hmr: false, watch: null } });
  const entry = fileURLToPath(new URL('./vite-child.mjs', import.meta.url));
  const child = spawn(process.execPath, [entry, JSON.stringify({ mode, config: inline })], { cwd: root, env, stdio: ['pipe', 'pipe', 'pipe'] });
  let output = '';
  return new Promise((resolveServer, rejectServer) => {
    const timer = setTimeout(() => { child.kill('SIGTERM'); rejectServer(new Error(`vite ${mode}: not serving after ${timeoutMs} ms\n${output.slice(-2000)}`)); }, timeoutMs);
    const read = (chunk) => {
      output += chunk;
      const match = output.match(/cot-vite-child ready (http:\/\/127\.0\.0\.1:\d+)\//);
      if (!match) return;
      clearTimeout(timer);
      const close = () => new Promise((done) => {
        if (child.exitCode !== null || child.signalCode) { done(); return; }
        child.once('exit', () => done());
        child.kill('SIGTERM');
        setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* gone */ } }, 10_000).unref();
      });
      resolveServer({ url: match[1], child, close });
    };
    child.stdout.setEncoding('utf8').on('data', read);
    child.stderr.setEncoding('utf8').on('data', (chunk) => { output += chunk; });
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      rejectServer(new Error(`vite ${mode} exited ${code ?? signal} before serving\n${output.slice(-2000)}`));
    });
  });
}

/**
 * Open `url` in a new page of `browser` and wait for `ready` (a page expression), every image loaded eagerly and the
 * fonts. Each wait is bounded and named; a lazy image would never decode (studio-recorder-lazy-decode-hang).
 */
export async function warmPage(browser, url, { ready, navTimeoutMs = 600_000, readyTimeoutMs = 900_000, viewport = null } = {}) {
  const page = await browser.newPage();
  if (viewport) await page.setViewport(viewport);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: navTimeoutMs });
  if (ready) await page.waitForFunction(ready, { timeout: readyTimeoutMs, polling: 1000 });
  await page.evaluate(async () => {
    const images = [...document.images];
    for (const image of images) image.loading = 'eager';
    const bounded = (promise, ms) => Promise.race([promise, new Promise((done) => setTimeout(done, ms))]);
    await bounded(Promise.all(images.map((image) => image.decode().catch(() => {}))), 30_000);
    await bounded(document.fonts?.ready ?? Promise.resolve(), 15_000);
  });
  return page;
}

async function closeWarm(warmed, say) {
  if (typeof warmed?.close !== 'function') return;
  try { await warmed.close(); } catch (error) { say(`closing the warm resources failed: ${error?.message ?? error}`); }
}

/**
 * Warm while queued, hold for the shots only. Returns shoot's result. `warm()` returns anything; its `pages` (puppeteer
 * pages) are frozen once warm and thawed when the hold starts, and its `close()` runs after the hold (or after a failed
 * wait). `shoot({ ...warmed, signal, heldAt })` runs inside the hold. A `warm` that throws closes what it opened itself.
 * `place` (a job key) or `ticket` (a stamped ticket, capture-lock ticketAt) keeps a queue place across runs.
 */
export async function runWarmHold({ label = 'capture', warm, shoot, holdMinutes = 18, graceSeconds = 60, waitHours = 4,
  place = null, ticket = null, lock = createCaptureLock(), log = console.log, freeze = freezePage, thaw = thawPage } = {}) {
  if (typeof warm !== 'function' || typeof shoot !== 'function') throw new Error('runWarmHold needs warm() and shoot()');
  const say = (message) => log(`[${label} ${new Date().toISOString().slice(11, 19)}] ${message}`);
  const queuedAt = Date.now();
  const sessions = new Map();
  let warmed, current = null;
  // A signal ends the run cleanly: puppeteer's own SIGTERM handler closes the browser but leaves the process waiting in
  // the queue (2026-10-22), so release, close and exit here.
  const onSignal = async (signal) => {
    say(`${signal}: releasing the lock and closing`);
    lock.release();
    await closeWarm(current, say);
    process.exit(128 + (constants.signals[signal] ?? 15));
  };
  const SIGNALS = ['SIGTERM', 'SIGINT', 'SIGHUP'];
  for (const signal of SIGNALS) process.once(signal, onSignal);
  say('queued; warms once near the head of the queue');
  try {
    warmed = await lock.acquire(waitHours * 3600 * 1000, {
      place,
      ticket,
      prepare: async () => {
        const result = await warm();
        current = result;
        try {
          for (const page of result?.pages ?? []) sessions.set(page, await freeze(page));
        } catch (error) {
          await closeWarm(result, say);
          throw error;
        }
        say(`warm in ${((Date.now() - queuedAt) / 1000).toFixed(0)} s (${sessions.size} page(s) frozen); waiting for the lock`);
        return result;
      },
    });
  } catch (error) {
    for (const signal of SIGNALS) process.removeListener(signal, onSignal);
    await closeWarm(error?.prepared, say);
    throw error;
  }
  const heldAt = Date.now();
  say(`lock held after ${((heldAt - queuedAt) / 60_000).toFixed(1)} min in the queue`);
  const release = () => lock.release();
  process.once('exit', release);
  const refresher = setInterval(() => lock.refresh(), 30_000);
  refresher.unref();
  const controller = new AbortController();
  const alarm = setTimeout(() => {
    say(`hold limit: ${holdMinutes} min; asking shoot to stop`);
    controller.abort(new Error(`hold limit ${holdMinutes} min`));
  }, holdMinutes * 60 * 1000);
  let closed = false;
  try {
    for (const [page, session] of sessions) await thaw(page, session);
    const shooting = Promise.resolve().then(() => shoot({ ...warmed, signal: controller.signal, heldAt }));
    // Past the limit and the grace, the browser is closed so nothing draws after the lock is gone.
    const stopped = new Promise((done) => controller.signal.addEventListener('abort', done, { once: true }))
      .then(() => sleep(graceSeconds * 1000)).then(() => 'grace');
    const outcome = await Promise.race([shooting.then(() => 'done', () => 'done'), stopped]);
    if (outcome === 'grace') {
      say(`shoot still running ${graceSeconds} s past the limit: closing its browser before the release`);
      closed = true;
      await closeWarm(warmed, say);
    }
    return await shooting;
  } finally {
    clearTimeout(alarm);
    clearInterval(refresher);
    process.removeListener('exit', release);
    for (const signal of SIGNALS) process.removeListener(signal, onSignal);
    // Nothing draws after the release: the pages are frozen again (the browser closes after it).
    if (!closed) for (const page of sessions.keys()) { try { await freeze(page); } catch { /* closed or crashed */ } }
    lock.release();
    say(`released after ${((Date.now() - heldAt) / 1000).toFixed(0)} s`);
    if (!closed) await closeWarm(warmed, say);
  }
}
