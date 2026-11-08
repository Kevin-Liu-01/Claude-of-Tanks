// The long hold users on the capture lock's cap (round 3 A5 review; round 4 F12 and E10). turret-parent-audit,
// marketing-shots/shoot and studio-example-videos run past the lock's 20-minute cap, which their hold (openCaptureHold)
// enforces: each calls the hold's checkpoint() between its items (ids, scenes, takes), keeps the Studio page frozen through
// a yield (shoot and studio-example-videos; turret-parent-audit's page runs no frame loop) and gives an item in flight when
// the cap comes a grace to finish before the yield (180 s, 180 s and 300 s, not the default 60). Round three checked that
// wiring with node --check and the census only: each tool started Vite and Chrome at its top level.
// Each tool runs here through its exported run function (its own hold options, the real openCaptureHold and its phases,
// launchGuardedBrowser, eachBrowserChunk) with stand-ins for what serves and draws: a lock that keeps the real lock's
// checkpoint rule (past its cap with anyone waiting: beforeYield while held, the release, the re-queue, afterResume), a
// browser whose page calls each take a set time and are cut ('Target closed') when the hold's teardown kills it (what
// stopGuardedBrowsers does to Chrome), and a server in Vite's place. The clock is node:test's mock clock (setTimeout,
// setInterval and Date), so the lock's 20-minute cap, the hold's 30-second cap check and each tool's grace run at their
// real values. Per tool:
//   yield    an item in flight at the cap finishes inside the tool's grace; the next checkpoint yields (the page frozen
//            before the release and thawed once held again, no page call while frozen) and every item runs;
//   control  the same run with the default 60-s grace is stopped and that item is left: the tool's grace is what kept it;
//   stop     an item past the grace is stopped (its signal aborts), finishes before the teardown and is kept; the rest are
//            left and the finishing command is named; the run exits 3 (E10: shoot and studio-example-videos exited 1);
//   signal   (E10, a child process per tool) SIGTERM during an item: the tool's way out runs and the process exits 143
//            (turret-parent-audit set 3 over it, shoot exited 1, studio-example-videos rethrew: 1); and during a boot
//            step outside the items (turret-parent-audit's roster page, shoot's Vite start: its launch is then refused),
//            which threw past the signal's code (exit 1);
//   stills   (E10) a --stills run with --only keeps the takes stills.json already lists (it listed only its own).
// (round 4 review) And per tool:
//   refused  a cap yield whose re-queue fails without a signal (its wait ran out) stops the run: the item it yielded
//            before is left with the rest, named, exit 3 (runHeldItem's rejected checkpoint);
//   finish   the finishing run a stop names (the same options and --only / --match <left>) runs only what was left: the
//            options read the first --only / --match, so a run that had one rendered every take or scene again;
//   signal   SIGTERM while queued for the lock (the open's rejection was uncaught: exit 1), while the run waits in a cap
//            yield's re-queue, and during studio-example-videos' boot: each exits 143 and says what is left;
//   owner    the signal owner keeps 128 + n for every open-form tool however it ends: its last `process.exit(failed ? 1 :
//            0)` after the release (screenshot, gunnery_gate, perfprobe, the audio smokes, studio-selftest,
//            visual-evaluator: exit 1) or an uncaught queued open (exit 1); and tools/held-items.mjs's rules directly.
// (round 5 U9) And:
//   output   turret-parent-audit's output holds what ran: a stop before any id (a signal while held, booting or
//            re-queued, or a cap stop, which exits 3) leaves the previous output as it was (it wrote [] over it);
//   queued   a tool queued when the signal comes starts nothing (openHeldRun's null: `if (!hold) return;`): what serves
//            and draws says when it starts, and nothing may (the line and the 143 come from openHeldRun and the signal
//            owner, so a tool that ran on past the null passed);
//   npm      a finishing run through an npm script: a script that names studio-example-videos or shoot (however it
//            calls node) runs it as its last command (the flags after `npm run <script> --` reach the tool, not a
//            command after an &&), and reels:render's baked flags hold under a typed selection and the appended one
//            (the last --only wins), take 3 of the battle-reel pool (loaded with the run) rendered; a duels run's takes
//            are the duel pool's. (round 6 V10) A script that names a tool fails where the check cannot read the call,
//            where it calls the tool through another script, or where it holds a quote, backtick, parenthesis, $ or
//            backslash (a nested call); the tool's first read must be the script's last command.
// No real browser, server or lock starts; the real Chrome runs stay the owner's (manualRecommended).
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mock } from 'node:test';
import { fileURLToPath } from 'node:url';
import { openCaptureHold } from './capture-hold.mjs';
import { heldRunExitCode, heldStopWhy, runHeldItem } from './held-items.mjs';

// (round 5 U6) A tool loads when a run needs it: a signal child imports only the tool it runs (the open-form children
// none), the parent all three. studio-example-videos cost ~0.37 s of CPU to import (its scenarios import every map's
// config; it now loads them only for a duels or battle-reels run, and the studio children render features), and each of
// the 14 children imported all three statically: ~5.5 s of the receipt's 6.4 s user.
const tools = {
  turret: async () => (await import('./turret-parent-audit.mjs')).runTurretParentAudit,
  shoot: async () => (await import('./marketing-shots/shoot.mjs')).shootMarketing,
  studio: async () => (await import('./studio-example-videos.mjs')).renderStudioExamples,
};

const SECOND = 1000, MINUTE = 60 * SECOND;
const CAP_MS = 20 * MINUTE; // the lock's base hold cap (capture-lock.mjs DEFAULT_HOLD_CAP_MS)
const REQUEUE_MS = 2 * MINUTE; // the waiter's turn: the yielded hold is held again this long after its release
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SELF = fileURLToPath(import.meta.url);
const at = () => Math.round(Date.now() / SECOND);
// the real timers, kept before any case mocks the clock (a child's watchdog is a real one)
const { setTimeout: setRealTimeout, clearTimeout: clearRealTimeout } = globalThis;

/** The 24 bytes a PNG starts with (signature, IHDR length and type, width, height): what shoot.mjs reads back. */
const PNG = (() => {
  const bytes = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write('IHDR', 12, 'ascii');
  bytes.writeUInt32BE(64, 16);
  bytes.writeUInt32BE(36, 20);
  return `data:image/png;base64,${bytes.toString('base64')}`;
})();

/** The capture lock as a hold sees it (capture-lock.mjs createCaptureLock): held once acquired, its cap while held, and
 *  checkpoint()'s rule: past the cap with anyone waiting, beforeYield (still held), the release, the re-queue (that
 *  `signal` withdraws), held again, afterResume. `capMs` 0: the first checkpoint finds the cap passed (and the hold's own
 *  cap check none). `queued`: the acquire waits until its `signal` withdraws it, `onQueue` called as it starts. `requeue`:
 *  'resume' (held again after REQUEUE_MS), 'refuse' (the re-queue's wait runs out: it rejects) or 'wait' (until its
 *  `signal` withdraws it, `onQueue` called as it starts). A wait keeps the event loop alive, as the real lock's poll does. */
function standInLock({ waiters, events, capMs = CAP_MS, queued = false, requeue = 'resume', onQueue = null }) {
  let held = false, since = 0;
  const waitForWithdraw = (signal) => new Promise((_, withdraw) => {
    const poll = setInterval(() => {}, SECOND);
    onQueue?.();
    signal?.addEventListener('abort', () => { clearInterval(poll); withdraw(signal.reason); }, { once: true });
  });
  const lock = {
    get nested() { return false; },
    get held() { return held; },
    get heldCapMs() { return held ? capMs : null; },
    async acquire(_timeoutMs, { signal = null } = {}) {
      if (queued) await waitForWithdraw(signal);
      held = true; since = Date.now(); events.push(`hold@${at()}`);
    },
    refresh() { return held; },
    waiting() { return waiters; },
    release() {
      if (!held) return false;
      held = false;
      events.push(`release@${at()}`);
      return true;
    },
    async checkpoint({ beforeYield = null, afterResume = null, signal = null } = {}) {
      if (!held) throw new Error('checkpoint(): this lock holds nothing');
      if (Date.now() - since < capMs || !waiters) return { yielded: false };
      if (beforeYield) await beforeYield();
      lock.release();
      events.push(`yield@${at()}`);
      if (requeue === 'wait') await waitForWithdraw(signal);
      await new Promise((resume, withdraw) => {
        const timer = setTimeout(() => (requeue === 'refuse' ? withdraw(new Error('stand-in: the re-queue\'s wait ran out')) : resume()), REQUEUE_MS);
        signal?.addEventListener('abort', () => { clearTimeout(timer); withdraw(signal.reason); }, { once: true });
      });
      held = true;
      since = Date.now();
      events.push(`held again@${at()}`);
      if (afterResume) await afterResume();
      return { yielded: true };
    },
  };
  return lock;
}

/** Chrome as the tools drive it. `script({ method, arg, url })` gives each page call its time ({ ms, value }; 0 answers at
 *  once, Infinity never) and its answer; `onCall` sees each call as it starts. kill() (the hold's teardown) and close() cut
 *  what is in flight, as a killed page call is cut. A page frozen through CDP (freezePage) records any call made before its
 *  thaw. A live browser keeps the event loop alive, as Chrome's pipe does. */
function standInChrome({ script, events, onCall = null }) {
  const browsers = [];
  let frozen = false;
  const launcher = {
    async launch() {
      let connected = true, url = '';
      const inFlight = new Set();
      const alive = setInterval(() => {}, 10 * SECOND);
      const kill = (why) => {
        connected = false;
        clearInterval(alive);
        for (const cut of inFlight) cut(why);
        inFlight.clear();
      };
      const call = (method, arg) => {
        if (!connected) return Promise.reject(new Error(`Protocol error (${method}): Target closed`));
        if (frozen) events.push(`${method} while frozen`);
        if (method === 'goto') url = arg;
        const { ms = 0, value } = script({ method, arg, url }) ?? {};
        onCall?.({ method, arg, url });
        if (ms === 0) return Promise.resolve(value);
        return new Promise((answer, fail) => {
          const cut = (why) => { clearTimeout(timer); fail(new Error(`Protocol error (${method}): Target closed (${why})`)); };
          const timer = Number.isFinite(ms) ? setTimeout(() => { inFlight.delete(cut); answer(value); }, ms) : null;
          inFlight.add(cut);
        });
      };
      const page = {
        setDefaultTimeout() {},
        on() {},
        setViewport: async () => {},
        bringToFront: async () => {},
        goto: (target) => call('goto', target),
        waitForFunction: (expression) => call('waitForFunction', expression),
        evaluate: (fn, arg) => call('evaluate', arg === undefined ? fn : arg),
        createCDPSession: async () => ({
          send: async (method, params) => {
            if (method !== 'Page.setWebLifecycleState') return;
            frozen = params.state === 'frozen';
            events.push(`${params.state}@${at()}`);
          },
        }),
      };
      const browser = { newPage: async () => page, close: async () => kill('closed'), isConnected: () => connected, kill };
      browsers.push(browser);
      return browser;
    },
  };
  return { launcher, teardown: async () => { for (const browser of browsers) browser.kill('the hold\'s teardown'); } };
}
const standInVite = async () => ({ listen: async () => {}, close: async () => {}, config: { server: { port: 7461 } } });

const roots = [];
const scratch = () => { const dir = mkdtempSync(join(tmpdir(), 'cot-long-hold-')); roots.push(dir); return dir; };

/** Run `run` on node:test's mock clock (1 s a step, at most `limitMs`), its console lines and exit code kept apart. */
async function onMockClock(run, { limitMs = 90 * MINUTE } = {}) {
  const saved = { exitCode: process.exitCode, log: console.log, error: console.error };
  const said = [];
  console.log = (...parts) => { said.push(parts.join(' ')); };
  console.error = (...parts) => { said.push(parts.join(' ')); };
  process.exitCode = undefined;
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 0 });
  try {
    let ended = null;
    run().then((value) => { ended = { value }; }, (error) => { ended = { error }; });
    for (let clock = 0; !ended && clock <= limitMs; clock += SECOND) {
      for (let turn = 0; turn < 5 && !ended; turn++) await new Promise((next) => setImmediate(next));
      if (!ended) mock.timers.tick(SECOND);
    }
    if (!ended) throw new Error(`the run had not ended after ${limitMs / MINUTE} min on the clock`);
    return { ...ended, exitCode: process.exitCode, said: said.join('\n') };
  } finally {
    mock.timers.reset();
    console.log = saved.log;
    console.error = saved.error;
    process.exitCode = saved.exitCode;
  }
}
/** The hold options a run lays over the tool's own: the stand-in lock, the hold's log, the teardown that kills Chrome. */
const holdFor = ({ lock, chrome, holdLog, graceSeconds }) => ({ lock, log: (line) => holdLog.push(line), teardown: chrome.teardown,
  ...(graceSeconds === undefined ? {} : { graceSeconds }) });
const indexOfEvent = (events, prefix) => events.findIndex((event) => event.startsWith(prefix));

// ---- turret-parent-audit: ids, grace 180 s, an idle page through the yield ------------------------------------------------
const IDS = ['tpa_one', 'tpa_two', 'tpa_three', 'tpa_four'];
async function turretRun({ idMs, graceSeconds, requeue = 'resume', previous = null }) {
  const dir = scratch(), events = [], holdLog = [];
  const lock = standInLock({ waiters: 1, events, requeue });
  const chrome = standInChrome({ events, script: ({ method, url }) => {
    const id = /[?&]id=([^&]+)/.exec(url)?.[1];
    if (method === 'goto') return { ms: SECOND };
    if (method === 'waitForFunction') return { ms: idMs(id) - SECOND };
    return { value: { id, stranded: [], abutting: [], dangling: [] } };
  } });
  const outFile = join(dir, 'turret-parent.json');
  if (previous !== null) writeFileSync(outFile, previous); // a previous run's output
  const runTurretParentAudit = await tools.turret();
  const run = await onMockClock(() => runTurretParentAudit([`--ids=${IDS.join(',')}`], { createServer: standInVite,
    puppeteer: chrome.launcher, outFile, hold: holdFor({ lock, chrome, holdLog, graceSeconds }) }));
  const text = existsSync(outFile) ? readFileSync(outFile, 'utf8') : null;
  return { ...run, events, holdLog: holdLog.join('\n'), rows: text === null ? null : JSON.parse(text), text };
}

// ---- marketing-shots/shoot: scenes, grace 180 s, the Studio page frozen through the yield -------------------------------
const SCENES = ['01_a', '02_b', '03_c', '04_d'];
async function shootRun({ sceneMs, graceSeconds, requeue = 'resume', extra = [], waiters = 1, dir = scratch() }) {
  const events = [], holdLog = [], loaded = [];
  const scenesDir = join(dir, 'scenes'), out = join(dir, 'raw');
  mkdirSync(scenesDir, { recursive: true });
  for (const name of SCENES) writeFileSync(join(scenesDir, `${name}.json`), JSON.stringify({ map: 'verdant', name }));
  const lock = standInLock({ waiters, events, requeue });
  const chrome = standInChrome({ events, script: ({ method, arg }) => {
    if (method !== 'evaluate') return {};
    if (typeof arg === 'number') return { value: { dataURL: PNG } }; // __STUDIO.capture({ width })
    loaded.push(arg.name);
    return { ms: sceneMs(arg.name) }; // __STUDIO.load(scene): the scene's world
  } });
  const args = ['--scenes', scenesDir, '--out', out, '--width', '64', ...extra];
  const shootMarketing = await tools.shoot();
  const run = await onMockClock(() => shootMarketing(args, { createServer: standInVite,
    puppeteer: chrome.launcher, hold: holdFor({ lock, chrome, holdLog, graceSeconds }) }));
  return { ...run, args, events, holdLog: holdLog.join('\n'), loaded, shot: SCENES.filter((name) => existsSync(join(out, `${name}.png`))) };
}

// ---- studio-example-videos: takes, grace 300 s, the Studio page frozen through the yield ----------------------------------
const STAGED = { alpha: { name: 'Alpha' }, bravo: { name: 'Bravo' }, shots: 3, shotTimes: [0, 2900, 6000], durationMs: 6000, effects: 0,
  cameraCues: 0, minimumLeadSeparationM: null };
function studioChrome({ takeMs, events, onCall = null }) {
  return standInChrome({ events, onCall, script: ({ method, arg }) => {
    if (method !== 'evaluate') return {};
    if (Number.isInteger(arg?.index)) return { ms: takeMs(arg.index), value: STAGED }; // the take staged: its map's world
    return { value: { dataURL: PNG } }; // a still captured
  } });
}
const listed = (dir) => {
  const file = join(dir, 'stills.json');
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')).stills.map((still) => `${still.index}:${still.tMs}`) : [];
};
async function studioRun({ takeMs, graceSeconds, args = ['--count', '4', '--stills', '0'], waiters = 1, dir = scratch(), requeue = 'resume' }) {
  const events = [], holdLog = [], staged = [], takes = [];
  const lock = standInLock({ waiters, events, requeue });
  const chrome = studioChrome({ takeMs, events, onCall: ({ method, arg }) => {
    if (method === 'evaluate' && Number.isInteger(arg?.index)) { staged.push(arg.index); takes.push(arg); } } });
  const renderStudioExamples = await tools.studio();
  const run = await onMockClock(() => renderStudioExamples([...args, '--out', dir], { createServer: standInVite,
    puppeteer: chrome.launcher, hold: holdFor({ lock, chrome, holdLog, graceSeconds }) }));
  return { ...run, events, holdLog: holdLog.join('\n'), stills: listed(dir), staged, takes };
}

// ---- (E10) the signal child: one tool, SIGTERM while its first item runs, or while it boots --------------------------------
// (round 4 review) or while it waits in the queue (<tool>-queued), or in a cap yield's re-queue (<tool>-requeue); and the
// signal owner alone, under an open-form tool's way out (open-exit: its last process.exit(failed ? 1 : 0); open-uncaught:
// a queued open nobody catches)
if (process.argv[2] === '--signal-child') {
  const [mode, dir] = process.argv.slice(3);
  const [tool, phase = 'item'] = mode.split('-');
  const events = [];
  let signalled = false;
  // the first item's long call (the id's page, the roster's page, the scene's world, the take's world) never answers;
  // SIGTERM comes during it (boot: while Vite starts, so the browser's launch comes after it and is refused; queued: while
  // the acquire waits; requeue: while the first checkpoint's yield waits to hold again)
  const signalOnce = () => {
    if (signalled) return;
    signalled = true;
    setTimeout(() => process.kill(process.pid, 'SIGTERM'), 20);
  };
  const lock = phase === 'queued' || phase === 'uncaught' ? standInLock({ waiters: 0, events, queued: true, onQueue: signalOnce })
    : phase === 'requeue' ? standInLock({ waiters: 1, events, capMs: 0, requeue: 'wait', onQueue: signalOnce })
      : standInLock({ waiters: 0, events });
  const long = { ms: Infinity };
  const onItem = phase === 'item' || phase === 'list' || phase === 'exit';
  const scripts = {
    turret: ({ method }) => (onItem && method === 'waitForFunction' ? (signalOnce(), long) : {}),
    shoot: ({ method, arg }) => (onItem && method === 'evaluate' && arg?.name ? (signalOnce(), long) : {}),
    studio: ({ method, arg }) => (onItem && method === 'evaluate' && Number.isInteger(arg?.index) ? (signalOnce(), long) : {}),
    open: ({ method }) => (onItem && method === 'goto' ? (signalOnce(), long) : {}),
  };
  const chrome = standInChrome({ events, script: scripts[tool] });
  // Vite comes up once the hold's signal owner has taken the SIGTERM (it sets the exit code first), however late it runs
  const slowVite = async (config) => {
    signalOnce();
    for (let wait = 0; process.exitCode !== 143 && wait < 3000; wait++) await new Promise((done) => setTimeout(done, 10));
    return standInVite(config);
  };
  // (round 5 U9) what serves and draws prints a [stand-in] line when it starts: a queued child's tool starts neither
  const vite = phase === 'boot' ? slowVite : standInVite;
  const deps = { createServer: async (config) => { console.error('[stand-in] Vite started'); return vite(config); },
    puppeteer: { launch: async (options) => { console.error('[stand-in] Chrome launched'); return chrome.launcher.launch(options); } },
    hold: { lock, log: (line) => console.error(line), teardown: chrome.teardown } };
  // each tool's own command-line entry, its stand-ins aside
  if (tool === 'turret') {
    const runTurretParentAudit = await tools.turret();
    await runTurretParentAudit(phase === 'list' ? [] : ['--ids=tpa_one,tpa_two'], { ...deps, outFile: join(dir, 'turret-parent.json') });
  } else if (tool === 'shoot') {
    const shootMarketing = await tools.shoot();
    const scenesDir = join(dir, 'scenes');
    mkdirSync(scenesDir);
    for (const name of ['01_a', '02_b']) writeFileSync(join(scenesDir, `${name}.json`), JSON.stringify({ map: 'verdant', name }));
    await shootMarketing(['--scenes', scenesDir, '--out', join(dir, 'raw'), '--width', '64'], deps);
    process.exit();
  } else if (tool === 'studio') {
    const renderStudioExamples = await tools.studio();
    // the features collection: its pool reads no map config (the duels' would cost ~0.35 s of CPU in each child)
    await renderStudioExamples(['--collection', 'features', '--count', '2', '--stills', '0', '--out', dir], deps);
  } else if (phase === 'exit') {
    // an open-form tool's shape (screenshot.mjs and the others): its hold, its page call cut by the hold's teardown, the
    // finally's release, then its own exit
    const hold = await openCaptureHold({ label: 'open-exit', ...deps.hold });
    let failed = false;
    const browser = await chrome.launcher.launch();
    try {
      await (await browser.newPage()).goto('http://localhost:7461/');
    } catch (error) {
      failed = true;
      console.error(`[open-exit] FAILED: ${error.message}`);
    } finally {
      await browser.close();
      await hold.release();
    }
    process.exit(failed ? 1 : 0);
  } else {
    // a queued open nobody catches: its rejection ends the process
    await openCaptureHold({ label: 'open-uncaught', ...deps.hold });
  }
} else {
  const failed = [];
  const check = async (name, run) => {
    try { await run(); } catch (error) { failed.push(`${name}: ${String(error?.message ?? error).split('\n').slice(0, 6).join('\n    ')}`); }
  };
  // (round 5 U9) each turret child's output file holds a previous run's row first
  const PREVIOUS = `${JSON.stringify([{ id: 'tpa_previous', stranded: [], abutting: [], dangling: [] }], null, 1)}`;
  const signalChild = (tool) => new Promise((done) => {
    const dir = scratch();
    if (tool.startsWith('turret')) writeFileSync(join(dir, 'turret-parent.json'), PREVIOUS);
    const child = spawn(process.execPath, [SELF, '--signal-child', tool, dir], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => { output += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { output += chunk; });
    const timer = setRealTimeout(() => child.kill('SIGKILL'), 120 * SECOND);
    child.once('close', (code, signal) => { clearRealTimeout(timer); done({ code, signal, output, dir }); });
  });
  try {
    // the signal children start first (each imports its tool); the mock-clock cases run meanwhile
    const children = Object.fromEntries(['turret', 'turret-list', 'turret-boot', 'shoot', 'shoot-boot', 'studio', 'studio-boot',
      'turret-queued', 'shoot-queued', 'studio-queued', 'turret-requeue', 'shoot-requeue', 'studio-requeue', 'open-exit', 'open-uncaught']
      .map((tool) => [tool, signalChild(tool)]));

    // ---- turret-parent-audit -------------------------------------------------------------------------------------------
    await check('turret-parent-audit yield', async () => {
      // 450 s an id: tpa_three runs 900-1350 s, 150 s past the cap at 1200 s
      const run = await turretRun({ idMs: () => 450 * SECOND });
      assert.equal(run.error, undefined, `no throw (${run.error?.message})`);
      assert.deepEqual(run.rows.map((row) => row.id), IDS, `every id audited (${run.said})`);
      assert.ok(run.rows.every((row) => !row.error), 'no ERROR row');
      assert.ok(run.events.includes('yield@1350') && run.events.includes('held again@1470'),
        `the id in flight at the cap finished 150 s on, inside the 180-s grace, and the next checkpoint yielded (${run.events.join(' ')})`);
      assert.doesNotMatch(run.holdLog, /asking the work to stop/, 'the hold was never stopped');
      assert.ok(!run.exitCode, `exit 0 (${run.exitCode})`);
    });
    await check('turret-parent-audit control', async () => {
      const run = await turretRun({ idMs: () => 450 * SECOND, graceSeconds: 60 });
      assert.match(run.holdLog, /no checkpoint within 60 s/, 'with the default grace the hold is stopped at 1260 s');
      assert.deepEqual(run.rows.map((row) => row.id), IDS.slice(0, 2), 'the id the teardown cut is left, not an ERROR row');
      assert.match(run.said, /--ids=tpa_three,tpa_four/, 'the finishing run is named');
      assert.equal(run.exitCode, 3);
    });
    await check('turret-parent-audit stop', async () => {
      // tpa_three runs 900-1450 s: past the grace (stopped at 1380 s), done before the teardown (1560 s)
      const run = await turretRun({ idMs: (id) => (id === 'tpa_three' ? 550 : 450) * SECOND });
      assert.match(run.holdLog, /00:23:00\] hold cap: no checkpoint within 180 s; asking the work to stop/, `stopped at 1380 s (${run.holdLog})`);
      assert.doesNotMatch(run.holdLog, /tearing down/, 'the run ended inside the second grace: no teardown');
      assert.deepEqual(run.rows.map((row) => row.id), IDS.slice(0, 3), 'the id that finished after the stop is kept');
      assert.ok(run.rows.every((row) => !row.error), 'no ERROR row');
      assert.match(run.said, /--ids=tpa_four\b/, 'the finishing run names the id left');
      assert.equal(run.exitCode, 3, 'ids left: exit 3');
    });
    // (round 5 U9 review) a cap stop with no signal before any id: tpa_one runs 0-1500 s, the hold is stopped at 1260 s
    // (the default 60-s grace) and its teardown at 1320 s cuts the id. Nothing audited, so the previous output stays,
    // and the run still exits 3 (every id left, the finishing run named); the signal children's 143 hid this path's code
    await check('turret-parent-audit stop before any id', async () => {
      const run = await turretRun({ idMs: () => 1500 * SECOND, graceSeconds: 60, previous: PREVIOUS });
      assert.equal(run.error, undefined, `no throw (${run.error?.message})`);
      assert.match(run.holdLog, /00:21:00\] hold cap: no checkpoint within 60 s; asking the work to stop/, run.holdLog);
      assert.match(run.holdLog, /00:22:00\] still running 60 s past the stop: tearing down/, run.holdLog);
      assert.equal(run.text, PREVIOUS, `nothing audited: the previous output kept (${run.said})`);
      assert.match(run.said, /4 id\(s\) left[^\n]*--ids=tpa_one,tpa_two,tpa_three,tpa_four \(nothing audited/, run.said);
      assert.equal(run.exitCode, 3, `every id left: exit 3, the run unfinished (${run.exitCode})`);
    });

    // ---- marketing-shots/shoot -----------------------------------------------------------------------------------------
    await check('shoot yield', async () => {
      const run = await shootRun({ sceneMs: () => 450 * SECOND });
      assert.equal(run.error, undefined, `no throw (${run.error?.message})`);
      assert.deepEqual(run.shot, SCENES, `every scene shot (${run.said})`);
      const [frozen, released, again, thawed] = ['frozen@1350', 'release@1350', 'held again@1470', 'active@1470'].map((event) => run.events.indexOf(event));
      assert.ok(frozen >= 0 && frozen < released && released < again && again < thawed,
        `03_c finished inside the 180-s grace; the page frozen before the release and thawed once held again (${run.events.join(' ')})`);
      assert.equal(indexOfEvent(run.events, 'evaluate while frozen'), -1, 'no page call while frozen');
      assert.doesNotMatch(run.holdLog, /asking the work to stop/);
      assert.ok(!run.exitCode, `exit 0 (${run.exitCode})`);
    });
    await check('shoot control', async () => {
      const run = await shootRun({ sceneMs: () => 450 * SECOND, graceSeconds: 60 });
      assert.match(run.holdLog, /no checkpoint within 60 s/);
      assert.deepEqual(run.shot, SCENES.slice(0, 2), 'the scene the teardown cut is left');
      assert.match(run.said, /--match 03_c,04_d/);
      assert.doesNotMatch(run.said, /FAILED 03_c/, 'left, not FAILED');
      assert.equal(run.exitCode, 3, `scenes left: exit 3 (${run.exitCode})`);
    });
    await check('shoot stop', async () => {
      const run = await shootRun({ sceneMs: (name) => (name === '03_c' ? 550 : 450) * SECOND });
      assert.match(run.holdLog, /00:23:00\] hold cap: no checkpoint within 180 s; asking the work to stop/, run.holdLog);
      assert.deepEqual(run.shot, SCENES.slice(0, 3), 'the scene that finished after the stop is written');
      assert.match(run.said, /--match 04_d\b/);
      assert.equal(run.exitCode, 3, `scenes left: exit 3, not 1 as for a FAILED scene (${run.exitCode})`);
    });

    // ---- studio-example-videos -------------------------------------------------------------------------------------------
    await check('studio-example-videos yield', async () => {
      // 483 s a take: take 3 runs 966-1449 s, 249 s past the cap (past 180 s, inside the 300-s grace)
      const run = await studioRun({ takeMs: () => 483 * SECOND });
      assert.equal(run.error, undefined, `no throw (${run.error?.message})`);
      assert.deepEqual(run.stills, ['1:0', '2:0', '3:0', '4:0'], `every take's still listed (${run.said})`);
      // (round 5 U6 review) the default collection's takes are the duel pool's, which loads with the run
      const { DUEL_SCENARIOS } = await import('./studio-example-scenarios.mjs');
      assert.deepEqual(run.takes, DUEL_SCENARIOS.slice(0, 4), 'the takes are the duel pool\'s first four');
      const [frozen, released, again, thawed] = ['frozen@1449', 'release@1449', 'held again@1569', 'active@1569'].map((event) => run.events.indexOf(event));
      assert.ok(frozen >= 0 && frozen < released && released < again && again < thawed,
        `the take in flight finished inside the 300-s grace, then the yield froze and thawed the page (${run.events.join(' ')})`);
      assert.equal(indexOfEvent(run.events, 'evaluate while frozen'), -1, 'no page call while frozen');
      assert.doesNotMatch(run.holdLog, /asking the work to stop/);
      assert.ok(!run.exitCode, `exit 0 (${run.exitCode})`);
    });
    await check('studio-example-videos control', async () => {
      const run = await studioRun({ takeMs: () => 483 * SECOND, graceSeconds: 60 });
      assert.match(run.holdLog, /no checkpoint within 60 s/);
      assert.deepEqual(run.stills, ['1:0', '2:0'], 'the take the teardown cut is left');
      assert.match(run.said, /--only 3,4/);
      assert.equal(run.error, undefined, `a stop is no failure (${run.error?.message})`);
      assert.equal(run.exitCode, 3);
    });
    await check('studio-example-videos stop', async () => {
      // take 3 runs 966-1649 s: stopped at 1500 s, done before the teardown (1800 s)
      const run = await studioRun({ takeMs: (index) => (index === 3 ? 683 : 483) * SECOND });
      assert.match(run.holdLog, /00:25:00\] hold cap: no checkpoint within 300 s; asking the work to stop/, run.holdLog);
      assert.deepEqual(run.stills, ['1:0', '2:0', '3:0'], 'the take that finished after the stop is listed');
      assert.match(run.said, /--only 4\b/);
      assert.equal(run.error, undefined, `a stop is no failure (${run.error?.message})`);
      assert.equal(run.exitCode, 3, `takes left: exit 3 (${run.exitCode})`);
    });
    // (E10) the finishing run a stop names keeps what the first run listed; a re-rendered take replaces its own stills
    await check('studio-example-videos stills listing', async () => {
      const dir = scratch(), quick = () => SECOND;
      const first = await studioRun({ takeMs: quick, waiters: 0, dir, args: ['--only', '1', '--stills', '0'] });
      assert.equal(first.error, undefined, first.error?.message);
      const finishing = await studioRun({ takeMs: quick, waiters: 0, dir, args: ['--only', '2,3', '--stills', '0'] });
      assert.equal(finishing.error, undefined, finishing.error?.message);
      assert.deepEqual(finishing.stills, ['1:0', '2:0', '3:0'], 'the first run\'s take stays listed');
      const again = await studioRun({ takeMs: quick, waiters: 0, dir, args: ['--only', '2', '--stills', '0,500'] });
      assert.deepEqual(again.stills, ['1:0', '2:0', '2:500', '3:0'], 'take 2\'s stills replaced, in index order');
    });

    // ---- (round 4 review) a cap yield whose re-queue fails without a signal: the run is stopped, the rest left ---------------
    // the stand-in's re-queue runs out 120 s after the yield (the real wait is the tool's acquire timeout); the hold stops the
    // work at once (nothing is held) and runHeldItem's rejected checkpoint leaves the item it came before
    await check('turret-parent-audit re-queue refused', async () => {
      const run = await turretRun({ idMs: () => 450 * SECOND, requeue: 'refuse' });
      assert.match(run.holdLog, /the cap yield did not hold again \(stand-in: the re-queue's wait ran out\); stopping the work/, run.holdLog);
      assert.deepEqual(run.rows.map((row) => row.id), IDS.slice(0, 3), 'the ids before the yield are written, none an ERROR row');
      assert.match(run.said, /1 id\(s\) left[^\n]*--ids=tpa_four\b/, `the id left is named (${run.said})`);
      assert.equal(run.exitCode, 3, `ids left: exit 3 (${run.exitCode})`);
    });
    await check('shoot re-queue refused', async () => {
      const run = await shootRun({ sceneMs: () => 450 * SECOND, requeue: 'refuse' });
      assert.match(run.holdLog, /the cap yield did not hold again/, run.holdLog);
      assert.deepEqual(run.shot, SCENES.slice(0, 3));
      assert.match(run.said, /1 scene\(s\) left; finish with the same options and --match 04_d\b/, run.said);
      assert.doesNotMatch(run.said, /FAILED|FATAL/, 'left, not failed');
      assert.equal(run.exitCode, 3, `scenes left: exit 3 (${run.exitCode})`);
    });
    await check('studio-example-videos re-queue refused', async () => {
      const run = await studioRun({ takeMs: () => 483 * SECOND, requeue: 'refuse' });
      assert.match(run.holdLog, /the cap yield did not hold again/, run.holdLog);
      assert.equal(run.error, undefined, `a stop is no failure (${run.error?.message})`);
      assert.deepEqual(run.stills, ['1:0', '2:0', '3:0']);
      assert.match(run.said, /1 take\(s\) left; finish with the same options and --only 4\b/, run.said);
      assert.equal(run.exitCode, 3, `takes left: exit 3 (${run.exitCode})`);
    });

    // ---- (round 4 review) the finishing run a stop names runs only what was left, whatever selection the run had -----------
    await check('shoot finishing run', async () => {
      const dir = scratch();
      // every scene name holds a 0: --match 0 selects all four; 03_c runs past the grace, 04_d is left
      const stopped = await shootRun({ dir, extra: ['--match', '0'], sceneMs: (name) => (name === '03_c' ? 550 : 450) * SECOND });
      const named = /finish with the same options and (--match \S+)/.exec(stopped.said)?.[1];
      assert.equal(named, '--match 04_d', stopped.said);
      const finishing = await shootRun({ dir, extra: ['--match', '0', ...named.split(' ')], waiters: 0, sceneMs: () => SECOND });
      assert.deepEqual(finishing.loaded, ['04_d'], `the named run shoots only the scene left (${finishing.said})`);
      assert.ok(!finishing.exitCode, `exit 0 (${finishing.exitCode})`);
    });
    await check('studio-example-videos finishing run', async () => {
      const dir = scratch();
      const args = ['--only', '1,2,3,4', '--stills', '0'];
      const stopped = await studioRun({ dir, args, takeMs: (index) => (index === 3 ? 683 : 483) * SECOND });
      const named = /finish with the same options and (--only \S+)/.exec(stopped.said)?.[1];
      assert.equal(named, '--only 4', stopped.said);
      const finishing = await studioRun({ dir, args: [...args, ...named.split(' ')], waiters: 0, takeMs: () => SECOND });
      assert.deepEqual(finishing.staged, [4], `the named run renders only the take left (${finishing.said})`);
      assert.deepEqual(finishing.stills, ['1:0', '2:0', '3:0', '4:0'], 'and stills.json lists all four');
    });
    // (round 5 U9 review) A finishing run through an npm script: `npm run <script> -- --only <left>` adds the flags to
    // the end of the script's command, so they reach the tool only when it is the script's last command (after an &&,
    // ;, ||, |, a newline or a background & they go to the next one, after a # comment they are lost; a redirect's 2>&1
    // splits nothing). A script names the tool by its path, however node is called (`node ./tools/…`,
    // `node --max-old-space-size=… tools/…`, an absolute path, a redirect right after it); round 5's first form matched
    // only `node tools/<file>`, and a script spelt another way went unchecked. (round 6 V10) A script that names the
    // tool's file more often than that match reads it (a quoted path, a cd into tools/, a backtick, a variable holding
    // the file name; a name is read with the shell's quoting taken out, so `studio\-example…`, or a line continuation
    // or an empty $'' or $"" inside it, names it too, while an expansion inside it is not read) fails here; so does
    // one that calls a script that runs a tool (`npm run <it> -- …` or concurrently's `npm:<it>` hands the flags to
    // npm, or to that script's last command, which this check never reads), and one of either kind that holds a
    // quote, a backtick, a parenthesis, a $ or a backslash (`sh -c '…'`, `$(…)`, `bash -c node\ tools/…`: the outer
    // command takes the flags). A new spelling is read or the match widened. The tool's first read is the one that
    // must come last, so a later mention of its path (`&& echo tools/<file>`) cannot stand in for the call, and an
    // earlier one (a `test -f tools/<file>` guard, an echo) is taken as the call and fails closed. A baked selection
    // is harmless: the last --only / --match wins, and what a stop leaves is inside it. Then reels:render's baked
    // flags (its --out set aside: this receipt writes to a scratch folder), a selection typed after them and the
    // finishing run's appended one: the baked collection and size hold, the appended --only selects, and the take is
    // the battle-reel pool's (round 5 U6: the pool loads with the run)
    await check('npm finishing run', async () => {
      const finishing = ['tools/studio-example-videos.mjs', 'tools/marketing-shots/shoot.mjs'];
      const escaped = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const toolAt = (file, flags) => new RegExp(String.raw`(?:^|\s)(?:\S*/)?${escaped(file)}(?=$|[\s;&|<>])`, flags);
      // a name, not a spelling: each mention of a tool's file name whatever stands beside it, and of a script's name
      const count = (pattern, command) => command.match(pattern)?.length ?? 0;
      const fileIn = (file) => new RegExp(String.raw`(?<![\w.-])${escaped(file.split('/').at(-1))}(?![\w.-])`, 'g');
      // a runner's prefix still names the script (concurrently's npm:<it>, yarn:<it>); a longer name after it does not
      const scriptIn = (name) => new RegExp(String.raw`(?<![\w.-])${escaped(name)}(?![\w:.-])`, 'g');
      // the shell's quoting taken out (studio\-example…, stu"di"o-…, reels\:render; a line continuation and an empty
      // $'' or $"" go whole, the $ too where a continuation stands between it and its quote), not its expansions (a
      // variable, a glob, a \x escape); a caller that holds any is refused
      const unquoted = (command) => command.replace(/\\(?:\n|(.))|\$(?:\\\n)*['"]|['"]/gs, '$1');
      const unread = (scripts) => {
        const callers = new Set(); // the scripts that name a tool, then (to a fixed point) the ones that name one of those
        for (let grew = true; grew;) {
          grew = false;
          for (const [name, command] of Object.entries(scripts)) {
            const text = unquoted(command); // a quote or a backslash inside a name cannot hide it
            if (callers.has(name) || !(finishing.some((file) => count(fileIn(file), text))
              || [...callers].some((caller) => count(scriptIn(caller), text)))) continue;
            callers.add(name);
            grew = true;
          }
        }
        return Object.keys(scripts).filter((name) => callers.has(name)
          && (/['"`()$\\]/.test(scripts[name]) // a nested call (sh -c '…', $(…), `…`, bash -c node\ …) reads as last
            || finishing.some((file) => count(fileIn(file), scripts[name]) > count(toolAt(file, 'g'), scripts[name]))
            || [...callers].some((caller) => caller !== name && count(scriptIn(caller), scripts[name]))));
      };
      const runners = (scripts) => Object.entries(scripts).flatMap(([name, command]) => finishing
        .filter((file) => toolAt(file).test(command))
        .map((file) => {
          const commands = command.split(/&&|\|\||[;|\n]|(?<![<>])&(?!>)|(?<!\S)#/).map((part) => part.trim());
          const at = commands.findIndex((part) => toolAt(file).test(part)); // the first read: a later mention is no call
          const call = toolAt(file).exec(commands[at]);
          return { name, last: at === commands.length - 1,
            args: commands[at].slice(call.index + call[0].length).trim().split(/\s+/).filter(Boolean) };
        }));
      const { scripts } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
      const found = runners(scripts);
      const reels = found.find(({ name }) => name === 'reels:render');
      assert.ok(reels && ['studio:features:render', 'studio:examples'].every((script) => found.some(({ name }) => name === script)),
        `the scripts that run the tools are found (${found.map(({ name }) => name)})`);
      assert.deepEqual(found.filter(({ last }) => !last).map(({ name }) => name), [],
        'each script runs its tool last, so the flags after -- reach it (the first mention of its path is the call)');
      assert.deepEqual(unread(scripts), [], 'every script that names a tool, or a script that runs one, is one the check '
        + 'reads (a new spelling: read it in toolAt; a call through another script, or one holding a quote, backtick, '
        + 'parenthesis, $ or backslash: call the tool directly, or change the refusal in unread())');
      // outer before inner: the callers are found to a fixed point, not in one pass
      assert.deepEqual(unread({ ...scripts, 'planted:quoted': 'node "tools/studio-example-videos.mjs" --only 2 && echo done',
        'planted:cd': 'cd tools/marketing-shots && node shoot.mjs --match 01 && echo done',
        'planted:backtick': 'node `echo tools/studio-example-videos.mjs` && echo done',
        'planted:variable': 'T=studio-example-videos.mjs; node tools/$T --only 2 && echo done',
        'planted:echo': 'cd tools && node studio-example-videos.mjs --only 2 && echo tools/studio-example-videos.mjs',
        'planted:cd-tight': 'cd tools && node studio-example-videos.mjs>render.log',
        'planted:sh': "sh -c 'node tools/studio-example-videos.mjs --collection battle-reels'",
        'planted:substitution': 'echo $(node tools/studio-example-videos.mjs --only 2)',
        'planted:backslash': 'bash -c node\\ tools/studio-example-videos.mjs',
        'planted:escaped-name': 'node tools/studio\\-example-videos.mjs --only 2 && echo done',
        'planted:split-name': 'node tools/studio"-"example-videos.mjs --only 2 && echo done',
        'planted:escaped-runner': 'npm run reels\\:render && echo done',
        'planted:continued-name': 'node tools/studio-example-\\\nvideos.mjs --only 2 && echo done',
        'planted:continued-runner': 'npm run reels:\\\nrender && echo done',
        'planted:ansi-c-name': "node tools/studio-example-$''videos.mjs --only 2 && echo done",
        'planted:locale-runner': 'npm run reels:$""render && echo done',
        'planted:continued-ansi-c': "node tools/studio-example-$\\\n''videos.mjs --only 2 && echo done",
        'planted:continued-locale-runner': 'npm run reels:$\\\n""render && echo done',
        'planted:outer': 'npm run planted:inner -- --only 2',
        'planted:inner': 'npm run -s reels:render && echo done',
        'planted:concurrently': 'concurrently "npm:reels:render" "npm:reels:publish"',
        'planted:read': 'node ./tools/studio-example-videos.mjs && echo done',
        'planted:tight': 'node tools/studio-example-videos.mjs>render.log && echo done' }),
        ['planted:quoted', 'planted:cd', 'planted:backtick', 'planted:variable', 'planted:echo', 'planted:cd-tight', 'planted:sh',
          'planted:substitution', 'planted:backslash', 'planted:escaped-name', 'planted:split-name',
          'planted:escaped-runner', 'planted:continued-name', 'planted:continued-runner', 'planted:ansi-c-name',
          'planted:locale-runner', 'planted:continued-ansi-c', 'planted:continued-locale-runner', 'planted:outer',
          'planted:inner', 'planted:concurrently'],
        'a script naming a tool in a spelling the check cannot read, calling a script that runs one, or nesting the call is '
        + 'refused, not skipped');
      // the check reads planted scripts: a tool that is not its script's last command, in each spelling, is found
      const planted = runners({ ...scripts, 'reels:render': `${scripts['reels:render']} && echo rendered`,
        'planted:dot': 'node ./tools/studio-example-videos.mjs --collection duels && echo done',
        'planted:flag': 'node --max-old-space-size=8192 tools/studio-example-videos.mjs; echo done',
        'planted:pipe': 'node /repo/tools/marketing-shots/shoot.mjs --match 01 | tee shoot.log',
        'planted:background': 'node tools/studio-example-videos.mjs --only 2 & wait',
        'planted:last': 'npm run -s prepare && node ./tools/marketing-shots/shoot.mjs --match 01',
        'planted:redirect': 'node tools/studio-example-videos.mjs --only 2 2>&1',
        'planted:other': 'node tools/studio-example-videos.mjs.bak && node tools/studio-example-videos-x.mjs && echo done',
        'planted:newline': 'node tools/studio-example-videos.mjs --only 2\necho done',
        'planted:tight': 'node tools/studio-example-videos.mjs>render.log && echo done',
        'planted:comment': 'node tools/marketing-shots/shoot.mjs --match 01 # the flags land here',
        'planted:mention': 'node tools/studio-example-videos.mjs --only 2 && echo tools/studio-example-videos.mjs' });
      assert.deepEqual(planted.filter(({ last }) => !last).map(({ name }) => name), ['reels:render', 'planted:dot', 'planted:flag', 'planted:pipe',
        'planted:background', 'planted:newline', 'planted:tight', 'planted:comment', 'planted:mention'],
        `a planted command after the tool is found in each spelling (${JSON.stringify(planted)})`);
      assert.deepEqual(planted.find(({ name }) => name === 'planted:last')?.args, ['--match', '01'], 'a tool run last is read with its flags');
      assert.equal(planted.find(({ name }) => name === 'planted:redirect')?.last, true, 'a redirect after the tool keeps it last');
      assert.ok(!planted.some(({ name }) => name === 'planted:other'), 'another file whose name starts with the tool\'s is not the tool');
      const dir = scratch(), outAt = reels.args.indexOf('--out');
      const bakedArgs = outAt < 0 ? reels.args : [...reels.args.slice(0, outAt), ...reels.args.slice(outAt + 2)];
      const run = await studioRun({ dir, waiters: 0, takeMs: () => SECOND, args: [...bakedArgs, '--stills', '0', '--only', '2,3', '--only', '3'] });
      assert.equal(run.error, undefined, run.error?.message);
      const listing = JSON.parse(readFileSync(join(dir, 'stills.json'), 'utf8'));
      assert.deepEqual([listing.collection, listing.renderer], ['battle-reels', { width: 1280, height: 720 }], 'the baked flags hold');
      assert.deepEqual(run.staged, [3], `the appended --only selects, not the typed one before it (${run.said})`);
      const { BATTLE_REEL_SCENARIOS } = await import('./studio-example-scenarios.mjs');
      assert.deepEqual(run.takes, [BATTLE_REEL_SCENARIOS.find((scenario) => scenario.index === 3)], 'the take is the battle-reel pool\'s take 3');
    });

    // ---- (round 4 review) tools/held-items.mjs's rules on their own --------------------------------------------------------
    await check('held-items rules', async () => {
      const saved = process.exitCode;
      try {
        const codeAfter = (start, outcome) => { process.exitCode = start; return heldRunExitCode(outcome); };
        assert.equal(codeAfter(undefined, {}), 0, 'nothing failed or left: 0');
        assert.equal(codeAfter(undefined, { left: true }), 3, 'items left: 3');
        assert.equal(codeAfter(undefined, { failed: true, left: true }), 1, 'a failure outranks items left');
        assert.equal(codeAfter(3, { failed: true }), 1, 'a failure after markUnitsLeft\'s 3 (battle-memory-probe: a limit failed, scenarios left): 1');
        assert.equal(codeAfter(143, { failed: true }), 143, 'a signal\'s 128 + n stands over a failure');
        assert.equal(codeAfter(130, { left: true }), 130, 'and over items left');
        assert.equal(codeAfter(1, { left: true }), 1, 'a failure stands over items left');
      } finally {
        process.exitCode = saved;
      }
      // runHeldItem's rejected checkpoint: a yield stopped (its re-queue withdrawn or refused) leaves the item; a checkpoint
      // that rejects with the hold unstopped rejects
      const stoppedHold = new AbortController();
      const stoppedRun = await runHeldItem({ signal: stoppedHold.signal, checkpoint: async () => {
        stoppedHold.abort(new Error('the cap yield did not hold again'));
        throw new Error('re-queue refused');
      } }, () => assert.fail('the item never runs'));
      assert.deepEqual(stoppedRun, { outcome: 'left', why: 'the cap yield did not hold again' });
      const liveHold = new AbortController();
      await assert.rejects(runHeldItem({ signal: liveHold.signal, checkpoint: async () => { throw new Error('lock lost'); } }, () => 1), /lock lost/);
      assert.equal(heldStopWhy(stoppedHold.signal), 'the cap yield did not hold again');
    });

    // ---- (E10) a signal during an item: the way out runs and the process exits 128 + n ------------------------------------
    const nothingRan = /SIGTERM: the process is stopping, so the capture hold ends before the lock was held: nothing ran; run it again/;
    const expected = { turret: /--ids=tpa_one,tpa_two/, 'turret-list': /before the roster was read/,
      'turret-boot': /2 id\(s\) left[^\n]*--ids=tpa_one,tpa_two \(nothing audited/, shoot: /--match 01_a,02_b/,
      'shoot-boot': /--match 01_a,02_b/, studio: /--only 1,2/, 'studio-boot': /--only 1,2/,
      'turret-queued': nothingRan, 'shoot-queued': nothingRan, 'studio-queued': nothingRan,
      'turret-requeue': /2 id\(s\) left[^\n]*--ids=tpa_one,tpa_two/, 'shoot-requeue': /2 scene\(s\) left[^\n]*--match 01_a,02_b/,
      'studio-requeue': /2 take\(s\) left[^\n]*--only 1,2/,
      'open-exit': /\[open-exit\] FAILED: Protocol error/, 'open-uncaught': /SIGTERM: leaving the queue/ };
    for (const [tool, child] of Object.entries(children)) {
      await check(`${tool} SIGTERM`, async () => {
        const { code, signal, output, dir } = await child;
        assert.equal(signal, null, `${tool}: ended by its own exit, not killed (${signal})\n${output.slice(-1500)}`);
        assert.match(output, expected[tool], `${tool}: the items left are named\n${output.slice(-1500)}`);
        assert.equal(code, 143, `${tool}: exits 128 + 15 after its way out, not ${code}\n${output.slice(-1500)}`);
        // (round 5 U9) a tool queued at the signal returns on openHeldRun's null: it starts no server or browser (the
        // line and the 143 above hold for a tool that ran on past the null too)
        if (tool.endsWith('-queued')) {
          assert.doesNotMatch(output, /\[stand-in\]|TypeError|^\s+at /m, `${tool}: nothing starts after the queued open's null\n${output.slice(-1500)}`);
        }
        // (round 5 U9) no turret child audits an id, so the previous run's output stays (a stop before any id wrote [])
        if (tool.startsWith('turret')) {
          assert.equal(readFileSync(join(dir, 'turret-parent.json'), 'utf8'), PREVIOUS, `${tool}: nothing audited, the previous output kept\n${output.slice(-1500)}`);
        }
      });
    }
    assert.deepEqual(failed, [], `long hold users:\n  ${failed.join('\n  ')}`);
    console.log('long-hold-users.selftest: turret-parent-audit, marketing-shots/shoot and studio-example-videos yield at the cap inside '
      + 'their graces (180 s, 180 s, 300 s), are stopped past them or by a refused re-queue, keep what finished, name what is left '
      + '(exit 3) in a finishing run that runs only that, exit 128 + n on a signal (queued, held, re-queued, booting), and a --stills '
      + 'finishing run keeps the listing; the signal owner keeps 128 + n over an open-form tool\'s own exit; a stop before any id '
      + 'keeps turret-parent-audit\'s output, a queued tool starts nothing, and an npm script\'s finishing run reaches its tool');
  } finally {
    for (const dir of roots) rmSync(dir, { recursive: true, force: true });
  }
}
