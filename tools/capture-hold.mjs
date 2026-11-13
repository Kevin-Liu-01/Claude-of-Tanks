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
//       const browser = await launchGuardedBrowser(puppeteer, { headless: 'new', protocolTimeout: 600_000, timeout: 180_000 });
//       const page = await warmPage(browser, `${server.url}/?studio=1&map=verdant`, { ready: 'window.__STUDIO?.ready' });
//       return { pages: [page], page, close: async () => { await browser.close(); await server.close(); } };
//     },
//     shoot: async ({ page, signal }) => { /* shots only; stop when signal.aborted */ },
//   });
//
// The hold's limit is the lock's own cap (2026-11-02 audit S4; it was `holdMinutes`, 18 by default, below the cap, so a
// yield could never come before the abort): past the cap while anyone waits, a shoot that calls checkpoint() yields at its
// next one, and one that never does has `signal` aborted; `holdMinutes`, when given, is the caller's own budget per hold
// segment (an abort, waiters or not). A shoot still running `graceSeconds` after the abort has its warm resources closed
// (the browser stops drawing) before the lock is released. The wait (`waitHours`) is the queue's, never the hold's: do not
// wrap the process in a short alarm. The hold itself is withCaptureHold's, the one hold wrapper (below), which any tool
// that holds the GPU without warming pages uses directly.
//
// Frozen pages that reload (2026-10-23, world-polish and maps lanes): a page on a Vite dev server keeps the Vite client's
// HMR socket. When that socket closed (another lane's server on the same port, or a re-bundle broadcast during a ~50-min
// freeze) the client reloaded the page at thaw ("Execution context was destroyed") and the hold shot nothing. Now:
// warmPage stubs the socket (stubViteSocket: a 'vite-hmr' socket never opens or closes, so the client never reloads),
// startViteChild's dev servers run without one (`ws: false`), every page is checked after the thaw and re-warmed if it
// lost its context, and a page frozen longer than `maxFrozenMinutes` is checked (and re-warmed) while still queued.
//
// Lock classes and the hold cap (2026-10-27, item 262): a hold is a `render` (sharing the lock, two at once) or a
// `timing` hold (exclusive) by its command (genHeroCards, genIcons, genDrawings, gauntlet and sheet tools render), or by
// `lockClass`; `holdCapMinutes` (with a `holdCapReason`) raises the 20-min cap for this ticket. shoot gets
// `checkpoint()`: call it between batches. Past the cap with anyone waiting, it freezes the pages, gives the lock up,
// re-queues at the back, and thaws (and checks) the pages once the lock is held again; the hold segment starts again. A
// checkpoint after an abort never yields.
//
// Runaway browsers (2026-10-26, item 244): launch the hold's browser with tools/browser-launch.mjs launchGuardedBrowser.
// A renderer past 6 GB (or its tree past 10 GB), warming or shooting, has the browser killed, a `[browser-guard]` line
// naming this hold's label and its pages, the capture lock released at once (the queue moves on) and the process ended
// with exit code 86.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { constants } from 'node:os';
import { fileURLToPath } from 'node:url';
import { refuseGuardedLaunches, setBrowserGuardContext, stopGuardedBrowsers } from './browser-launch.mjs';
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

// ---- the hold's phases (2026-11-02 audit S4) ---------------------------------------------------------------------------
// runWarmHold had two timers that disagreed: its own hold limit (`holdMinutes`, 18 by default) and the lock's 20-minute
// cap, honoured only at checkpoint(). The limit always fired first, so a yield could never happen before the abort and
// the browser close 60 s later; a checkpoint after that froze closed pages and threw, and a yield after an abort left the
// grace timer running, which closed the browser during the re-queue wait (the thaw then hit closed pages). One owner now:
//   holding → (yield-due →) yielding → holding … → stopping (abort: the work is asked to stop) → torn-down (the grace
//   passed: teardown, nothing draws) → released (once that teardown has finished, bounded by `teardownWaitMs`).
// - (round 2 U38) A stop is enforced, not only asked for: from the abort on, the stopped hold refuses this process's
//   browser launches (browser-launch refuseGuardedLaunches: a per-row loop that caught the kill launched its next browser,
//   which the once-only teardown never stopped), and a work still running `teardownWaitMs` after its teardown began loses
//   the lock (forfeited: the lock goes, and what the work does now runs unheld). The cap holds without the work's help.
// - The cap is the lock's own (lock.heldCapMs, the base cap while a release ticket waits). Past it with anyone waiting, a
//   work that has called checkpoint() is yield-due: its next checkpoint yields; none within the grace, it is stopped. A
//   work that never checkpoints is stopped at once. With nobody waiting it keeps the lock (the lock's rule).
// - `holdMinutes` (optional) is the caller's own budget per hold segment: past it the work is stopped, waiters or not.
// - The abort is final: a checkpoint after it never yields ({ yielded: false, stopped: true }), so the grace can never fire
//   mid-yield. A yield stops every timer; the resume starts the segment again.
// - (round 2 U38 review) A yield's re-queue takes the hold's `signal`, which a signal stop aborts: the ticket leaves the
//   queue and the checkpoint rejects with the stop's reason (yielding → stopping, nothing held). Before this, a SIGTERM
//   during the re-queue left the caller blocked in checkpoint() until the process exited around it. A signal while holding
//   halts the phases (`halt()`: every timer stops and no checkpoint yields), since the signal owner runs that hold's
//   teardown itself.
// - (round 3 A5) A yield that fails otherwise (its re-queue's wait ran out, its onYield or onResume threw) is a stop with
//   all of a stop's effects (stopWith): the signal aborts, launches are refused until the release, and the teardown runs
//   after the grace, or at once when the re-queue left nothing held. The checkpoint still rejects with the failure, and
//   between() throws it.
// - A nested hold (capture-lock nestedEnv: a child inside its parent's hold) runs no cap: the parent's is the one.
// - `atCap: 'keep'` is a work that can neither checkpoint nor stop without losing its whole run (a wrapped command such as
//   a release-gate step or a film render): past the cap it is logged, not stopped, as the lock alone did. It is declared
//   at the call site, so the advisory holders are the ones that say so.
function createHoldPhases({ lock, holdMinutes = null, graceSeconds = 60, capCheckMs = 30_000, atCap = 'stop', say, onAbort, onTeardown,
  onYield = null, onResume = null, onForfeit = null, teardownWaitMs = 120_000, signal = null }) {
  if (atCap !== 'stop' && atCap !== 'keep') throw new TypeError(`atCap: 'stop' or 'keep', not ${JSON.stringify(atCap)}`);
  let phase = 'holding', cooperative = false, segmentAt = Date.now(), keptNoted = false, teardownDone = null, ended = false, forfeited = false;
  let budgetTimer = null, capTimer = null, graceTimer = null, dueTimer = null, forfeitTimer = null;
  const clear = () => { clearTimeout(budgetTimer); clearInterval(capTimer); clearTimeout(dueTimer); budgetTimer = capTimer = dueTimer = null; };
  const tearDown = () => {
    phase = 'torn-down';
    // kept, not dropped: the release waits for it (a shoot ends as soon as its browser starts closing, and the lock
    // went while Chrome still closed; 2026-11-02 audit S4, round 2)
    teardownDone = Promise.resolve().then(onTeardown);
    // the work still runs `teardownWaitMs` after its teardown began: the lock goes without it (the cap is the lock's)
    if (onForfeit) {
      forfeitTimer = setTimeout(() => {
        if (ended) return;
        forfeited = true;
        onForfeit();
      }, teardownWaitMs);
    }
  };
  // the one way into 'stopping' with a stop's effects: the work's signal aborts (and the process's launches are refused,
  // onAbort), then its teardown after the grace, or at once when the hold holds nothing (`now`)
  const stopWith = (error, { now = false } = {}) => {
    clear();
    phase = 'stopping';
    onAbort(error);
    if (now) { say('nothing is held: tearing down at once'); tearDown(); return; }
    graceTimer = setTimeout(() => {
      if (phase !== 'stopping') return;
      say(`still running ${graceSeconds} s past the stop: tearing down before the release`);
      tearDown();
    }, graceSeconds * 1000);
  };
  const stop = (why) => {
    if (phase !== 'holding' && phase !== 'yield-due') return;
    say(`${why}; asking the work to stop`);
    stopWith(new Error(why));
  };
  const capCheck = () => {
    if (phase !== 'holding') return;
    const capMs = lock.nested ? null : lock.heldCapMs;
    if (!(capMs > 0) || Date.now() - segmentAt < capMs) return;
    const waiters = typeof lock.waiting === 'function' ? lock.waiting() : 0;
    if (!waiters) return; // past the cap with nobody waiting: the hold keeps the lock
    if (!cooperative && atCap === 'keep') {
      if (!keptNoted) say(`past the ${(capMs / 60_000).toFixed(1)}-min hold cap with ${waiters} waiting: this hold cannot yield (atCap: keep)`);
      keptNoted = true;
      return;
    }
    if (!cooperative) { stop(`hold cap ${(capMs / 60_000).toFixed(1)} min with ${waiters} waiting, and no checkpoint`); return; }
    phase = 'yield-due';
    say(`hold cap ${(capMs / 60_000).toFixed(1)} min with ${waiters} waiting: the next checkpoint yields`);
    dueTimer = setTimeout(() => stop(`hold cap: no checkpoint within ${graceSeconds} s`), graceSeconds * 1000);
  };
  const arm = () => {
    segmentAt = Date.now();
    if (holdMinutes !== null && holdMinutes !== undefined) {
      budgetTimer = setTimeout(() => stop(`hold limit ${holdMinutes} min`), holdMinutes * 60_000);
    }
    if (!lock.nested && typeof lock.waiting === 'function') {
      capTimer = setInterval(capCheck, capCheckMs);
      capTimer.unref?.();
    }
  };
  arm();
  return {
    get phase() { return phase; },
    get tornDown() { return phase === 'torn-down'; },
    /** The teardown the grace started (torn-down), or null: the release waits for it. */
    get teardownDone() { return teardownDone; },
    /** Whether the lock went without the work (a work still running `teardownWaitMs` after its teardown began). */
    get forfeited() { return forfeited; },
    /** Between batches: yields past the cap while anyone waits (the lock decides), never after a stop. A re-queue that
     *  `signal` withdraws (or that fails) rejects, with nothing held. */
    async checkpoint() {
      if (phase !== 'holding' && phase !== 'yield-due') return { yielded: false, stopped: true };
      cooperative = true;
      if (typeof lock.checkpoint !== 'function') return { yielded: false };
      let result;
      try {
        result = await lock.checkpoint({
          signal,
          beforeYield: async () => {
            clear();
            phase = 'yielding';
            if (onYield) await onYield();
          },
          afterResume: async () => {
            if (onResume) await onResume();
            phase = 'holding';
            arm();
          },
        });
      } catch (error) {
        // (round 3 A5) the yield did not come back to holding. A signal withdrew its re-queue: the signal owner runs this
        // hold's stop. Otherwise (the re-queue's wait ran out, the yield's freeze or thaw threw) the work is stopped here as
        // a cap stop is: its signal aborts, launches are refused until the release, and its teardown runs, at once when the
        // re-queue left nothing held. It used to move to 'stopping' with none of that, so a tool that caught the rejection
        // (loading-census records it as a page error) went on drawing and launching browsers without the lock.
        if (phase === 'yielding') {
          if (signal?.aborted) phase = 'stopping';
          else {
            say(`the cap yield did not hold again (${error?.message ?? error}); stopping the work`);
            stopWith(error instanceof Error ? error : new Error(String(error)), { now: lock.held === false });
          }
        }
        throw error;
      }
      if (!result?.yielded && phase === 'yield-due') { clearTimeout(dueTimer); dueTimer = null; phase = 'holding'; } // nobody waits now
      return result ?? { yielded: false };
    },
    /** A signal stopped this hold (the signal owner tears it down itself): every timer stops and no checkpoint yields; a
     *  yield in progress is withdrawn through `signal`. */
    halt() {
      if (phase !== 'holding' && phase !== 'yield-due') return;
      clear();
      phase = 'stopping';
    },
    finish() {
      ended = true; clear(); clearTimeout(graceTimer); clearTimeout(forfeitTimer); graceTimer = forfeitTimer = null;
      if (phase !== 'torn-down') phase = 'released';
    },
  };
}

const SIGNALS = ['SIGTERM', 'SIGINT', 'SIGHUP'];
/** `promise`'s settling, or false past `ms` (the timer never keeps the process alive). */
const bounded = (promise, ms) => {
  let timer;
  return Promise.race([Promise.resolve(promise).then(() => true, () => true),
    new Promise((done) => { timer = setTimeout(() => done(false), ms); timer.unref?.(); })]).finally(() => clearTimeout(timer));
};
/** One turn of the event loop: due timers (a hold's refresh, its cap check) and a signal's handler run. */
const turn = () => new Promise((next) => setImmediate(next));

// ---- one signal owner for every hold of this process (2026-11-02 audit S4, round 2) ------------------------------------
// Each withCaptureHold added its own process.once handler, and each handler exited the process after its own teardown. In
// a process with several holds at once (tank-release-check runs its capture steps four at a time through
// runCapturedCommand: one holding, the others queued) a queued hold's handler, with nothing to tear down, exited the
// process within microseconds: the holder's lock went by its 'exit' listener while its command still ran, and the
// command's SIGKILL timer died with the process. One owner now: the first live hold installs the handlers and the last one
// gone removes them; a signal stops every live hold together and the process exits once, 128 + n, after all of them. A
// second signal while stopping changes nothing (the stop is already bounded), and no browser launches from then on.
// How a hold stops is its `onSignal`:
// - 'exit' (withCaptureHold's default): its teardown, bounded by its `signalWaitMs`, then its release. A hold that ends
//   while the stop runs never returns to its caller (who would start its next step), and a hold started meanwhile never
//   queues. Once every hold is released the process exits.
// - 'unwind' (openCaptureHold, round 2 U38): the caller's way out runs. Its signal aborts and its teardown runs (the
//   browsers stop drawing), then the caller's own finally (a server stopped, a temporary directory removed) reaches its
//   release(), which resolves, so what follows it (a report written) runs too. A queued hold leaves the queue and its
//   openCaptureHold rejects; a hold waiting in its cap yield's re-queue leaves it and its checkpoint() (or between())
//   rejects; one started meanwhile rejects at once. The exit code is 128 + n (kept: see below);
//   the process ends when its work is done, or `signalWaitMs` after the last release at most. A caller that has not
//   released within `signalWaitMs` of its teardown is released for it, and the process exits then. On base (a direct
//   acquire) puppeteer's own SIGTERM listener kept such a tool alive, so its finally cleaned up; the first open form
//   exited within microseconds of the signal, and those finallies never ran. (round 3 B16) SIGINT too: puppeteer's SIGINT
//   listener exits the process inside itself, so tools/browser-launch.mjs launchGuardedBrowser hands it handleSIGINT: false.
// Either way the process exits 128 + n. (round 4 E10 review) An 'exit' listener keeps that code however the process ends
// from the signal on: a tool's last `process.exit(failed ? 1 : 0)` after its release (screenshot, gunnery_gate, perfprobe,
// the audio smokes, studio-selftest, visual-evaluator and others exited 1, or 0 when the signal came after the last page
// call), or an uncaught rejection (a queued openCaptureHold rejects with the signal's error: exit 1 and a stack). A tool
// that passes `signals: []` owns its signals and its exit code.
const liveHolds = new Set();
let signalStop = null, stopSignal = null;
const NEVER = new Promise(() => {});
const signalError = (signal) => Object.assign(new Error(`${signal}: the process is stopping, so the capture hold ends`), { code: 'CAPTURE_HOLD_SIGNAL', signal });
function onHoldSignal(signal) {
  if (signalStop) return;
  stopSignal = signal;
  const code = 128 + (constants.signals[signal] ?? 15);
  process.exitCode = code;
  process.on('exit', () => { process.exitCode = code; }); // the process's code, whatever ends it (Node exits with it)
  refuseGuardedLaunches(`${signal}: the process is stopping`); // never lifted
  const holds = [...liveHolds];
  signalStop = Promise.allSettled(holds.map((hold) => hold.stopForSignal(signal))).then(() => {
    if (!holds.every((hold) => hold.unwind && !hold.stuck)) process.exit(code);
    // every caller is out of its hold: what follows its release runs, then the process ends on its own, or at the bound
    const waitMs = Math.max(0, ...holds.map((hold) => hold.signalWaitMs));
    setTimeout(() => process.exit(), waitMs).unref();
  });
}
function registerHold(hold) {
  if (!liveHolds.size) for (const signal of SIGNALS) process.on(signal, onHoldSignal);
  liveHolds.add(hold);
}
function unregisterHold(hold) {
  liveHolds.delete(hold);
  if (!liveHolds.size && !signalStop) for (const signal of SIGNALS) process.removeListener(signal, onHoldSignal);
}

/**
 * One capture hold, owned in one place (2026-11-02 audit S4): the documented way to hold the GPU (direct lock.acquire()
 * callers each set their own timers, limits and signal handlers; tools/capture-hold-census.selftest.mjs lists them and
 * refuses a new one). It queues (`prepare` runs while queued, its result is `prepared`), refreshes, owns the cap and the
 * yield (createHoldPhases above), ends cleanly on SIGTERM/SIGINT/SIGHUP with every other hold of the process (the signal
 * owner above) and at exit (release), and tears down before the release, so nothing draws once the lock is gone.
 *   const shots = await withCaptureHold(async ({ signal, checkpoint }) => { ... }, { label: 'my-probe', timeoutMs,
 *     teardown: async () => { await browser?.close(); await server?.close(); } });
 * `work({ prepared, signal, checkpoint, between, heldAt, say })` runs inside the hold: stop when `signal` aborts, call
 * `checkpoint()` between batches. A synchronous CPU tool awaits `between()` between its steps: one turn of the event loop
 * (the refresh, the cap check and a signal run), its checkpoint, and the stop's reason thrown once the hold was stopped.
 * `teardown(prepared)` stops what draws (a stop past its grace, a signal, a failed wait with something prepared); it runs
 * at most once per hold. `beforeRelease(prepared)` runs on the normal way out before the release (default: teardown),
 * `afterRelease(prepared)` after it; `onYield()`/`onResume()` run around a checkpoint yield.
 * `holdMinutes`, `graceSeconds`: see the phases; the release waits up to `teardownWaitMs` for a teardown the grace began,
 * and a work still running then loses the lock (forfeited); a signal waits up to `signalWaitMs` for this hold's teardown
 * (more than a teardown's own SIGKILL fallback). The acquire options (`place`, `ticket`, `lockClass`, `command`,
 * `holdCapMinutes`, `holdCapReason`, `priority`, `ancestorHeld`: the caller says an ancestor holds the lock, checked as
 * COT_LANE_HOLD is) go to the lock. `signals: []` leaves signals to the caller (a chain that stops its own children
 * first; a tool whose own SIGINT/SIGTERM handler stops its run and writes its report: one owner of a signal per process,
 * which capture-hold-census.selftest checks); otherwise the shared owner handles SIGTERM, SIGINT and SIGHUP as `onSignal`
 * says ('exit' or 'unwind', above). `atCap: 'keep'` declares a work that cannot yield or stop part-way (see the phases).
 */
export async function withCaptureHold(work, { label = 'capture', lock = createCaptureLock(), timeoutMs = 45 * 60_000, place = null,
  ticket = null, lockClass = null, command = null, holdCapMinutes = null, holdCapReason = null, priority = null, ancestorHeld = false,
  prepare = null, holdMinutes = null, graceSeconds = 60, refreshMs = 30_000, capCheckMs = 30_000, atCap = 'stop', teardown = null, beforeRelease = null,
  afterRelease = null, onYield = null, onResume = null, signals = SIGNALS, onSignal = 'exit', teardownWaitMs = 120_000, signalWaitMs = 30_000,
  log = console.log } = {}) {
  if (typeof work !== 'function') throw new TypeError('withCaptureHold needs work()');
  if (atCap !== 'stop' && atCap !== 'keep') throw new TypeError(`withCaptureHold atCap: 'stop' or 'keep', not ${JSON.stringify(atCap)}`);
  if (onSignal !== 'exit' && onSignal !== 'unwind') throw new TypeError(`withCaptureHold onSignal: 'exit' or 'unwind', not ${JSON.stringify(onSignal)}`);
  const unwind = onSignal === 'unwind';
  // the process is stopping on a signal: a hold started now never queues (the exit is on its way)
  if (signalStop) { if (unwind) throw signalError(stopSignal); return NEVER; }
  const say = (message) => log(`[${label} ${new Date().toISOString().slice(11, 19)}] ${message}`);
  let prepared, held = false, tearing = null, forfeited = false, lift = null, phases = null;
  const tear = async (value) => { if (teardown) { try { await teardown(value); } catch (error) { say(`teardown failed: ${error?.message ?? error}`); } } };
  // one teardown per hold, whoever asks first (the grace, a signal, the way out)
  const tearOnce = () => (tearing ??= tear(prepared));
  const controller = new AbortController(), withdraw = new AbortController();
  let releasedNow;
  const released = new Promise((done) => { releasedNow = done; });
  // A signal ends the run cleanly, queued or holding: puppeteer's own SIGTERM handler closes the browser but leaves the
  // process waiting in the queue (2026-10-22), so the signal owner stops every hold at once (see onSignal above).
  const entry = {
    unwind, signalWaitMs, stuck: false,
    async stopForSignal(signal) {
      if (!unwind) {
        say(`${signal}: tearing down and releasing`);
        if (!(await bounded(tearOnce(), signalWaitMs))) say(`the teardown still runs after ${signalWaitMs / 1000} s; releasing`);
        lock.release();
        return;
      }
      if (!held) {
        say(`${signal}: leaving the queue`);
        withdraw.abort(signalError(signal));
        await bounded(released, signalWaitMs);
        return;
      }
      say(`${signal}: asking the work to stop and tearing down; the caller's way out runs to its release`);
      // a caller waiting in its yield's re-queue leaves it: its checkpoint rejects (the phases pass this signal on)
      phases?.halt();
      controller.abort(signalError(signal));
      if (!(await bounded(tearOnce(), signalWaitMs))) say(`the teardown still runs after ${signalWaitMs / 1000} s`);
      if (await bounded(released, signalWaitMs)) return;
      say(`the caller has not released ${signalWaitMs / 1000} s after its teardown; releasing for it`);
      entry.stuck = true;
      lock.release();
    },
  };
  const registered = Array.isArray(signals) ? signals.length > 0 : Boolean(signals);
  if (registered) registerHold(entry);
  const dropSignals = () => { if (registered) unregisterHold(entry); };
  const queuedAt = Date.now();
  try {
    prepared = await lock.acquire(timeoutMs, { place, ticket, lockClass, command, holdCapMinutes, holdCapReason, priority,
      ...(ancestorHeld ? { ancestorHeld: true } : {}), ...(unwind ? { signal: withdraw.signal } : {}),
      ...(typeof prepare === 'function' ? { prepare: async () => (prepared = await prepare()) } : {}) });
  } catch (error) {
    if (signalStop && !unwind) return NEVER;
    dropSignals();
    if (error?.prepared !== undefined) { prepared = error.prepared; await tearOnce(); }
    releasedNow();
    throw error;
  }
  if (signalStop) {
    // held as the stop began: given straight back, the exit is on its way
    lock.release();
    if (!unwind) return NEVER;
    dropSignals();
    await tearOnce();
    releasedNow();
    throw signalError(stopSignal);
  }
  held = true;
  const heldAt = Date.now();
  say(`lock held after ${((heldAt - queuedAt) / 60_000).toFixed(1)} min in the queue${lock.nested ? ' (nested in its parent\'s hold)' : ''}`);
  const release = () => lock.release();
  process.once('exit', release);
  const refresher = setInterval(() => lock.refresh(), refreshMs);
  refresher.unref();
  phases = createHoldPhases({ lock, holdMinutes, graceSeconds, capCheckMs, atCap, say, onYield, onResume, teardownWaitMs,
    signal: controller.signal,
    onAbort: (reason) => {
      // a stopped hold launches nothing new (its teardown runs once); lifted once it is released
      lift = refuseGuardedLaunches(`the ${label} capture hold was stopped (${reason.message})`);
      controller.abort(reason);
    },
    onTeardown: tearOnce,
    onForfeit: () => {
      clearInterval(refresher);
      forfeited = true;
      say(`the work still runs ${teardownWaitMs / 1000} s after its teardown began: the lock is given up without it (what it does now runs unheld)`);
      lock.release('the hold was stopped and its work did not end: forfeited');
    } });
  const between = async () => {
    await turn();
    controller.signal.throwIfAborted();
    const result = await phases.checkpoint();
    // a stop that came while the checkpoint ran (its yield's re-queue, its resume) ends the work here, not one step on
    controller.signal.throwIfAborted();
    return result;
  };
  let result, failure = null;
  try {
    result = await work({ prepared, signal: controller.signal, checkpoint: () => phases.checkpoint(), between, heldAt, say });
  } catch (error) {
    failure = { error };
  }
  // A signal stop in progress ('exit') owns the rest: this hold is released with the others, and the caller never sees an
  // end (it would start its next step). The hold stays registered until its release, so a signal during the way out is
  // handled. An 'unwind' hold takes its normal way out (its teardown already ran) and returns to its caller.
  if (signalStop && !unwind) return NEVER;
  const tornDown = phases.tornDown, teardownDone = phases.teardownDone;
  phases.finish();
  clearInterval(refresher);
  if (tornDown) {
    // the grace began a teardown (the browser closing): the lock goes once it is done, never while Chrome still draws
    if (!forfeited && teardownDone && !(await bounded(teardownDone, teardownWaitMs))) say(`the teardown still runs after ${teardownWaitMs / 1000} s; releasing`);
  } else {
    const step = beforeRelease ?? (teardown ? tearOnce : null);
    if (step) { try { await step(prepared); } catch (error) { say(`before the release: ${error?.message ?? error}`); } }
  }
  if (signalStop && !unwind) return NEVER;
  process.removeListener('exit', release);
  if (held && !forfeited && !entry.stuck) lock.release();
  dropSignals();
  if (!signalStop) lift?.();
  releasedNow();
  say(forfeited ? `ended ${((Date.now() - heldAt) / 1000).toFixed(0)} s after the hold began (the lock was forfeited before)`
    : `released after ${((Date.now() - heldAt) / 1000).toFixed(0)} s`);
  if (!tornDown && afterRelease) { try { await afterRelease(prepared); } catch (error) { say(`after the release: ${error?.message ?? error}`); } }
  if (failure) throw failure.error;
  return result;
}

/**
 * The open form of withCaptureHold (round 2 U38), for a tool whose run is a script rather than one function: it resolves
 * once the lock is held with { prepared, signal, checkpoint, between, heldAt, say, refresh, release }. The hold is
 * withCaptureHold's, the one owner of a hold (refresh, the cap and its yield, signals, the release at exit), so a tool that
 * acquired the lock itself moves onto it by two lines:
 *   const hold = await openCaptureHold({ label: 'my-probe', timeoutMs: 45 * 60_000 });
 *   try { ... } finally { await browser?.close(); await hold.release(); }
 * The caller closes what it opened, then awaits release() (once; later calls return the same promise), which releases
 * with no teardown of its own. `teardown` is what a stop past the cap's grace or a signal runs before the release; by
 * default every guarded browser this process launched is stopped (tools/browser-launch.mjs stopGuardedBrowsers: what
 * draws), so the cap holds for a tool that never checkpoints. A tool that launches no browser (a CPU-only holder) gives the
 * cap a stop of its own: it reads `signal` into its cancellation, awaits `between()` between synchronous steps, or passes
 * a `teardown` that stops its workers (capture-hold-census.selftest checks that each one does). A work that ignores the
 * stop loses the lock `teardownWaitMs` after the teardown (the phases' forfeit). `atCap: 'keep'` declares a hold that
 * cannot be stopped. On a signal the caller's way out runs (onSignal 'unwind', at the signal owner above): its `signal`
 * aborts, the teardown runs, and release() resolves, so its finally and what follows the release finish before the exit. A
 * caller waiting in a cap yield's re-queue is let out too: its checkpoint() rejects with the signal's error.
 * The hold's lines go to stderr unless `log` says otherwise (a tool's stdout may be its report).
 */
export async function openCaptureHold({ teardown = null, log = (line) => console.error(line), lock = createCaptureLock(), ...options } = {}) {
  const label = options.label ?? 'capture';
  // the default teardown says what it stopped: a CPU-only holder has no browser, and its cap is its own stop's
  const stopBrowsers = () => {
    const pids = stopGuardedBrowsers();
    log(`[${label} ${new Date().toISOString().slice(11, 19)}] ${pids.length ? `stopped this process's guarded browsers (${pids.length} processes)`
      : 'no guarded browser of this process to stop: the work stops on its signal, or loses the lock at the forfeit'}`);
  };
  let held, finish;
  const heldNow = new Promise((resolve) => { held = resolve; });
  const done = new Promise((resolve) => { finish = resolve; });
  const whole = withCaptureHold(async (context) => { held(context); await done; }, { ...options, lock, teardown: teardown ?? stopBrowsers, log,
    onSignal: 'unwind',
    // the normal way out is the caller's: it closed what it opened before release()
    beforeRelease: options.beforeRelease ?? (() => {}) });
  const ended = whole.then(() => ({ endedUnheld: true }));
  ended.catch(() => {}); // a failed wait rejects through the race below
  const context = await Promise.race([heldNow, ended]);
  if (context?.endedUnheld) throw new Error('openCaptureHold: the hold ended before it was held');
  let releasing = null;
  // refresh(): a tool's long synchronous step renews the hold itself (the 30 s refresh cannot run while the loop is blocked)
  return { ...context, refresh: () => lock.refresh(), release: () => (releasing ??= (finish(), whole)) };
}

/**
 * Warm while queued, hold for the shots only. Returns shoot's result. `warm()` returns anything; its `pages` (puppeteer
 * pages) are frozen once warm and thawed when the hold starts, and its `close()` runs after the hold (or after a failed
 * wait). `shoot({ ...warmed, signal, heldAt, checkpoint })` runs inside the hold. A `warm` that throws closes what it
 * opened itself. `place` (a job key) or `ticket` (a stamped ticket, capture-lock ticketAt) keeps a queue place across runs.
 * Every page is checked after the thaw (checkPage) and re-warmed (rewarmPage) when it lost its context; a page frozen
 * longer than `maxFrozenMinutes` (0: never) is checked while still queued, so its re-warm costs no hold time.
 * The hold is withCaptureHold's: the cap and its yield, the optional `holdMinutes` budget and the grace are its phases
 * (2026-11-02 audit S4: `holdMinutes` no longer defaults to 18, below the lock's cap; with none, the lock's cap applies).
 */
export async function runWarmHold({ label = 'capture', warm, shoot, holdMinutes = null, graceSeconds = 60, waitHours = 4,
  place = null, ticket = null, maxFrozenMinutes = 20, lock = createCaptureLock(), log = console.log, freeze = freezePage,
  thaw = thawPage, check = checkPage, rewarm = rewarmPage, lockClass = null, holdCapMinutes = null, holdCapReason = null,
  capCheckMs = 30_000 } = {}) {
  if (typeof warm !== 'function' || typeof shoot !== 'function') throw new Error('runWarmHold needs warm() and shoot()');
  const say = (message) => log(`[${label} ${new Date().toISOString().slice(11, 19)}] ${message}`);
  setBrowserGuardContext({ hold: label });
  const queuedAt = Date.now();
  const sessions = new Map(), frozenAt = new Map();
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
  const thawAll = async (where) => {
    for (const [page, session] of sessions) await thaw(page, session);
    // A page that lost its warm state while frozen (a reload, a crash) is loaded again before shoot sees it.
    for (const page of sessions.keys()) {
      const state = await check(page);
      if (state.ok) continue;
      const started = Date.now();
      say(`a page lost its warm state ${where} (${state.why}); re-warming it inside the hold`);
      try {
        await rewarm(page);
        say(`re-warmed in ${((Date.now() - started) / 1000).toFixed(0)} s`);
      } catch (error) {
        say(`re-warm failed (${error?.message ?? error}); shoot gets the page as it is`);
      }
    }
  };
  const freezeAll = async () => { for (const page of sessions.keys()) { try { sessions.set(page, await freeze(page)); } catch { /* closed or crashed */ } } };
  say('queued; warms once near the head of the queue');
  try {
    return await withCaptureHold(async ({ prepared: warmed, signal, checkpoint, heldAt }) => {
      await stopChecks();
      await thawAll('at the thaw');
      return shoot({ ...warmed, signal, heldAt, checkpoint });
    }, {
      label, lock, log, timeoutMs: waitHours * 3600 * 1000, place, ticket, lockClass, holdCapMinutes, holdCapReason, holdMinutes,
      graceSeconds, capCheckMs,
      prepare: async () => {
        const warmStarted = Date.now();
        const result = await warm();
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
      // a stop past its grace, a signal or a failed wait with warm resources: close them (the browser stops drawing)
      teardown: async (warmed) => { await stopChecks(); await closeWarm(warmed, say); },
      // the normal way out: nothing draws after the release (the pages are frozen again), the browser closes after it
      beforeRelease: () => freezeAll(),
      afterRelease: (warmed) => closeWarm(warmed, say),
      onYield: async () => {
        await freezeAll();
        say('hold cap reached with tickets waiting: pages frozen, lock given up, re-queued');
      },
      onResume: async () => {
        say('lock held again after the hold-cap yield');
        await thawAll('after the hold-cap yield');
      },
    });
  } finally {
    await stopChecks();
  }
}
