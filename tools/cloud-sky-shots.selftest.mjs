// tools/cloud-sky-shots.mjs on the hold wrapper (round 8 Y8, sweep s6-01). The tool (269, clouds-269) held the GPU through
// its own acquire, signal handlers and close() helper, staged its first unit inside acquire's prepare (a staging failure
// there rejected the whole hold: nothing shot, and a resumed run put the same unit first again), and raced each unit
// against a ten-minute sleep without stopping the loser, which ran on against the run's shared browser: a launch that came
// back past its unit's budget became the run's browser over the one the next unit launched (`browser ??= await launch()`),
// which nothing closed. It holds through withCaptureHold now, and each unit's run is one owner (its state, budget, abort and
// page); its browsers come from one pool the hold's teardown closes before the release.
// The tool's own main runs here (its parse, units, manifests, staging and shooting code) with a stand-in browser whose page
// calls answer at once or as a case scripts (Chrome closes a page asynchronously: a call in flight can still answer until
// the page detaches), a stand-in preview server, and no settle waits. The first cases hold a real private capture lock (a
// lock and queue directory under tmpdir, as capture-hold-phases.selftest does) on the real clock:
//   table    the unit states and their one transition function: each listed move, an ended unit's end standing, and a
//            move the table does not list refused by name; the source has one writer of a unit's state;
//   normal   three yards shot on one browser, one page open at a time; the browser closes before the release; no timer
//            of the run outlives it;
//   failure  a yard's staging fails mid-run: its browser is recycled, the next yard is shot on a fresh one, and every
//            browser closes before the release (exit 1);
//   warm     the first yard's staging fails while the hold is queued: once (it is opened again in the hold and shot) and
//            always (it fails, the next yard is still shot; exit 1).
// (fix-up r1) The rest run on node:test's mock clock (setTimeout, setInterval, Date) with a lock that keeps the real lock's
// checkpoint rule (past its 20-minute cap with one waiting: beforeYield while held, the release, the re-queue, held again,
// afterResume), so the cap, the hold's 30-s cap check, the tool's ten-minute unit budget and its grace run at their real
// values in a fraction of a second:
//   cap      a yard in flight when the cap passes (590 s of its 600-s budget, started just before) is shot and its page
//            closes (45 s to detach); the next checkpoint yields: the idle browser closes before the yield's release, and
//            the next yard launches a fresh browser once held again (exit 0). The grace (the budget and a minute) is what
//            kept that yard: at the default 60 s it is stopped, and at the budget alone its page's close outlasts the grace
//            and the next yard is left;
//   stop     the control at the default 60-s grace: the hold's stop ends the yard in flight 'stopped' and closes its page
//            at that moment, the yard after it is counted and named as left, and the browser closes before the release
//            (exit 1);
//   refused  the yield's re-queue runs out: the yards left are counted and named, and the browser closed before that
//            release, the only one (exit 1);
//   late     a yard's last page call answers five seconds past its budget, while its page (closed at the budget) still
//            detaches: the yard is not recorded, and the next yard is shot;
//   stall    a launch that stalls past its unit's budget: the unit times out, the next yard launches its own browser, and
//            the late browser is closed when it comes back, so one browser is open when that yard is shot;
//   queued   (fix-up r2) the hold is held 15 minutes after the prepare staged the first yard: its budget is paused while
//            it waits frozen, so it is shot from its warm page (not timed out and staged again on a second page while the
//            frozen one stays open), one page open at a time (exit 0).
// And without a clock:
//   pool     the browser pool itself: an aborted unit's take launches nothing; (fix-up r2) a unit that ends while its
//            launch is pending, with no shared browser, has its take rejected with its end and the late browser closed as
//            it comes back, never shared (the next take launches its own); the teardown (closeAll) closes a launch that
//            comes back after it (for a unit still live) and refuses every later take;
//   signal   SIGTERM while a yard is shooting (a child process, the real private lock): the browser closes, then the
//            release, then the exit 143 (the shared signal owner's code for SIGINT and SIGHUP is capture-hold-phases'
//            receipt; this tool has no handler of its own, which the table's source pin checks).
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mock } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createCaptureLock } from './capture-lock.mjs';
import { createBrowserPool, main, nextUnitState, UNIT_BUDGET_MS, UNIT_EDGES, UNIT_STATES } from './cloud-sky-shots.mjs';

const SELF = fileURLToPath(import.meta.url);
const SECOND = 1000, MINUTE = 60 * SECOND;
const CAP_MS = 20 * MINUTE; // the lock's base hold cap (capture-lock.mjs DEFAULT_HOLD_CAP_MS)
const REQUEUE_MS = 2 * MINUTE; // the waiter's turn: a yielded hold is held again this long after its release
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const roots = [];
const scratch = () => { const dir = mkdtempSync(join(tmpdir(), 'cot-cloud-sky-')); roots.push(dir); return dir; };

/** The capture lock on private directories, its holds and acted releases recorded (`record(event)`). */
function privateLock(root, record) {
  const lock = createCaptureLock({ lockDir: join(root, 'lock'), queueDir: join(root, 'queue'), log: () => {} });
  return new Proxy(lock, {
    get(target, key) {
      const value = Reflect.get(target, key);
      if (key === 'acquire') return async (...args) => { const prepared = await value.apply(target, args); record('hold'); return prepared; };
      if (key === 'release') return (...args) => { const acted = value.apply(target, args); if (acted) record('release'); return acted; };
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

/** The capture lock as a hold sees it (capture-lock.mjs createCaptureLock), for the mock clock: `prepare` runs while
 *  queued and its result is the acquire's; held, its cap is `capMs`; checkpoint() past the cap with anyone waiting runs
 *  beforeYield (still held), releases, waits its turn in the queue (REQUEUE_MS; `requeue: 'refuse'`: that wait runs out
 *  and the checkpoint rejects), holds again and runs afterResume. `queueMs`: the ticket waits that long in the queue after
 *  the prepare before it is held. */
function standInLock({ record, waiters = 0, capMs = CAP_MS, requeue = 'resume', queueMs = 0 }) {
  let held = false, since = 0;
  const lock = {
    get nested() { return false; },
    get held() { return held; },
    get heldCapMs() { return held ? capMs : null; },
    async acquire(_timeoutMs, { prepare = null } = {}) {
      const prepared = prepare ? await prepare() : undefined;
      if (queueMs) await sleep(queueMs);
      held = true;
      since = Date.now();
      record('hold');
      return prepared;
    },
    refresh() { return held; },
    waiting() { return waiters; },
    release() {
      if (!held) return false;
      held = false;
      record('release');
      return true;
    },
    async checkpoint({ beforeYield = null, afterResume = null, signal = null } = {}) {
      if (!held) throw new Error('checkpoint(): this lock holds nothing');
      if (Date.now() - since < capMs || !waiters) return { yielded: false };
      if (beforeYield) await beforeYield();
      const heldMs = Date.now() - since;
      lock.release();
      const queuedAt = Date.now();
      await new Promise((resume, refuse) => {
        const timer = setTimeout(() => (requeue === 'refuse' ? refuse(new Error('stand-in: the re-queue\'s wait ran out')) : resume()), REQUEUE_MS);
        signal?.addEventListener('abort', () => { clearTimeout(timer); refuse(signal.reason); }, { once: true });
      });
      held = true;
      since = Date.now();
      record('held again');
      if (afterResume) await afterResume();
      return { yielded: true, heldMs, capMs, waitedMs: Date.now() - queuedAt };
    },
  };
  return lock;
}

/**
 * Chrome as the tool drives it. `script({ browser, unit, method, name, arg })` gives a page call its answer: `{ ms, value,
 * error, mark }` (ms 0: at once; Infinity: never; `mark` is recorded as it answers). Browser `b<n>` launches after
 * `launchMs(n)`. Pages carry the yard their tool staged (bootPage's garage variant). A page's close takes `detachMs(unit)`
 * (Chrome closes a target asynchronously): a call already in flight can still answer until then, and a new call is
 * refused. A browser's close cuts every call at once. Launches, page opens and closes, and browser closes are recorded.
 */
function standInChrome({ record, script = () => ({}), launchMs = () => 0, detachMs = () => 0 }) {
  let launched = 0, opened = 0;
  const browsers = [];
  const launcher = {
    async launch() {
      const name = `b${++launched}`;
      const wait = launchMs(launched);
      if (wait) await sleep(wait);
      let connected = true;
      const inFlight = new Set();
      const alive = setInterval(() => {}, 10_000); // Chrome's pipe keeps a tool's process alive
      record(`launch ${name}`);
      const browser = {
        name,
        get connected() { return connected; },
        async newPage() {
          if (!connected) throw new Error(`${name}: Target closed`);
          const id = `p${++opened}`;
          let open = true, closing = false, unit = null;
          const calls = new Set();
          const call = (method, fnName, arg) => {
            if (!open || closing || !connected) return Promise.reject(new Error(`Protocol error (${method}): Target closed`));
            const { ms = 0, value, error, mark = null } = script({ browser: name, unit, method, name: fnName, arg }) ?? {};
            const answer = () => { if (mark) record(mark); return error ? Promise.reject(error) : Promise.resolve(value); };
            if (!ms) return answer();
            return new Promise((resolve, reject) => {
              const settle = () => { calls.delete(cut); inFlight.delete(cut); };
              const cut = (why) => { clearTimeout(timer); settle(); reject(new Error(`Protocol error (${method}): Target closed (${why})`)); };
              const timer = Number.isFinite(ms) ? setTimeout(() => { settle(); answer().then(resolve, reject); }, ms) : null;
              calls.add(cut);
              inFlight.add(cut);
            });
          };
          const page = {
            on() {},
            async setViewport() {},
            async evaluateOnNewDocument(fn, ...args) { if (typeof fn === 'function') unit = args[2] ?? unit; },
            async bringToFront() { if (!open || closing || !connected) throw new Error('Target closed'); },
            async createCDPSession() { return { send: async () => { if (!open || !connected) throw new Error('Target closed'); } }; },
            async close() {
              if (!open || closing) return;
              closing = true;
              record(`page ${id} close ${unit}`);
              const wait = detachMs(unit);
              if (wait) await sleep(wait);
              open = false;
              for (const cut of [...calls]) cut('page closed');
            },
            goto: (url) => call('goto', '', url),
            waitForFunction: (expression, _options, ...args) => {
              if (typeof expression === 'function') unit = args[0] ?? unit;
              return call('waitForFunction', typeof expression === 'function' ? expression.name || 'fn' : 'expression', expression);
            },
            evaluate: (fn, arg) => call('evaluate', fn.name || 'fn', arg),
            screenshot: (options) => call('screenshot', 'screenshot', options),
          };
          record(`page ${id} open`);
          return page;
        },
        async close() {
          if (!connected) return;
          connected = false;
          clearInterval(alive);
          for (const cut of [...inFlight]) cut('browser closed');
          record(`close ${name}`);
        },
      };
      browsers.push(browser);
      return browser;
    },
  };
  return { launcher, browsers };
}

/** One desktop job of `yards` under `root`: its jobs file and the args main takes. */
function jobArgs(root, yards) {
  const dist = join(root, 'dist');
  mkdirSync(dist, { recursive: true });
  writeFileSync(join(dist, 'index.html'), '<!doctype html>');
  const jobs = join(root, 'jobs.json');
  writeFileSync(jobs, JSON.stringify([{ name: 'job', dist, device: 'desktop', garage: yards }]));
  return [`--out=${join(root, 'out')}`, `--jobs=${jobs}`, '--wait-hours=0.05'];
}
const shotIn = (root) => {
  const manifestFile = join(root, 'out', 'job', 'manifest-v1.json');
  return existsSync(manifestFile) ? Object.keys(JSON.parse(readFileSync(manifestFile, 'utf8')).units) : [];
};
const standInServer = (record) => async () => ({ url: 'http://127.0.0.1:9', close: async () => record('server closed') });

/** A run of the tool's main over `yards` (one desktop job) with the stand-ins on a private real lock; its events, lines,
 *  manifest and exit code. */
async function run({ yards, script, launchMs, unitBudgetMs, root = scratch() }) {
  const events = [], said = [];
  const record = (event) => { events.push(event); };
  const chrome = standInChrome({ record, script, launchMs });
  const timersBefore = process.getActiveResourcesInfo().filter((kind) => kind === 'Timeout').length;
  const code = await main(jobArgs(root, yards), {
    launcher: chrome.launcher, startServer: standInServer(record), hold: { lock: privateLock(root, record), log: (line) => said.push(line) },
    pause: async () => {}, freeGb: () => 500, log: (line) => said.push(line), ...(unitBudgetMs ? { unitBudgetMs } : {}),
  });
  const timersAfter = process.getActiveResourcesInfo().filter((kind) => kind === 'Timeout').length;
  return { code, events, said: said.join('\n'), shot: shotIn(root), chrome, timersBefore, timersAfter };
}

/** Run `work` on node:test's mock clock (5 s a step, at most `limitMs`; a few turns of the real loop between steps). Every
 *  time a case scripts is a multiple of the step, so the timers due in one step never run ahead of what an earlier one
 *  started. */
const STEP_MS = 5 * SECOND;
async function onMockClock(work, { limitMs = 90 * MINUTE } = {}) {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 0 });
  try {
    let ended = null;
    work().then((value) => { ended = { value }; }, (error) => { ended = { error }; });
    for (let clock = 0; !ended && clock <= limitMs; clock += STEP_MS) {
      for (let turn = 0; turn < 5 && !ended; turn++) await new Promise((next) => setImmediate(next));
      if (!ended) mock.timers.tick(STEP_MS);
    }
    if (!ended) throw new Error(`the run had not ended after ${limitMs / MINUTE} min on the clock`);
    if (ended.error) throw ended.error;
    return ended.value;
  } finally {
    mock.timers.reset();
  }
}

/** The same run on the mock clock with the stand-in lock (`lock`: its options); every event carries its clock second. */
async function clockRun({ yards, script, launchMs, detachMs, unitBudgetMs, lock: lockOptions = {}, hold = {} }) {
  const root = scratch(), events = [], seconds = [], said = [];
  const record = (event) => { events.push(event); seconds.push(Math.round(Date.now() / SECOND)); };
  const chrome = standInChrome({ record, script, launchMs, detachMs });
  const lock = standInLock({ record, ...lockOptions });
  const code = await onMockClock(() => main(jobArgs(root, yards), {
    launcher: chrome.launcher, startServer: standInServer(record), hold: { lock, log: (line) => said.push(line), ...hold },
    pause: async () => {}, freeGb: () => 500, log: (line) => said.push(line), ...(unitBudgetMs ? { unitBudgetMs } : {}),
  }));
  const at = (event) => events.indexOf(event);
  const second = (event) => (at(event) >= 0 ? seconds[at(event)] : null);
  return { code, events, seconds, at, second, said: said.join('\n'), shot: shotIn(root), chrome,
    trail: () => events.map((event, i) => `${event}@${seconds[i]}`).join(', ') };
}

/** Every browser the run launched closed before its (one) release. */
function closedBeforeRelease({ events, chrome }) {
  const release = events.indexOf('release');
  assert.ok(release >= 0 && events.lastIndexOf('release') === release, `one release (${events.join(', ')})`);
  for (const { name } of chrome.browsers) {
    const closed = events.indexOf(`close ${name}`);
    assert.ok(closed >= 0 && closed < release, `${name} closed before the release (${events.join(', ')})`);
  }
}
/** Each page closes before the next opens (a shot or abandoned unit's page is never left on its browser), and every page
 *  closes. */
function onePageAtATime(events) {
  let pagesOpen = 0;
  for (const event of events) {
    if (/^page p\d+ open$/.test(event)) assert.equal(++pagesOpen, 1, `one page open at a time (${events.join(', ')})`);
    if (/^page p\d+ close /.test(event)) pagesOpen--;
  }
  assert.equal(pagesOpen, 0, 'every page closed');
}
/** The event that began closing `unit`'s page. */
const pageClose = (events, unit) => events.find((event) => /^page p\d+ close /.test(event) && event.endsWith(` ${unit}`)) ?? null;
const garagePredicate = ({ method, name }) => method === 'waitForFunction' && name === 'fn'; // stageUnit's yard wait
const shooting = ({ method }) => method === 'screenshot';
const thawing = ({ method, name }) => method === 'evaluate' && name === 'pageThawClouds'; // a frame's last page call

if (process.argv[2] === '--signal-child') {
  // ---- the signal child: a real private lock, the yard's shot never answers; the parent signals it ----------------------
  const root = process.argv[3], eventsFile = join(root, 'events');
  const record = (event) => appendFileSync(eventsFile, `${event}\n`);
  const chrome = standInChrome({ record, script: (call) => (shooting(call) ? (record('shooting'), { ms: Infinity }) : {}) });
  await main(jobArgs(root, ['g0', 'g1']), {
    launcher: chrome.launcher, startServer: standInServer(record),
    hold: { lock: privateLock(root, record), log: () => {} }, pause: async () => {}, freeGb: () => 500, log: () => {},
  });
  record('main returned'); // never: the hold's signal owner exits the process
} else {
  try {
    // ---- table: the unit states and their one transition function -------------------------------------------------------
    {
      const ended = new Set(['shot', 'failed', 'timeout', 'stopped']);
      let allowed = 0, refused = 0;
      for (const from of UNIT_STATES) {
        for (const to of UNIT_STATES) {
          if (ended.has(from)) { assert.equal(nextUnitState(from, to), null, `${from} has ended: ${to} is ignored`); continue; }
          if (UNIT_EDGES[from].includes(to)) { assert.equal(nextUnitState(from, to), to); allowed++; continue; }
          assert.throws(() => nextUnitState(from, to), new RegExp(`a unit cannot move ${from} -> ${to}`));
          refused++;
        }
      }
      assert.deepEqual([allowed, refused], [14, 7], 'the table: 14 moves, 7 refused');
      for (const live of ['staging', 'warm', 'shooting']) {
        for (const end of ['failed', 'timeout', 'stopped']) assert.ok(UNIT_EDGES[live].includes(end), `${live} can end ${end}`);
      }
      assert.throws(() => nextUnitState('staging', 'queued'), /no unit state queued/);
      const source = readFileSync(new URL('./cloud-sky-shots.mjs', import.meta.url), 'utf8');
      assert.equal([...source.matchAll(/\bstate = /g)].length, 2, 'a unit\'s state is written in one place (its declaration and move())');
      assert.doesNotMatch(source, /\bcreateCaptureLock\b|process\.once\(|\bheld = /, 'no acquire, signal handler or held flag of its own');
      assert.match(source, /readinessExpression\('garage'\)/, 'the boot waits on the readiness probe');
    }

    // ---- normal: three yards on one browser; the browser closes before the release -----------------------------------------
    {
      const result = await run({ yards: ['g0', 'g1', 'g2'] });
      assert.equal(result.code, 0, result.said);
      assert.deepEqual(result.shot, ['garage-g0', 'garage-g1', 'garage-g2']);
      assert.deepEqual(result.chrome.browsers.map(({ name }) => name), ['b1'], 'one browser for three yards');
      closedBeforeRelease(result);
      assert.ok(result.events.indexOf('launch b1') < result.events.indexOf('hold'), 'the first yard staged while queued');
      // each yard's page closes before the next yard's opens (a shot unit's page is closed by the loop, not left on its browser)
      onePageAtATime(result.events);
      assert.equal(result.timersAfter, result.timersBefore, 'no timer of the run outlives it (the old ten-minute race kept the process alive)');
    }

    // ---- failure: a yard's staging fails mid-run ----------------------------------------------------------------------------
    {
      const result = await run({ yards: ['g0', 'g1', 'g2'],
        script: (call) => (garagePredicate(call) && call.unit === 'g1' ? { error: new Error('the yard never presented') } : {}) });
      assert.equal(result.code, 1, result.said);
      assert.deepEqual(result.shot, ['garage-g0', 'garage-g2'], 'the failed yard is left; the next is shot');
      assert.match(result.said, /job garage-g1 failed: the yard never presented/);
      assert.deepEqual(result.chrome.browsers.map(({ name }) => name), ['b1', 'b2'], 'a failed unit recycles its browser');
      assert.ok(result.events.indexOf('close b1') < result.events.indexOf('launch b2'), 'the failed unit\'s browser closed before the next launch');
      closedBeforeRelease(result);
    }

    // ---- warm: the first yard's staging fails while the hold is queued ------------------------------------------------------
    {
      let tries = 0;
      const once = await run({ yards: ['g0', 'g1'],
        script: (call) => (garagePredicate(call) && call.unit === 'g0' && ++tries === 1 ? { error: new Error('cold cache') } : {}) });
      assert.equal(once.code, 0, once.said);
      assert.deepEqual(once.shot, ['garage-g0', 'garage-g1'], 'the yard is opened again in the hold and shot');
      assert.match(once.said, /garage-g0 failed: cold cache \(staging it while queued\); opening it again in the hold/);
      closedBeforeRelease(once);
      const always = await run({ yards: ['g0', 'g1'],
        script: (call) => (garagePredicate(call) && call.unit === 'g0' ? { error: new Error('no such yard') } : {}) });
      assert.equal(always.code, 1, always.said);
      assert.deepEqual(always.shot, ['garage-g1'], 'a first unit that never stages costs that unit, not the run');
      closedBeforeRelease(always);
    }

    // ---- cap: a yard in flight at the cap is shot, then the hold yields -----------------------------------------------------
    // g0 and g1 take 590 s each; g2 starts at 1180 s and shoots for 590 s (inside its 600-s budget): the cap check at
    // 1200 s finds the cap passed with one waiting, so the next checkpoint yields; g2's page takes 45 s to close (to 1815 s)
    const SHOT_MS = { g0: 590 * SECOND, g1: 590 * SECOND, g2: 590 * SECOND, g3: 10 * SECOND };
    const capRun = (options = {}) => clockRun({ yards: ['g0', 'g1', 'g2', 'g3'], lock: { waiters: 1, ...options.lock }, hold: options.hold,
      detachMs: (unit) => (unit === 'g2' ? 45 * SECOND : 0),
      script: (call) => (shooting(call) ? { ms: SHOT_MS[call.unit], mark: `shot ${call.unit}` } : {}) });
    assert.equal(UNIT_BUDGET_MS, 600 * SECOND, 'a unit\'s budget is ten minutes');
    {
      const result = await capRun();
      assert.equal(result.code, 0, `${result.said}\n${result.trail()}`);
      assert.deepEqual(result.shot, ['garage-g0', 'garage-g1', 'garage-g2', 'garage-g3'], 'the yard in flight at the cap is shot');
      assert.ok(result.second('shot g2') > CAP_MS / SECOND, `g2 was shot past the cap (${result.trail()})`);
      assert.match(result.said, /hold cap 20\.0 min with 1 waiting: the next checkpoint yields/);
      assert.match(result.said, /yielded at the cap, held again after 2\.0 min at the back/);
      const release = result.at('release'), again = result.at('held again');
      assert.ok(result.at('close b1') >= 0 && result.at('close b1') < release, `the idle browser closes before the yield's release (${result.trail()})`);
      assert.ok(result.at('launch b2') > again, `the next yard launches a fresh browser once held again (${result.trail()})`);
      assert.ok(result.at('shot g3') > result.at('launch b2'), 'and is shot on it');
      assert.equal(result.events.filter((event) => event === 'release').length, 2, 'released at the yield and at the end');
      assert.ok(result.at('close b2') < result.events.lastIndexOf('release'), `the last browser closes before the last release (${result.trail()})`);
      // the grace is what kept g2 and g3: the default 60 s stops g2 (the stop case); the budget alone (600 s, no margin for
      // a page and browser to close) runs out at 1800 s while g2's page still closes, and g3 is left
      const budgetOnly = await capRun({ hold: { graceSeconds: UNIT_BUDGET_MS / SECOND } });
      assert.equal(budgetOnly.code, 1, budgetOnly.said);
      assert.deepEqual(budgetOnly.shot, ['garage-g0', 'garage-g1', 'garage-g2'], 'without the close margin the yard after it is left');
      assert.match(budgetOnly.said, /hold cap: no checkpoint within 600 s/);
    }

    // ---- stop: the default 60-s grace stops the yard in flight ---------------------------------------------------------------
    {
      const result = await capRun({ hold: { graceSeconds: 60 } });
      assert.equal(result.code, 1, result.said);
      assert.deepEqual(result.shot, ['garage-g0', 'garage-g1'], 'the yard in flight at the stop and the one after it are not shot');
      assert.match(result.said, /hold cap: no checkpoint within 60 s/);
      assert.match(result.said, /job garage-g2 stopped/, 'the hold\'s stop ends the yard in flight as stopped');
      assert.match(result.said, /the hold was stopped \([^)]*\): 1 unit\(s\) left for the next run/, 'the yard after it is counted and named');
      assert.match(result.said, /2 failed/);
      assert.equal(result.second(pageClose(result.events, 'g2')), 1260, `g2's page closes at the stop (the cap check at 1200 s and 60 s) (${result.trail()})`);
      assert.equal(result.at('shot g2'), -1, 'its shot never answers');
      closedBeforeRelease(result);
    }

    // ---- refused: the yield's re-queue runs out ------------------------------------------------------------------------------
    {
      const result = await capRun({ lock: { requeue: 'refuse' } });
      assert.equal(result.code, 1, result.said);
      assert.deepEqual(result.shot, ['garage-g0', 'garage-g1', 'garage-g2']);
      assert.match(result.said, /the cap yield did not hold again \(stand-in: the re-queue's wait ran out\): 1 unit\(s\) left for the next run/);
      assert.equal(result.at('launch b2'), -1, 'nothing launches after the refusal');
      closedBeforeRelease(result);
    }

    // ---- late: a page call answers past the unit's budget while its page closes ---------------------------------------------
    {
      // g1's frame thaw answers 605 s in; its budget ends it at 600 s and its page (closed then) detaches at 610 s
      const result = await clockRun({ yards: ['g0', 'g1', 'g2'], detachMs: (unit) => (unit === 'g1' ? 10 * SECOND : 0),
        script: (call) => (thawing(call) && call.unit === 'g1' ? { ms: 605 * SECOND, mark: 'thawed g1' } : {}) });
      assert.equal(result.code, 1, result.said);
      assert.match(result.said, /job garage-g1 timeout/);
      assert.equal(result.second(pageClose(result.events, 'g1')), 600, `g1's page closes at its budget (${result.trail()})`);
      assert.equal(result.second('thawed g1'), 605, `its last page call still answered, past the budget (${result.trail()})`);
      assert.deepEqual(result.shot, ['garage-g0', 'garage-g2'], 'a unit past its budget never records; the next yard is shot');
      closedBeforeRelease(result);
    }

    // ---- stall: a launch past its unit's budget ------------------------------------------------------------------------------
    {
      // g0's frame fails (its browser b1 recycled); g1's launch (b2) comes back 90 s on, past its 60-s budget; g2 launches b3
      // and its frame is taken 40 s in, after b2 came back
      const result = await clockRun({ yards: ['g0', 'g1', 'g2'], unitBudgetMs: 60 * SECOND, launchMs: (n) => (n === 2 ? 90 * SECOND : 0),
        script: (call) => {
          if (shooting(call) && call.unit === 'g0') return { error: new Error('the frame failed') };
          if (shooting(call) && call.unit === 'g2') return { ms: 40 * SECOND, mark: 'shot g2' };
          return {};
        } });
      assert.equal(result.code, 1, result.said);
      assert.deepEqual(result.shot, ['garage-g2']);
      assert.match(result.said, /job garage-g1 timeout/);
      const { at } = result;
      assert.ok(at('launch b3') >= 0 && at('launch b2') > at('launch b3') && at('shot g2') > at('launch b2'),
        `b2 came back while g2 shot on b3 (${result.trail()})`);
      assert.ok(at('close b2') > at('launch b2') && at('close b2') < at('shot g2'), `the late browser is closed as it comes back (${result.trail()})`);
      const before = result.events.slice(0, at('shot g2'));
      const open = before.filter((event) => event.startsWith('launch ')).map((event) => event.slice(7)).filter((name) => !before.includes(`close ${name}`));
      assert.deepEqual(open, ['b3'], 'one browser open when g2 is shot');
      closedBeforeRelease(result);
    }

    // ---- queued: the first yard waits out a long queue frozen, its budget paused ---------------------------------------------
    {
      // held 15 min after the prepare staged g0 (real holds queue for hours: --wait-hours defaults to 16): past g0's 600-s
      // budget, which a warm unit does not spend while it waits
      const result = await clockRun({ yards: ['g0', 'g1'], lock: { queueMs: 15 * MINUTE } });
      assert.equal(result.code, 0, `${result.said}\n${result.trail()}`);
      assert.deepEqual(result.shot, ['garage-g0', 'garage-g1']);
      assert.ok(result.second('hold') >= 15 * 60, `held after the queue (${result.trail()})`);
      assert.doesNotMatch(result.said, /opening it again/, 'the warm yard is shot from its frozen page, not staged again');
      assert.equal(result.events.filter((event) => /^page p\d+ open$/.test(event)).length, 2, `two pages for two yards (${result.trail()})`);
      onePageAtATime(result.events);
      closedBeforeRelease(result);
    }

    // ---- pool: the browser pool's own rules ----------------------------------------------------------------------------------
    {
      const closed = [];
      const browser = (name) => ({ name, close: async () => { closed.push(name); } });
      let launches = 0;
      const pool = createBrowserPool(async () => browser(`b${++launches}`));
      const ended = new AbortController();
      ended.abort(new Error('g1 timeout'));
      await assert.rejects(pool.take(ended.signal), /g1 timeout/, 'an aborted unit\'s take rejects with its end');
      assert.equal(launches, 0, 'and launches nothing');
      // a unit that ends while its launch is pending, with no shared browser (the stall case had one: b3)
      let arrive = null, slowLaunches = 0;
      const slow = createBrowserPool(() => (++slowLaunches === 1 ? new Promise((done) => { arrive = () => done(browser('slow')); })
        : Promise.resolve(browser(`fresh${slowLaunches}`))));
      const unit = new AbortController();
      const pending = slow.take(unit.signal);
      unit.abort(new Error('g2 timeout'));
      arrive();
      await assert.rejects(pending, /g2 timeout/, 'a take whose unit ended while it launched rejects with that end');
      assert.deepEqual(closed, ['slow'], 'its late browser is closed as it comes back');
      const next = await slow.take(new AbortController().signal);
      assert.equal(next.name, 'fresh2', 'never shared: the next unit launches its own');
      closed.length = 0;
      let comeBack = null, lateLaunches = 0;
      // the first launch waits for comeBack(); any later one answers at once (a take that launched after the teardown fails
      // its count, not a hang)
      const late = createBrowserPool(() => (++lateLaunches === 1 ? new Promise((done) => { comeBack = () => done(browser('late')); })
        : Promise.resolve(browser(`after${lateLaunches}`))));
      const taking = late.take(new AbortController().signal); // a unit still live
      await late.closeAll();
      comeBack();
      await assert.rejects(taking, /the run's browsers are closed/, 'a launch that comes back after the teardown is not handed out');
      assert.deepEqual(closed, ['late'], 'it is closed as it comes back');
      await assert.rejects(late.take(new AbortController().signal), /the run's browsers are closed/, 'a take after the teardown is refused');
      assert.equal(lateLaunches, 1, 'and launches nothing');
      assert.deepEqual(closed, ['late'], 'nothing else was launched to close');
    }

    // ---- signal: SIGTERM while a yard shoots ---------------------------------------------------------------------------------
    {
      const root = scratch(), eventsFile = join(root, 'events');
      const child = spawn(process.execPath, ['--max-old-space-size=1024', SELF, '--signal-child', root], { stdio: ['ignore', 'pipe', 'pipe'] });
      let output = '';
      child.stdout.setEncoding('utf8').on('data', (chunk) => { output += chunk; });
      child.stderr.setEncoding('utf8').on('data', (chunk) => { output += chunk; });
      const events = () => (existsSync(eventsFile) ? readFileSync(eventsFile, 'utf8').trim().split('\n') : []);
      for (let i = 0; i < 1200 && !events().includes('shooting'); i++) await sleep(50);
      assert.ok(events().includes('shooting'), `SIGTERM: the child reached the yard's shot (${events().join(', ')}) ${output.slice(-600)}`);
      child.kill('SIGTERM');
      const exit = await new Promise((done) => child.once('close', (status) => done(status)));
      const seen = events();
      assert.equal(exit, 143, `SIGTERM: exits 128 + 15 (${seen.join(', ')}) ${output.slice(-600)}`);
      assert.ok(seen.includes('hold') && seen.indexOf('close b1') >= 0 && seen.indexOf('close b1') < seen.indexOf('release'),
        `SIGTERM: the browser closes before the release (${seen.join(', ')})`);
      assert.ok(!seen.includes('main returned'), 'SIGTERM: the run did not go on past the signal');
    }
  } finally {
    for (const dir of roots) rmSync(dir, { recursive: true, force: true });
  }
  console.log('cloud-sky-shots.selftest: one hold through withCaptureHold, each unit one owner: browsers closed before the release on '
    + 'the way out, after a failure, at a cap yield and on SIGTERM; a yard in flight at the cap is shot inside its grace, and one '
    + 'past it is stopped; a first unit that fails while queued is opened again, and one that waits out a long queue is shot '
    + 'warm; a unit past its budget never records; a launch past its budget closes as it comes back');
}
