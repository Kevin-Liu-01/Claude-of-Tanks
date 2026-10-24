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
//
// Frozen pages that reload (2026-10-23, world-polish and maps lanes): a page on a Vite dev server keeps the Vite client's
// HMR socket. When that socket closed (another lane's server on the same port, or a re-bundle broadcast during a ~50-min
// freeze) the client reloaded the page at thaw ("Execution context was destroyed") and the hold shot nothing. Now:
// warmPage stubs the socket (stubViteSocket: a 'vite-hmr' socket never opens or closes, so the client never reloads),
// startViteChild's dev servers run without one (`ws: false`), every page is checked after the thaw and re-warmed if it
// lost its context, and a page frozen longer than `maxFrozenMinutes` is checked (and re-warmed) while still queued.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
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
 * config — no transforms, no Vite client, the fastest page loads — and `mode: 'dev'` serves the sources without an HMR
 * websocket (`ws: false`); `config` replaces the inline Vite config whole (e.g. `configFile: false` and a private
 * `cacheDir`: give it `server.ws: false` too). The child exits with its parent. Resolves { url, child, close }.
 */
export function startViteChild({ root = process.cwd(), mode = 'preview', outDir = 'dist', port = 5600 + (process.pid % 300),
  config = null, timeoutMs = 300_000, env = process.env } = {}) {
  const inline = config ?? (mode === 'preview'
    ? { root, logLevel: 'error', build: { outDir }, preview: { host: '127.0.0.1', port, strictPort: false } }
    : { root, logLevel: 'error', server: { host: '127.0.0.1', port, strictPort: false, hmr: false, ws: false, watch: null } });
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

/** In-page script: a WebSocket opened with Vite's protocols ('vite-hmr', 'vite-ping') is an EventTarget that never
 *  opens, errors or closes, so the Vite client neither hot-updates nor reloads the page; other sockets are untouched. */
const VITE_SOCKET_STUB = `(() => {
  const Native = window.WebSocket;
  if (!Native || Native.__cotViteStub) return;
  const vite = (protocols) => [].concat(protocols ?? []).some((p) => p === 'vite-hmr' || p === 'vite-ping');
  window.WebSocket = new Proxy(Native, {
    construct(target, args, newTarget) {
      if (!vite(args[1])) return Reflect.construct(target, args, newTarget);
      const socket = new EventTarget();
      return Object.assign(socket, { url: String(args[0]), protocol: '', readyState: 0, bufferedAmount: 0, extensions: '',
        binaryType: 'blob', onopen: null, onmessage: null, onerror: null, onclose: null, send() {}, close() {} });
    },
    get(target, key, receiver) { return key === '__cotViteStub' ? true : Reflect.get(target, key, receiver); },
  });
})();`;

/** Keep the page's Vite client (if any) from reloading it: install VITE_SOCKET_STUB before every document loads. */
export async function stubViteSocket(page) {
  await page.evaluateOnNewDocument(VITE_SOCKET_STUB);
}

/** How each warm page was loaded, for checkPage and rewarmPage. */
const warmRecords = new WeakMap();

/**
 * Record how `page` was warmed, for a page a tool loads itself: `url`, `ready` (a page expression), and `after(page)`,
 * any warm-up it runs once ready. warmPage records its own pages.
 */
export function rememberWarm(page, { url, ready = null, after = null, navTimeoutMs = 600_000, readyTimeoutMs = 900_000 } = {}) {
  warmRecords.set(page, { url, ready, after, navTimeoutMs, readyTimeoutMs });
}

async function loadReady(page, { url, ready, after, navTimeoutMs, readyTimeoutMs } = warmRecords.get(page)) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: navTimeoutMs });
  if (ready) await page.waitForFunction(ready, { timeout: readyTimeoutMs, polling: 1000 });
  await page.evaluate(async () => {
    const images = [...document.images];
    for (const image of images) image.loading = 'eager';
    const bounded = (promise, ms) => Promise.race([promise, new Promise((done) => setTimeout(done, ms))]);
    await bounded(Promise.all(images.map((image) => image.decode().catch(() => {}))), 30_000);
    await bounded(document.fonts?.ready ?? Promise.resolve(), 15_000);
  });
  if (after) await after(page);
  // a document that reloads loses this token, however ready it looks again (checkPage)
  const token = randomBytes(8).toString('hex');
  await page.evaluate((value) => { window.__cotWarmToken = value; }, token);
  warmRecords.get(page).token = token;
}

/**
 * Open `url` in a new page of `browser` and wait for `ready` (a page expression), every image loaded eagerly and the
 * fonts, then `after(page)`. Each wait is bounded and named; a lazy image would never decode
 * (studio-recorder-lazy-decode-hang). The page's Vite socket is stubbed unless `viteSocket: 'keep'`.
 */
export async function warmPage(browser, url, { ready, after = null, navTimeoutMs = 600_000, readyTimeoutMs = 900_000, viewport = null,
  viteSocket = 'stub' } = {}) {
  const page = await browser.newPage();
  if (viewport) await page.setViewport(viewport);
  if (viteSocket !== 'keep') await stubViteSocket(page);
  rememberWarm(page, { url, ready, after, navTimeoutMs, readyTimeoutMs });
  await loadReady(page);
  return page;
}

/** Whether a (thawed) page is still the document that was warmed: { ok, why }. Its context answers, it still carries the
 *  token its warm-up left (a reload drops it), and its `ready` holds. */
export async function checkPage(page, { timeoutMs = 30_000 } = {}) {
  const record = warmRecords.get(page);
  const probe = (async () => {
    if (record?.token && await page.evaluate(() => window.__cotWarmToken) !== record.token) return 'reloaded';
    return Boolean(await page.evaluate(record?.ready ?? 'true'));
  })();
  const timer = new Promise((done) => setTimeout(() => done({ timeout: true }), timeoutMs));
  try {
    const value = await Promise.race([probe, timer]);
    if (value && value.timeout === true) return { ok: false, why: `no answer within ${timeoutMs / 1000} s` };
    if (value === 'reloaded') return { ok: false, why: 'the page reloaded since it was warmed' };
    return value ? { ok: true } : { ok: false, why: 'its ready check no longer holds' };
  } catch (error) {
    return { ok: false, why: String(error?.message ?? error).split('\n')[0] };
  } finally {
    probe.catch(() => {});
  }
}

/** Load a warmed page again from its record (warmPage or rememberWarm); throws for a page without one. */
export async function rewarmPage(page) {
  const record = warmRecords.get(page);
  if (!record) throw new Error('no warm record for this page (load it with warmPage, or call rememberWarm)');
  await loadReady(page);
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
 * Every page is checked after the thaw (checkPage) and re-warmed (rewarmPage) when it lost its context; a page frozen
 * longer than `maxFrozenMinutes` (0: never) is checked while still queued, so its re-warm costs no hold time.
 */
export async function runWarmHold({ label = 'capture', warm, shoot, holdMinutes = 18, graceSeconds = 60, waitHours = 4,
  place = null, ticket = null, maxFrozenMinutes = 20, lock = createCaptureLock(), log = console.log, freeze = freezePage,
  thaw = thawPage, check = checkPage, rewarm = rewarmPage } = {}) {
  if (typeof warm !== 'function' || typeof shoot !== 'function') throw new Error('runWarmHold needs warm() and shoot()');
  const say = (message) => log(`[${label} ${new Date().toISOString().slice(11, 19)}] ${message}`);
  const queuedAt = Date.now();
  const sessions = new Map(), frozenAt = new Map();
  let warmed, current = null;
  // While queued, a page frozen past maxFrozenMinutes is woken, checked, re-warmed if it lost its warm state, and frozen
  // again (one page at a time; the hold waits for a check in progress before it thaws the pages itself).
  const maxFrozenMs = maxFrozenMinutes * 60_000;
  let queued = true, healthTimer = null, pageWork = Promise.resolve();
  const checkFrozen = () => {
    pageWork = pageWork.then(async () => {
      for (const page of [...sessions.keys()]) {
        if (!queued) return;
        const frozenMs = Date.now() - (frozenAt.get(page) ?? Date.now());
        if (frozenMs < maxFrozenMs) continue;
        await thaw(page, sessions.get(page));
        const state = await check(page);
        if (!state.ok) {
          say(`a page frozen ${(frozenMs / 60_000).toFixed(0)} min lost its warm state (${state.why}); re-warming it while queued`);
          await rewarm(page);
        }
        if (!queued) return; // the hold began: it thaws and checks the pages itself
        sessions.set(page, await freeze(page));
        frozenAt.set(page, Date.now());
      }
    }).catch((error) => say(`checking the frozen pages failed: ${error?.message ?? error}`));
  };
  const stopChecks = async () => {
    queued = false;
    if (healthTimer) clearInterval(healthTimer);
    await pageWork;
  };
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
        const warmStarted = Date.now();
        const result = await warm();
        current = result;
        try {
          for (const page of result?.pages ?? []) {
            sessions.set(page, await freeze(page));
            frozenAt.set(page, Date.now());
          }
        } catch (error) {
          await closeWarm(result, say);
          throw error;
        }
        if (maxFrozenMs > 0 && sessions.size) {
          healthTimer = setInterval(checkFrozen, Math.min(Math.max(maxFrozenMs / 2, 10), 5 * 60_000));
          healthTimer.unref?.();
        }
        say(`warm in ${((Date.now() - warmStarted) / 1000).toFixed(0)} s, ${((warmStarted - queuedAt) / 60_000).toFixed(1)} min after queueing `
          + `(${sessions.size} page(s) frozen); waiting for the lock`);
        return result;
      },
    });
  } catch (error) {
    await stopChecks();
    for (const signal of SIGNALS) process.removeListener(signal, onSignal);
    await closeWarm(error?.prepared, say);
    throw error;
  }
  await stopChecks();
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
    // A page that lost its warm state while frozen (a reload, a crash) is loaded again before shoot sees it.
    for (const page of sessions.keys()) {
      const state = await check(page);
      if (state.ok) continue;
      const started = Date.now();
      say(`a page lost its warm state at the thaw (${state.why}); re-warming it inside the hold`);
      try {
        await rewarm(page);
        say(`re-warmed in ${((Date.now() - started) / 1000).toFixed(0)} s`);
      } catch (error) {
        say(`re-warm failed (${error?.message ?? error}); shoot gets the page as it is`);
      }
    }
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
