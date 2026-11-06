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
//            (turret-parent-audit set 3 over it, shoot exited 1, studio-example-videos rethrew: 1).
// No real browser, server or lock starts; the real Chrome runs stay the owner's (manualRecommended).
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mock } from 'node:test';
import { fileURLToPath } from 'node:url';
import { shootMarketing } from './marketing-shots/shoot.mjs';
import { renderStudioExamples } from './studio-example-videos.mjs';
import { runTurretParentAudit } from './turret-parent-audit.mjs';

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
 *  `signal` withdraws), held again, afterResume. */
function standInLock({ waiters, events }) {
  let held = false, since = 0;
  const lock = {
    get nested() { return false; },
    get held() { return held; },
    get heldCapMs() { return held ? CAP_MS : null; },
    async acquire() { held = true; since = Date.now(); events.push(`hold@${at()}`); },
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
      if (Date.now() - since < CAP_MS || !waiters) return { yielded: false };
      if (beforeYield) await beforeYield();
      lock.release();
      events.push(`yield@${at()}`);
      await new Promise((resume, withdraw) => {
        const timer = setTimeout(resume, REQUEUE_MS);
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
async function turretRun({ idMs, graceSeconds }) {
  const dir = scratch(), events = [], holdLog = [];
  const lock = standInLock({ waiters: 1, events });
  const chrome = standInChrome({ events, script: ({ method, url }) => {
    const id = /[?&]id=([^&]+)/.exec(url)?.[1];
    if (method === 'goto') return { ms: SECOND };
    if (method === 'waitForFunction') return { ms: idMs(id) - SECOND };
    return { value: { id, stranded: [], abutting: [], dangling: [] } };
  } });
  const outFile = join(dir, 'turret-parent.json');
  const run = await onMockClock(() => runTurretParentAudit([`--ids=${IDS.join(',')}`], { createServer: standInVite,
    puppeteer: chrome.launcher, outFile, hold: holdFor({ lock, chrome, holdLog, graceSeconds }) }));
  const rows = existsSync(outFile) ? JSON.parse(readFileSync(outFile, 'utf8')) : null;
  return { ...run, events, holdLog: holdLog.join('\n'), rows };
}

// ---- marketing-shots/shoot: scenes, grace 180 s, the Studio page frozen through the yield -------------------------------
const SCENES = ['01_a', '02_b', '03_c', '04_d'];
async function shootRun({ sceneMs, graceSeconds }) {
  const dir = scratch(), events = [], holdLog = [];
  const scenesDir = join(dir, 'scenes'), out = join(dir, 'raw');
  mkdirSync(scenesDir);
  for (const name of SCENES) writeFileSync(join(scenesDir, `${name}.json`), JSON.stringify({ map: 'verdant', name }));
  const lock = standInLock({ waiters: 1, events });
  const chrome = standInChrome({ events, script: ({ method, arg }) => {
    if (method !== 'evaluate') return {};
    if (typeof arg === 'number') return { value: { dataURL: PNG } }; // __STUDIO.capture({ width })
    return { ms: sceneMs(arg.name) }; // __STUDIO.load(scene): the scene's world
  } });
  const run = await onMockClock(() => shootMarketing(['--scenes', scenesDir, '--out', out, '--width', '64'], { createServer: standInVite,
    puppeteer: chrome.launcher, hold: holdFor({ lock, chrome, holdLog, graceSeconds }) }));
  return { ...run, events, holdLog: holdLog.join('\n'), shot: SCENES.filter((name) => existsSync(join(out, `${name}.png`))) };
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
async function studioRun({ takeMs, graceSeconds, args = ['--count', '4', '--stills', '0'], waiters = 1, dir = scratch() }) {
  const events = [], holdLog = [];
  const lock = standInLock({ waiters, events });
  const chrome = studioChrome({ takeMs, events });
  const run = await onMockClock(() => renderStudioExamples([...args, '--out', dir], { createServer: standInVite,
    puppeteer: chrome.launcher, hold: holdFor({ lock, chrome, holdLog, graceSeconds }) }));
  return { ...run, events, holdLog: holdLog.join('\n'), stills: listed(dir) };
}

// ---- (E10) the signal child: one tool, SIGTERM while its first item runs --------------------------------------------------
if (process.argv[2] === '--signal-child') {
  const [tool, dir] = process.argv.slice(3);
  const events = [];
  const lock = standInLock({ waiters: 0, events });
  let signalled = false;
  // the first item's long call (the id's page, the scene's world, the take's world) never answers; SIGTERM comes during it
  const signalOnce = () => {
    if (signalled) return;
    signalled = true;
    setTimeout(() => process.kill(process.pid, 'SIGTERM'), 20);
  };
  const long = { ms: Infinity };
  const scripts = {
    turret: ({ method }) => (method === 'waitForFunction' ? (signalOnce(), long) : {}),
    shoot: ({ method, arg }) => (method === 'evaluate' && arg?.name ? (signalOnce(), long) : {}),
    studio: ({ method, arg }) => (method === 'evaluate' && Number.isInteger(arg?.index) ? (signalOnce(), long) : {}),
  };
  const chrome = standInChrome({ events, script: scripts[tool] });
  const deps = { createServer: standInVite, puppeteer: chrome.launcher, hold: { lock, log: () => {}, teardown: chrome.teardown } };
  // each tool's own command-line entry, its stand-ins aside
  if (tool === 'turret') {
    await runTurretParentAudit(['--ids=tpa_one,tpa_two'], { ...deps, outFile: join(dir, 'turret-parent.json') });
  } else if (tool === 'shoot') {
    const scenesDir = join(dir, 'scenes');
    mkdirSync(scenesDir);
    for (const name of ['01_a', '02_b']) writeFileSync(join(scenesDir, `${name}.json`), JSON.stringify({ map: 'verdant', name }));
    await shootMarketing(['--scenes', scenesDir, '--out', join(dir, 'raw'), '--width', '64'], deps);
    process.exit();
  } else {
    await renderStudioExamples(['--count', '2', '--stills', '0', '--out', dir], deps);
  }
} else {
  const failed = [];
  const check = async (name, run) => {
    try { await run(); } catch (error) { failed.push(`${name}: ${String(error?.message ?? error).split('\n').slice(0, 6).join('\n    ')}`); }
  };
  const signalChild = (tool) => new Promise((done) => {
    const dir = scratch();
    const child = spawn(process.execPath, [SELF, '--signal-child', tool, dir], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => { output += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { output += chunk; });
    const timer = setRealTimeout(() => child.kill('SIGKILL'), 120 * SECOND);
    child.once('close', (code, signal) => { clearRealTimeout(timer); done({ code, signal, output, dir }); });
  });
  try {
    // the signal children start first (each imports its tool); the mock-clock cases run meanwhile
    const children = Object.fromEntries(['turret', 'shoot', 'studio'].map((tool) => [tool, signalChild(tool)]));

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

    // ---- (E10) a signal during an item: the way out runs and the process exits 128 + n ------------------------------------
    const expected = { turret: /--ids=tpa_one,tpa_two/, shoot: /--match 01_a,02_b/, studio: /--only 1,2/ };
    for (const [tool, child] of Object.entries(children)) {
      await check(`${tool} SIGTERM`, async () => {
        const { code, signal, output } = await child;
        assert.equal(signal, null, `${tool}: ended by its own exit, not killed (${signal})\n${output.slice(-1500)}`);
        assert.match(output, expected[tool], `${tool}: the items left are named\n${output.slice(-1500)}`);
        assert.equal(code, 143, `${tool}: exits 128 + 15 after its way out, not ${code}\n${output.slice(-1500)}`);
      });
    }
    assert.deepEqual(failed, [], `long hold users:\n  ${failed.join('\n  ')}`);
    console.log('long-hold-users.selftest: turret-parent-audit, marketing-shots/shoot and studio-example-videos yield at the cap inside '
      + 'their graces (180 s, 180 s, 300 s), are stopped past them, keep what finished, name what is left (exit 3) and exit 128 + n '
      + 'on a signal');
  } finally {
    for (const dir of roots) rmSync(dir, { recursive: true, force: true });
  }
}
