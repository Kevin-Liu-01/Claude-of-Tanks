// tools/shot-pairs.mjs, the pair loop and boot wait the pair shot tools share (gaps 274 S3/S4). Release 270's
// building-style-shots, built-env-shots and ground-surface-shots each took the capture lock through acquire(), checkpointed
// it between pairs, closed it in a close() helper and exited 143 from SIGTERM/SIGINT/SIGHUP handlers of their own, and
// waited for the boot by hand (`window.__GAME_READY === true && ...`): the census's listed exceptions
// (tools/capture-hold-census.selftest.mjs, docs/AUTOMATION-PATHS.md handBuiltWaits). They hold through withCaptureHold by
// runShotPairs now, and wait on the readiness probe's expression.
// The loop runs here on a stand-in lock that keeps the real lock's checkpoint rule (past its 20-min cap with anyone
// waiting: beforeYield while held, the release, the re-queue, held again, afterResume) and node:test's mock clock
// (setTimeout, setInterval, Date), so the cap, the hold's 30-s cap check, a pair's budget and the grace run at their real
// values. Pairs are scripted (open and shoot each take a set time, or throw); the events carry their clock second:
//   options  the hold's options: a render-class ticket, the wait, the grace of a pair's budget and a minute, the place;
//            a bad --wait-hours or --pair-minutes is refused by name (a NaN grace would tear the hold down at once);
//   boot     the boot wait is the readiness probe's own expression with the shot hooks: the same predicate the tools built
//            by hand, and the three tools wait on it and hold through runShotPairs (their sources, and they link);
//   normal   three pairs shot, one line each as the tools printed them; a checkpoint before every pair, the first too;
//            the teardown (the browser closed) before the release;
//   timers   (the real clock) no budget timer outlives its pair: the tools raced a bare sleep, so the process outlived its
//            last pair by up to --pair-minutes;
//   timeout  a pair past its budget is 'timeout', its late answer never records, and the next pair is shot;
//   failed   a pair whose open throws: the tools' two lines, the next pair shot;
//   cap      a pair in flight when the cap passes (with one waiting) finishes inside the grace (its budget and a minute);
//            the next checkpoint yields (onYield before the yield's release), the line says so, and the last pair is shot
//            once held again;
//   control  the same run at the wrapper's default 60-s grace: the hold's stop ends the pair in flight 'stopped' (its late
//            answer never records), the pair after it is counted and named as left, and the teardown comes before the release;
//   first    a first pair still running at the cap is given the grace too (the checkpoint before it marks the work as
//            checkpointing; without one the cap stops it at once);
//   refused  a yield whose re-queue runs out: the pair left is counted and named, and the teardown runs with nothing held
//            (the yield's release is the only one).
// No browser, server or real lock starts; the tools' browser runs are owed (each one short run).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mock } from 'node:test';
import { BOOT_LOADED_EXPRESSION } from './game-readiness.mjs';
import { PAIR_CLOSE_S, SHOT_BOOT_EXPRESSION, runShotPairs, shotPairsHoldOptions } from './shot-pairs.mjs';

const SECOND = 1000, MINUTE = 60 * SECOND;
const CAP_MS = 20 * MINUTE; // the lock's base hold cap (capture-lock.mjs DEFAULT_HOLD_CAP_MS)
const REQUEUE_MS = 2 * MINUTE; // the waiter's turn: a yielded hold is held again this long after its release
const TOOLS = ['building-style-shots', 'built-env-shots', 'ground-surface-shots'];
const at = () => Math.round(Date.now() / SECOND);
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

// ---- options -------------------------------------------------------------------------------------------------------
assert.deepEqual(shotPairsHoldOptions({ waitHours: 16, pairMinutes: 10 }), { lockClass: 'render', timeoutMs: 16 * 3600 * 1000, graceSeconds: 600 + PAIR_CLOSE_S });
assert.equal(PAIR_CLOSE_S, 60, 'a minute to close the pair\'s page and browser');
assert.deepEqual(shotPairsHoldOptions({ waitHours: 0.5, pairMinutes: 25, place: 'built-env-shots-ab7' }),
  { lockClass: 'render', timeoutMs: 1_800_000, graceSeconds: 1560, place: 'built-env-shots-ab7' });
for (const [waitHours, pairMinutes] of [[Number.NaN, 10], [0, 10], [16, Number.NaN], [16, 0], [16, -1], [16, '10']]) {
  assert.throws(() => shotPairsHoldOptions({ waitHours, pairMinutes }), /shot-pairs: --(?:wait-hours|pair-minutes) is a positive number/,
    `refused: --wait-hours=${waitHours} --pair-minutes=${pairMinutes}`);
}

// ---- boot ----------------------------------------------------------------------------------------------------------
// the predicate the three tools built by hand, character for character: the wait is the same, only its owner moved
assert.equal(SHOT_BOOT_EXPRESSION, 'window.__GAME_READY === true && !!window.__SHOTS && !!window.__DEBUG');
assert.ok(SHOT_BOOT_EXPRESSION.startsWith(`${BOOT_LOADED_EXPRESSION} && `), 'the boot latch is the readiness probe\'s own expression');
for (const tool of TOOLS) {
  const source = readFileSync(new URL(`./${tool}.mjs`, import.meta.url), 'utf8');
  assert.equal(source.split('await page.waitForFunction(SHOT_BOOT_EXPRESSION, { timeout: 900000, polling: 1000 });').length - 1, 1,
    `${tool}: its boot wait is the shared expression, its budget unchanged`);
  assert.doesNotMatch(source, /__GAME_READY/, `${tool}: no hand-built boot mirror`);
  assert.equal(source.split('await runShotPairs({').length - 1, 1, `${tool}: holds through runShotPairs`);
  assert.doesNotMatch(source, /createCaptureLock|lock\.checkpoint\(|process\.once\(signal/, `${tool}: no lock, checkpoint or signal handler of its own`);
  await import(`./${tool}.mjs`); // it links (its main runs only as the entry module)
}

// ---- the loop on the mock clock ---------------------------------------------------------------------------------------
/** The capture lock as a hold sees it: held once acquired (its `prepare` run first), its cap while held, and checkpoint()'s
 *  rule: past the cap with anyone waiting, beforeYield (still held), the release, the re-queue (that `signal` withdraws),
 *  held again after REQUEUE_MS, afterResume; `requeue: 'refuse'` makes the re-queue's wait run out instead. */
function standInLock({ waiters, events, requeue = 'resume' }) {
  let held = false, since = 0, checkpoints = 0;
  const stand = {
    get nested() { return false; },
    get held() { return held; },
    get heldCapMs() { return held ? CAP_MS : null; },
    get checkpoints() { return checkpoints; },
    async acquire(_timeoutMs, { prepare = null } = {}) {
      const prepared = typeof prepare === 'function' ? await prepare() : undefined;
      held = true; since = Date.now(); events.push(`hold@${at()}`);
      return prepared;
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
      checkpoints++;
      if (!held) throw new Error('checkpoint(): this lock holds nothing');
      if (Date.now() - since < CAP_MS || !waiters) return { yielded: false, waitedMs: 0 };
      if (beforeYield) await beforeYield();
      stand.release();
      events.push(`yield@${at()}`);
      const queuedAt = Date.now();
      await new Promise((resume, withdraw) => {
        const timer = setTimeout(() => (requeue === 'refuse' ? withdraw(new Error('stand-in: the re-queue\'s wait ran out')) : resume()), REQUEUE_MS);
        signal?.addEventListener('abort', () => { clearTimeout(timer); withdraw(signal.reason); }, { once: true });
      });
      held = true; since = Date.now(); events.push(`held again@${at()}`);
      if (afterResume) await afterResume();
      return { yielded: true, waitedMs: Date.now() - queuedAt };
    },
  };
  return stand;
}

/** Run `work` on node:test's mock clock (5 s a step, a few turns of the real loop between steps), and `drainMs` more once
 *  it ends (a late answer comes due). Every time a case scripts is a multiple of the step. */
const STEP_MS = 5 * SECOND;
async function onMockClock(work, { limitMs = 90 * MINUTE, drainMs = 0 } = {}) {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 0 });
  const turns = async () => { for (let turn = 0; turn < 8; turn++) await new Promise((next) => setImmediate(next)); };
  try {
    let ended = null;
    work().then((value) => { ended = { value }; }, (error) => { ended = { error }; });
    for (let clock = 0; !ended && clock <= limitMs; clock += STEP_MS) {
      await turns();
      if (!ended) mock.timers.tick(STEP_MS);
    }
    if (!ended) throw new Error(`the run had not ended after ${limitMs / MINUTE} min on the clock`);
    for (let clock = 0; clock < drainMs; clock += STEP_MS) { mock.timers.tick(STEP_MS); await turns(); }
    if (ended.error) throw ended.error;
    return ended.value;
  } finally {
    mock.timers.reset();
  }
}

/** One run of `maps` (one job) with each map's scripted { openMs, shootMs, openThrows }: its counts, events and lines. */
async function pairsRun({ maps, script = {}, pairMinutes = 10, waiters = 0, requeue = 'resume', hold = {}, drainMs = 0 }) {
  const events = [], lines = [], records = [];
  const lock = standInLock({ waiters, events, requeue });
  const job = { name: 'job' };
  const pairs = maps.map((mapId) => ({ job, mapId }));
  const of = (mapId, key) => script[mapId]?.[key] ?? 0;
  const counts = await onMockClock(() => runShotPairs({
    pairs, label: 'shots', waitHours: 16, pairMinutes,
    open: async ({ mapId }) => {
      events.push(`open ${mapId}@${at()}`);
      if (of(mapId, 'openMs')) await sleep(of(mapId, 'openMs')); // (no zero-delay timer: the mock clock runs it a step late)
      if (script[mapId]?.openThrows) throw new Error(script[mapId].openThrows);
    },
    shoot: async ({ mapId }, { signal, started }) => {
      if (of(mapId, 'shootMs')) await sleep(of(mapId, 'shootMs'));
      signal.throwIfAborted(); // as the tools check it before writing their manifests
      records.push(mapId);
      events.push(`record ${mapId} ${(Date.now() - started) / SECOND}s@${at()}`);
    },
    settle: async ({ mapId }, outcome) => { events.push(`settle ${mapId} ${outcome}@${at()}`); },
    after: async ({ mapId }) => { events.push(`after ${mapId}@${at()}`); },
    onYield: async () => { events.push(`onYield@${at()}`); },
    teardown: async () => { events.push(`teardown@${at()}`); },
    log: (line) => lines.push(line),
    hold: { lock, ...hold },
  }), { drainMs });
  return { counts, events, lines: lines.join('\n'), records, lock };
}
const before = (events, first, second) => {
  const a = events.indexOf(first), b = events.indexOf(second);
  assert.ok(a >= 0 && b >= 0 && a < b, `${first} before ${second} (${events.join(', ')})`);
};

// normal: three pairs, the tools' lines, a checkpoint before every pair, the teardown before the release
{
  const run = await pairsRun({ maps: ['m1', 'm2', 'm3'], script: { m1: { shootMs: 5 * SECOND }, m2: { openMs: 5 * SECOND, shootMs: 5 * SECOND }, m3: { shootMs: 5 * SECOND } } });
  assert.deepEqual(run.counts, { shot: 3, failed: 0 });
  assert.deepEqual(run.events, ['hold@0', 'open m1@0', 'record m1 5s@5', 'settle m1 shot@5', 'after m1@5', 'open m2@5', 'record m2 10s@15',
    'settle m2 shot@15', 'after m2@15', 'open m3@15', 'record m3 5s@20', 'settle m3 shot@20', 'after m3@20', 'teardown@20', 'release@20']);
  assert.match(run.lines, /^\[shots\] 00:00:05 job m1 staged and shot in 5\.0 s; 1\/3$/m);
  assert.match(run.lines, /^\[shots\] 00:00:15 job m2 staged and shot in 10\.0 s; 2\/3$/m, 'a pair\'s time counts its open');
  assert.match(run.lines, /^\[shots\] 00:00:20 job m3 staged and shot in 5\.0 s; 3\/3$/m);
  assert.equal(run.lock.checkpoints, 3, 'a checkpoint before every pair, the first too');
  assert.doesNotMatch(run.lines, /yielded|left for the next run/);
}

// timers (the real clock): every budget timer is cleared with its pair
{
  const events = [];
  const timeouts = () => process.getActiveResourcesInfo().filter((kind) => kind === 'Timeout').length;
  const was = timeouts();
  const counts = await runShotPairs({ pairs: ['m1', 'm2'].map((mapId) => ({ job: { name: 'job' }, mapId })), label: 'shots', waitHours: 1, pairMinutes: 10,
    open: async () => {}, shoot: async () => {}, teardown: async () => { events.push('teardown'); }, log: () => {},
    hold: { lock: standInLock({ waiters: 0, events }) } });
  assert.deepEqual(counts, { shot: 2, failed: 0 });
  assert.equal(timeouts(), was, 'no pair\'s budget timer outlives the run (the process exits once its last pair is shot)');
}

// timeout: past its budget a pair is 'timeout' and its late answer never records; the next pair is shot
{
  const run = await pairsRun({ maps: ['m1', 'm2', 'm3'], drainMs: 2 * MINUTE,
    script: { m1: { shootMs: 5 * SECOND }, m2: { shootMs: 11 * MINUTE }, m3: { shootMs: 5 * SECOND } } });
  assert.deepEqual(run.counts, { shot: 2, failed: 1 });
  assert.deepEqual(run.records, ['m1', 'm3'], 'm2 answered at 11 min, past its 10-min budget: not recorded');
  assert.ok(run.events.includes('settle m2 timeout@605'), run.events.join(', '));
  assert.match(run.lines, /^\[shots\] 00:10:05 job m2 timeout$/m);
  assert.match(run.lines, /^\[shots\] 00:10:10 job m3 staged and shot in 5\.0 s; 2\/3$/m);
}

// failed: an open that throws, the tools' two lines, the next pair shot
{
  const run = await pairsRun({ maps: ['m1', 'm2', 'm3'], script: { m2: { openMs: 5 * SECOND, openThrows: 'boot refused' } } });
  assert.deepEqual(run.counts, { shot: 2, failed: 1 });
  assert.deepEqual(run.records, ['m1', 'm3']);
  assert.match(run.lines, /^\[shots\] 00:00:05 job m2 failed: boot refused\n\[shots\] 00:00:05 job m2 failed$/m);
  assert.ok(run.events.includes('settle m2 failed@5'));
}

// cap: a pair in flight when the cap passes finishes inside the grace; the next checkpoint yields
const CAP_SCRIPT = { m1: { shootMs: 9 * MINUTE }, m2: { shootMs: 9 * MINUTE }, m3: { openMs: 1 * MINUTE, shootMs: 9 * MINUTE }, m4: { shootMs: 1 * MINUTE } };
{
  const run = await pairsRun({ maps: ['m1', 'm2', 'm3', 'm4'], script: CAP_SCRIPT, waiters: 1 });
  assert.deepEqual(run.counts, { shot: 4, failed: 0 }, run.lines);
  assert.deepEqual(run.records, ['m1', 'm2', 'm3', 'm4']);
  assert.ok(run.events.includes('record m3 600s@1680'), 'm3 (in flight from 18 to 28 min) was shot past the 20-min cap');
  before(run.events, 'after m3@1680', 'onYield@1680');
  before(run.events, 'onYield@1680', 'release@1680');
  before(run.events, 'release@1680', 'held again@1800');
  before(run.events, 'held again@1800', 'open m4@1800');
  assert.match(run.lines, /^\[shots\] 00:30:00 yielded at the cap, held again after 2\.0 min at the back$/m);
  before(run.events, 'teardown@1860', 'release@1860');
}

// control: at the wrapper's default 60-s grace the cap's stop ends the pair in flight; the pair after it is left
{
  const run = await pairsRun({ maps: ['m1', 'm2', 'm3', 'm4'], script: CAP_SCRIPT, waiters: 1, hold: { graceSeconds: 60 }, drainMs: 8 * MINUTE });
  assert.deepEqual(run.counts, { shot: 2, failed: 2 }, run.lines);
  assert.deepEqual(run.records, ['m1', 'm2'], 'm3\'s late answer (28 min) never records');
  assert.ok(run.events.includes('settle m3 stopped@1260'), run.events.join(', '));
  assert.match(run.lines, /^\[shots\] 00:21:00 job m3 stopped$/m);
  assert.match(run.lines, /^\[shots\] 00:21:00 the hold was stopped \(hold cap: no checkpoint within 60 s\): 1 pair\(s\) left for the next run \(job m4\)$/m);
  assert.ok(!run.events.some((event) => event.startsWith('open m4')), 'nothing opened after the stop');
  before(run.events, 'teardown@1260', 'release@1260');
}

// first: a first pair running past the cap is given the grace too, and yields after it
{
  const run = await pairsRun({ maps: ['m1', 'm2'], pairMinutes: 30, waiters: 1, script: { m1: { shootMs: 25 * MINUTE }, m2: { shootMs: 1 * MINUTE } } });
  assert.deepEqual(run.counts, { shot: 2, failed: 0 }, run.lines);
  before(run.events, 'record m1 1500s@1500', 'release@1500');
  before(run.events, 'held again@1620', 'record m2 60s@1680');
}

// refused: the yield's re-queue runs out; the pair left is named, and the teardown runs with nothing held
{
  const run = await pairsRun({ maps: ['m1', 'm2'], pairMinutes: 25, waiters: 1, requeue: 'refuse', script: { m1: { shootMs: 21 * MINUTE } } });
  assert.deepEqual(run.counts, { shot: 1, failed: 1 }, run.lines);
  assert.deepEqual(run.records, ['m1']);
  assert.match(run.lines, /the cap yield did not hold again \(stand-in: the re-queue's wait ran out\): 1 pair\(s\) left for the next run \(job m2\)$/m);
  before(run.events, 'release@1260', 'teardown@1380');
  assert.equal(run.events.filter((event) => event.startsWith('release@')).length, 1, 'the yield\'s release is the only one');
}

console.log(`shot-pairs.selftest: the hold's options (render, the wait, a pair's budget and a minute of grace); the boot wait the three `
  + 'tools built by hand, now the readiness probe\'s; the loop: lines, a checkpoint before every pair, teardown before the release, no budget '
  + 'timer outliving its pair, a timed-out pair never recorded, a failed open, a pair in flight at the cap kept by its grace and yielded after '
  + '(stopped and the rest left at 60 s), a first pair past the cap, a refused re-queue');
