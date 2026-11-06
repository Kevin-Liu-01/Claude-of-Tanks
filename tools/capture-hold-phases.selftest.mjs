// The hold's phases (2026-11-02 audit S4, tools/capture-hold.mjs createHoldPhases, withCaptureHold, runWarmHold). The
// hold limit and the lock's cap were two timers that disagreed: the limit (18 min by default) came before the cap (20), so
// a checkpoint never yielded before the abort; a checkpoint after the abort and its grace froze closed pages and threw;
// a yield after an abort left the grace running, which closed the browser during the re-queue wait (the thaw then hit
// closed pages); and a shoot that never called checkpoint() kept its hold past the cap however many waited. Driven with a
// fake lock (a cap of tens of milliseconds, a waiter count, a checkpoint that yields as the real one does) and fake pages
// that refuse a freeze or a thaw once their browser is closed. The last case runs withCaptureHold on a real private lock
// in a child process and stops it with SIGTERM; then two runCapturedCommand holds in one process (one holding, one
// queued) meet one SIGTERM.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as captureHold from './capture-hold.mjs';
import { runWarmHold, withCaptureHold } from './capture-hold.mjs';

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

function fakeLock({ capMs = null, waiters = 1, yieldWaitMs = 40, resumeDelayMs = 0, nested = false, events }) {
  let heldAt = 0, held = false;
  const lock = {
    async acquire(_ms, { prepare } = {}) {
      const prepared = typeof prepare === 'function' ? await prepare() : undefined;
      held = true; heldAt = Date.now(); events.push('hold');
      return prepared;
    },
    refresh() { return held; },
    release() { if (held) events.push('release'); held = false; return true; },
    waiting() { return waiters; },
    get heldCapMs() { return held && !nested ? capMs : null; },
    get nested() { return nested; },
    // the real lock's rule: past the cap with anyone waiting, yield (beforeYield, release, re-queue, afterResume)
    async checkpoint({ beforeYield, afterResume } = {}) {
      if (!(capMs > 0) || Date.now() - heldAt < capMs || !waiters) return { yielded: false };
      await beforeYield?.();
      lock.release();
      events.push('yield');
      await sleep(yieldWaitMs);
      held = true; heldAt = Date.now(); events.push('hold again');
      await afterResume?.();
      if (resumeDelayMs) await sleep(resumeDelayMs); // a checkpoint still finishing once held again
      return { yielded: true };
    },
  };
  return lock;
}
/** runWarmHold's rig: one page whose freeze and thaw throw once the warm resources (the browser) are closed. */
function rig(lockOptions) {
  const events = [];
  let closed = false;
  const page = { name: 'p' };
  const options = {
    lock: fakeLock({ ...lockOptions, events }), log: () => {}, maxFrozenMinutes: 0, capCheckMs: 10,
    freeze: async () => { if (closed) throw new Error('Target closed (freeze)'); events.push('freeze'); return 'session'; },
    thaw: async () => { if (closed) throw new Error('Target closed (thaw)'); events.push('thaw'); },
    check: async () => ({ ok: true }), rewarm: async () => {},
    warm: async () => ({ pages: [page], close: async () => { closed = true; events.push('close'); } }),
  };
  return { events, options, isClosed: () => closed };
}
const watchAbort = (signal, events) => signal.addEventListener('abort', () => events.push('abort'), { once: true });

// ---- (i) a budget below the cap: a checkpoint after the stop and its grace never freezes closed pages ---------------
{
  // the budget (120 ms) and its grace (50 ms) end well before the cap (400 ms); the shoot checkpoints on past both
  const { events, options } = rig({ capMs: 400, waiters: 1 });
  await runWarmHold({ ...options, holdMinutes: 0.002, graceSeconds: 0.05, shoot: async ({ signal, checkpoint }) => {
    watchAbort(signal, events);
    const until = Date.now() + 600;
    while (Date.now() < until) { await sleep(30); await checkpoint(); } // a shoot that keeps checkpointing past its stop
  } });
  assert.ok(events.includes('abort') && events.includes('close'), `the budget stopped the shoot and the grace closed it (${events.join(' ')})`);
  assert.ok(!events.includes('yield'), 'no checkpoint yields after the stop');
  assert.ok(events.indexOf('close') < events.lastIndexOf('release'), 'closed before the release');
}

// ---- (i b) a slow close: the release waits for the teardown the grace began (round 2) -------------------------------
{
  // a shoot ends as soon as its browser starts closing (its page calls reject with 'Target closed'); the teardown's promise
  // was dropped, so the lock went while Chrome still closed
  const events = [];
  let closing;
  const closeStarted = new Promise((done) => { closing = done; });
  await runWarmHold({ lock: fakeLock({ events }), log: () => {}, maxFrozenMinutes: 0, capCheckMs: 10, holdMinutes: 0.002, graceSeconds: 0.05,
    freeze: async () => 'session', thaw: async () => {}, check: async () => ({ ok: true }), rewarm: async () => {},
    warm: async () => ({ pages: [{ name: 'p' }], close: async () => { events.push('close start'); closing(); await sleep(300); events.push('close done'); } }),
    shoot: async () => { await closeStarted; events.push('shoot ends'); } });
  events.push('returned');
  assert.ok(events.indexOf('close done') >= 0 && events.indexOf('close done') < events.indexOf('release'),
    `the lock goes once the close is done, not when the shoot ends (${events.join(', ')})`);
  assert.equal(events.filter((event) => event === 'close start').length, 1, 'one teardown');
  assert.equal(events.at(-1), 'returned');
}

// ---- (ii) a long batch past the cap: stopped (not cooperative), and its late checkpoint never yields mid-grace ---------
{
  const { events, options } = rig({ capMs: 100, waiters: 1, yieldWaitMs: 100 });
  await runWarmHold({ ...options, holdMinutes: 0.002, graceSeconds: 0.03, shoot: async ({ signal, checkpoint }) => {
    watchAbort(signal, events);
    await sleep(150); // one batch longer than the cap and the budget
    const result = await checkpoint();
    events.push(`checkpoint ${result.yielded ? 'yielded' : 'kept'}`);
    await sleep(50);
  } });
  assert.ok(!events.includes('yield'), `a checkpoint after the abort never yields (${events.join(' ')})`);
  assert.deepEqual(events.filter((event) => event === 'abort').length, 1);
  assert.ok(events.includes('checkpoint kept'));
}

// ---- the cap, cooperative: a shoot that checkpoints yields at the cap and is never stopped --------------------------
{
  const { events, options } = rig({ capMs: 100, waiters: 1 });
  let batches = 0;
  await runWarmHold({ ...options, graceSeconds: 0.2, shoot: async ({ signal, checkpoint }) => {
    watchAbort(signal, events);
    for (; batches < 6 && !signal.aborted; batches++) { await sleep(40); await checkpoint(); }
  } });
  assert.equal(batches, 6, 'every batch ran');
  assert.ok(events.includes('yield') && !events.includes('abort'), `it yielded at the cap and was not stopped (${events.join(' ')})`);
  const resumed = events.indexOf('hold again');
  assert.deepEqual(events.slice(resumed - 2, resumed + 2), ['release', 'yield', 'hold again', 'thaw'],
    'frozen before the yield (the release), thawed once held again');
  assert.equal(events[events.indexOf('yield') - 2], 'freeze', 'the pages froze before the lock was given up');
}

// ---- the cap, not cooperative: stopped past the cap while anyone waits; kept with nobody waiting ---------------------
for (const waiters of [1, 0]) {
  const { events, options } = rig({ capMs: 60, waiters });
  const started = Date.now();
  await runWarmHold({ ...options, graceSeconds: 0.05, shoot: async ({ signal }) => {
    watchAbort(signal, events);
    await Promise.race([new Promise((done) => signal.addEventListener('abort', done, { once: true })), sleep(400)]);
  } });
  if (waiters) {
    assert.ok(events.includes('abort') && Date.now() - started < 380, `a shoot that never checkpoints is stopped at the cap with a waiter (${events.join(' ')})`);
  } else {
    assert.ok(!events.includes('abort'), 'past the cap with nobody waiting, the hold keeps the lock');
  }
}

// ---- atCap: 'keep' (a wrapped command that cannot yield or stop part-way): past the cap it is logged, not stopped ------
{
  const events = [], lines = [];
  const lock = fakeLock({ capMs: 40, waiters: 1, events });
  await withCaptureHold(async ({ signal }) => { watchAbort(signal, events); await sleep(250); },
    { lock, atCap: 'keep', capCheckMs: 10, graceSeconds: 0.05, log: (line) => lines.push(line) });
  assert.ok(!events.includes('abort'), 'a declared keep is never stopped by the cap');
  assert.equal(lines.filter((line) => /cannot yield \(atCap: keep\)/.test(line)).length, 1, 'and says so once');
  await assert.rejects(withCaptureHold(async () => {}, { lock: fakeLock({ events: [] }), atCap: 'never', log: () => {} }), /atCap/);
}

// ---- a nested hold runs no cap: its parent's is the one -------------------------------------------------------------
{
  const { events, options } = rig({ capMs: 30, waiters: 1, nested: true });
  await runWarmHold({ ...options, graceSeconds: 0.05, shoot: async ({ signal }) => { watchAbort(signal, events); await sleep(200); } });
  assert.ok(!events.includes('abort'), 'never stopped by a cap it does not own');
}

// ---- withCaptureHold: teardown before the release; a failed wait tears down what it prepared ------------------------
{
  const events = [];
  const lock = fakeLock({ events });
  const result = await withCaptureHold(async ({ prepared }) => { events.push(`work ${prepared}`); return 'done'; },
    { lock, log: () => {}, prepare: async () => 'warm', teardown: async (value) => { events.push(`teardown ${value}`); } });
  assert.equal(result, 'done');
  assert.deepEqual(events, ['hold', 'work warm', 'teardown warm', 'release'], 'the work, then the teardown, then the release');
  const failing = { acquire: async (_ms, { prepare }) => { throw Object.assign(new Error('cot-shots lock timeout'), { prepared: await prepare() }); },
    release: () => false, refresh: () => false };
  const torn = [];
  await assert.rejects(withCaptureHold(async () => {}, { lock: failing, log: () => {}, prepare: async () => 'warm',
    teardown: async (value) => { torn.push(value); } }), /lock timeout/);
  assert.deepEqual(torn, ['warm'], 'a wait that ends without a hold tears down what it prepared');
}

// ---- (round 2 U38) the open form: a script tool's hold is withCaptureHold's, two lines at its acquire and its release ----
// 75 tools and 28 receipts acquired the lock themselves, each with its own refresh timer and none with the cap: past it a
// tool that never checkpoints kept the lock however many waited. openCaptureHold resolves once held; release() ends it.
{
  const { openCaptureHold } = captureHold;
  assert.equal(typeof openCaptureHold, 'function', 'the one wrapper has an open form for script tools');
  // held, then released by the caller, once; the default teardown never runs on the normal way out
  const events = [];
  const hold = await openCaptureHold({ lock: fakeLock({ events }), log: () => {}, prepare: async () => 'warm', teardown: async () => events.push('teardown') });
  assert.equal(hold.prepared, 'warm');
  assert.ok(hold.signal instanceof AbortSignal && typeof hold.checkpoint === 'function', 'the hold\'s signal and checkpoint');
  events.push('work');
  const first = hold.release(), second = hold.release();
  assert.equal(first, second, 'release() once; a second call returns the same promise');
  await first;
  assert.deepEqual(events, ['hold', 'work', 'release'], 'the caller closed its own: no teardown on the way out');
  // a wait that fails rejects (no unhandled rejection), and nothing is held
  const failing = { acquire: async () => { throw new Error('cot-shots lock timeout'); }, release: () => false, refresh: () => false };
  await assert.rejects(openCaptureHold({ lock: failing, log: () => {} }), /lock timeout/);
  // the cap: past it with a waiter, a tool that never checkpoints has its signal aborted, then its teardown run after the
  // grace (by default every guarded browser of the process stops); its release waits for that teardown
  const capped = [];
  const capHold = await openCaptureHold({ lock: fakeLock({ capMs: 30, waiters: 1, events: capped }), log: () => {}, capCheckMs: 10, graceSeconds: 0.05,
    teardown: async () => { await sleep(60); capped.push('teardown done'); } });
  watchAbort(capHold.signal, capped);
  await sleep(250); // a script that ignores the signal
  await capHold.release();
  assert.deepEqual(capped, ['hold', 'abort', 'teardown done', 'release'], `stopped at the cap, torn down, then released (${capped.join(' ')})`);
  // a declared keep is logged, never stopped
  const kept = [];
  const keepHold = await openCaptureHold({ lock: fakeLock({ capMs: 30, waiters: 1, events: kept }), log: () => {}, capCheckMs: 10, graceSeconds: 0.05,
    atCap: 'keep', teardown: async () => kept.push('teardown') });
  watchAbort(keepHold.signal, kept);
  await sleep(150);
  await keepHold.release();
  assert.deepEqual(kept, ['hold', 'release'], 'atCap keep: past the cap, not stopped');
}

// ---- (round 2 U38 review) a stop is enforced: the lock goes without the work, and no browser launches under it ----------
// The open hold's default teardown stops guarded browsers, so for a holder with none (seven CPU-only tools) a cap stop was a
// log line and the lock stayed until the tool ended; and teardown runs once, so a per-row loop that caught the kill
// launched its next browser and drew on. Now a work still running `teardownWaitMs` after its teardown began loses the lock,
// and a stopped hold refuses the process's launches until it is released.
{
  const { openCaptureHold } = captureHold;
  // a tool that never releases loses the lock: cap 30 ms, grace 50 ms, then 80 ms after its teardown began
  const forfeit = [];
  const neverReleased = await openCaptureHold({ lock: fakeLock({ capMs: 30, waiters: 1, events: forfeit }), log: () => {}, capCheckMs: 10,
    graceSeconds: 0.05, teardownWaitMs: 80, teardown: async () => forfeit.push('teardown') });
  watchAbort(neverReleased.signal, forfeit);
  for (let i = 0; i < 100 && !forfeit.includes('release'); i++) await sleep(10);
  assert.deepEqual(forfeit, ['hold', 'abort', 'teardown', 'release'], `the caller never released, and the lock went at the cap (${forfeit.join(' ')})`);
  await neverReleased.release();
  assert.deepEqual(forfeit, ['hold', 'abort', 'teardown', 'release'], 'its late release() releases nothing twice');
  // the function form: a work that ignores its signal is out of the lock before it ends
  const work = [];
  await withCaptureHold(async ({ signal }) => { watchAbort(signal, work); await sleep(400); work.push('work end'); },
    { lock: fakeLock({ capMs: 30, waiters: 1, events: work }), log: () => {}, capCheckMs: 10, graceSeconds: 0.05, teardownWaitMs: 80,
      teardown: async () => work.push('teardown') });
  assert.deepEqual(work, ['hold', 'abort', 'teardown', 'release', 'work end'], `forfeited before the work ended (${work.join(' ')})`);
  // a stopped hold refuses this process's launches, and lifts the refusal once released
  const { launchGuardedBrowser } = await import('./browser-launch.mjs');
  const refusal = [];
  const stopped = await openCaptureHold({ label: 'refusing', lock: fakeLock({ capMs: 30, waiters: 1, events: refusal }), log: () => {}, capCheckMs: 10,
    graceSeconds: 5, teardown: async () => {} });
  for (let i = 0; i < 100 && !stopped.signal.aborted; i++) await sleep(10);
  assert.ok(stopped.signal.aborted, 'stopped at the cap');
  let launched = 0;
  const launcher = { launch: async () => { launched++; return { double: true }; } };
  await assert.rejects(launchGuardedBrowser(launcher, {}, { label: 'next-row' }), /next-row\) refused: the refusing capture hold was stopped/);
  assert.equal(launched, 0, 'the launcher never ran');
  await stopped.release();
  assert.deepEqual(await launchGuardedBrowser(launcher), { double: true }, 'launches again once the stopped hold is released');
  // between(): a synchronous tool's steps let the refresh and the cap run; at the cap it yields (it checkpoints), and once
  // stopped it throws the stop's reason
  const steps = [];
  const cpu = await openCaptureHold({ lock: fakeLock({ capMs: 30, waiters: 1, events: steps }), log: () => {}, capCheckMs: 10, graceSeconds: 0.05 });
  for (let i = 0; i < 12; i++) { await cpu.between(); const until = Date.now() + 8; while (Date.now() < until) { /* a synchronous step */ } }
  await cpu.release();
  assert.ok(steps.includes('yield') && !cpu.signal.aborted, `between() yields at the cap (${steps.join(' ')})`);
  const halted = await openCaptureHold({ lock: fakeLock({ capMs: null, waiters: 1, events: [] }), log: () => {}, capCheckMs: 10, graceSeconds: 5,
    holdMinutes: 0.0005, teardown: async () => {} });
  for (let i = 0; i < 100 && !halted.signal.aborted; i++) await sleep(10);
  await assert.rejects(halted.between(), /hold limit/, 'a stopped hold\'s between() throws the stop\'s reason');
  await halted.release();
  // (review 2) a stop that comes while between()'s checkpoint runs (its yield, its resume) is thrown when it returns: the
  // step after it never runs stopped. The budget (120 ms) restarts at the resume and ends inside the checkpoint's last 400 ms.
  const late = await openCaptureHold({ lock: fakeLock({ capMs: 1, waiters: 1, yieldWaitMs: 5, resumeDelayMs: 400, events: [] }), log: () => {},
    capCheckMs: 1_000, graceSeconds: 5, holdMinutes: 0.002, teardown: async () => {} });
  await sleep(5);
  const lateStep = await late.between().then(() => 'returned', (error) => error);
  assert.ok(late.signal.aborted, 'the budget stopped the hold during the checkpoint');
  assert.match(String(lateStep?.message ?? lateStep), /hold limit/, 'and between() throws the stop\'s reason when its checkpoint returns');
  await late.release();
}

// ---- withCaptureHold on a real private lock: a SIGTERM tears down, releases and exits 143 --------------------------
{
  const root = mkdtempSync(join(tmpdir(), 'cot-hold-phases-'));
  try {
    const lockDir = join(root, 'lock'), marker = join(root, 'torn');
    const script = `import { writeFileSync } from 'node:fs';
      import { createCaptureLock } from ${JSON.stringify(new URL('./capture-lock.mjs', import.meta.url).href)};
      import { withCaptureHold } from ${JSON.stringify(new URL('./capture-hold.mjs', import.meta.url).href)};
      const lock = createCaptureLock({ lockDir: ${JSON.stringify(lockDir)}, queueDir: ${JSON.stringify(join(root, 'queue'))}, log: () => {} });
      setInterval(() => {}, 1000);
      await withCaptureHold(async () => { console.log('holding'); await new Promise(() => {}); },
        { lock, log: () => {}, timeoutMs: 5000, teardown: async () => writeFileSync(${JSON.stringify(marker)}, String(Date.now())) });`;
    const child = spawn(process.execPath, ['--input-type=module', '-e', script], { stdio: ['ignore', 'pipe', 'inherit'] });
    let out = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => { out += chunk; });
    for (let i = 0; i < 400 && !out.includes('holding'); i++) await sleep(25);
    assert.ok(existsSync(lockDir), 'the child holds its private lock');
    child.kill('SIGTERM');
    const code = await new Promise((done) => child.once('close', (status) => done(status)));
    assert.equal(code, 143, 'it exits 128 + SIGTERM');
    assert.ok(existsSync(marker) && Number(readFileSync(marker, 'utf8')) > 0, 'its teardown ran');
    assert.equal(existsSync(lockDir), false, 'and its hold was released');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
// ---- (round 2 U38) the open form on a real private lock: a SIGTERM stops it as any hold; its lines stay off stdout ------
{
  const root = mkdtempSync(join(tmpdir(), 'cot-hold-open-'));
  try {
    const lockDir = join(root, 'lock'), marker = join(root, 'torn');
    const script = `import { writeFileSync } from 'node:fs';
      import { createCaptureLock } from ${JSON.stringify(new URL('./capture-lock.mjs', import.meta.url).href)};
      import { openCaptureHold } from ${JSON.stringify(new URL('./capture-hold.mjs', import.meta.url).href)};
      const lock = createCaptureLock({ lockDir: ${JSON.stringify(lockDir)}, queueDir: ${JSON.stringify(join(root, 'queue'))}, log: () => {} });
      setInterval(() => {}, 1000);
      const hold = await openCaptureHold({ lock, label: 'open-probe', timeoutMs: 5000, signalWaitMs: 300,
        teardown: async () => writeFileSync(${JSON.stringify(marker)}, 'torn') });
      console.log(JSON.stringify({ holding: true }));
      try { await new Promise(() => {}); } finally { await hold.release(); }`;
    const child = spawn(process.execPath, ['--input-type=module', '-e', script], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => { out += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { err += chunk; });
    for (let i = 0; i < 400 && !out.includes('holding'); i++) await sleep(25);
    assert.ok(existsSync(lockDir), `the child holds its private lock: ${err.slice(-400)}`);
    child.kill('SIGTERM');
    const code = await new Promise((done) => child.once('close', (status) => done(status)));
    assert.equal(code, 143, 'it exits 128 + SIGTERM');
    assert.equal(readFileSync(marker, 'utf8'), 'torn', 'its teardown ran');
    assert.equal(existsSync(lockDir), false, 'and its hold was released');
    assert.equal(out.trim(), '{"holding":true}', 'stdout is the tool\'s own (a report stays parseable)');
    assert.match(err, /\[open-probe [\d:]+\] lock held after/, 'the hold\'s lines go to stderr');
    assert.match(err, /has not released 0\.3 s after its teardown; releasing for it/, 'a caller that never comes out is released for, then the exit');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
// ---- (round 2 U38 review) the open form's signal path lets the caller's way out run ------------------------------------
// Round one's open form released and exited within microseconds of a SIGTERM, and a caller's `await hold.release()` never
// returned: a migrated tool's finally (its Vite server, its temporary directory) and what followed its release (a preview
// child killed, a report written) never ran. On base (a direct acquire) puppeteer's own SIGTERM listener kept the process
// alive and the finally cleaned up. Modelled here: a stand-in guarded browser (the default teardown kills it), a server
// child stopped after the release, a report written last, and puppeteer's non-exiting listener.
{
  const root = mkdtempSync(join(tmpdir(), 'cot-hold-unwind-'));
  const strays = []; // a failed run's server and browser are stopped here, never left behind (a passed run asserts them gone)
  let passed = false;
  try {
    const lockDir = join(root, 'lock'), events = join(root, 'events'), report = join(root, 'report.json');
    writeFileSync(events, '');
    const script = `import { spawn } from 'node:child_process';
      import { appendFileSync, writeFileSync } from 'node:fs';
      import { createCaptureLock } from ${JSON.stringify(new URL('./capture-lock.mjs', import.meta.url).href)};
      import { openCaptureHold } from ${JSON.stringify(new URL('./capture-hold.mjs', import.meta.url).href)};
      import { launchGuardedBrowser } from ${JSON.stringify(new URL('./browser-launch.mjs', import.meta.url).href)};
      const note = (line) => appendFileSync(${JSON.stringify(events)}, line + '\\n');
      process.on('SIGTERM', () => note('puppeteer listener')); // @puppeteer/browsers: closes the browser, never exits
      const lock = createCaptureLock({ lockDir: ${JSON.stringify(lockDir)}, queueDir: ${JSON.stringify(join(root, 'queue'))}, log: () => {} });
      const server = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
      const hold = await openCaptureHold({ lock, label: 'unwind-probe', timeoutMs: 5000 });
      let child = null;
      const launcher = { launch: async (options) => {
        child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)', '--', ...options.args], { detached: true, stdio: 'ignore' });
        return { process: () => child, close: async () => { try { child.kill('SIGKILL'); } catch { /* gone */ } } };
      } };
      const browser = await launchGuardedBrowser(launcher, {}, { label: 'stand-in', intervalMs: 60_000 });
      note('up server=' + server.pid + ' browser=' + child.pid);
      try {
        // the run waits on its browser, as a page call does, and fails once the browser is gone
        await new Promise((_, reject) => child.once('exit', () => reject(new Error('Target closed'))));
      } catch (error) { note('run failed: ' + error.message + ' (signal aborted: ' + hold.signal.aborted + ')'); }
      finally {
        await browser.close();
        await hold.release();
        note('released');
        await launchGuardedBrowser(launcher).then(() => note('relaunched'), (error) => note('relaunch: ' + error.message));
        server.kill('SIGTERM');
        await new Promise((done) => server.once('exit', done));
        note('server stopped');
        writeFileSync(${JSON.stringify(report)}, JSON.stringify({ interrupted: true }));
        note('report written');
      }`;
    const child = spawn(process.execPath, ['--input-type=module', '-e', script], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    child.stderr.setEncoding('utf8').on('data', (chunk) => { err += chunk; });
    const read = () => readFileSync(events, 'utf8').trim().split('\n').filter(Boolean);
    for (let i = 0; i < 800 && !read().some((line) => line.startsWith('up ')); i++) await sleep(25);
    const up = read().find((line) => line.startsWith('up ')) ?? '';
    const serverPid = Number(/server=(\d+)/.exec(up)?.[1]), browserPid = Number(/browser=(\d+)/.exec(up)?.[1]);
    strays.push(serverPid, browserPid);
    assert.ok(serverPid > 0 && browserPid > 0 && existsSync(lockDir), `the child holds, with a server and a browser up: ${err.slice(-400)}`);
    const started = Date.now();
    child.kill('SIGTERM');
    const code = await new Promise((done) => child.once('close', (status, signal) => done(status ?? signal)));
    const lines = read();
    assert.equal(code, 143, `it exits 128 + SIGTERM (${lines.join(', ')}; ${err.slice(-300)})`);
    assert.ok(Date.now() - started < 20_000, 'on its own once its way out is done, not at the bound');
    const order = ['run failed: Target closed (signal aborted: true)', 'released', 'server stopped', 'report written'];
    assert.deepEqual(lines.filter((line) => order.includes(line)), order, `the browser stopped, the finally ran to its release, then what follows (${lines.join(', ')})`);
    assert.ok(lines.some((line) => /^relaunch: .*refused: SIGTERM: the process is stopping/.test(line)), `no browser launches after the signal (${lines.join(', ')})`);
    assert.ok(lines.includes('puppeteer listener'), 'a non-exiting listener beside the owner changes nothing');
    assert.deepEqual(JSON.parse(readFileSync(report, 'utf8')), { interrupted: true }, 'the report is written');
    assert.throws(() => process.kill(serverPid, 0), /ESRCH/, 'the server child is stopped, not orphaned');
    assert.throws(() => process.kill(browserPid, 0), /ESRCH/, 'the browser is gone');
    assert.equal(existsSync(lockDir), false, 'and the hold was released');
    passed = true;
  } finally {
    if (!passed) for (const pid of strays) { try { if (pid > 0) process.kill(pid, 'SIGKILL'); } catch { /* gone */ } }
    rmSync(root, { recursive: true, force: true });
  }
}
// ---- (round 3 B16) the unwind on SIGINT as on SIGTERM, with puppeteer's own signal handling --------------------------------
// The browser above is a stand-in with a hand-written listener. Real puppeteer (puppeteer-core's launcher hands its
// handleSIGINT/SIGTERM/SIGHUP, true unless the caller says otherwise, to @puppeteer/browsers' launch) answers SIGINT with
// kill() and process.exit(130) inside its own listener, so on Ctrl-C the process ended before the hold's unwind ran: the
// caller's finally never ran, its preview child was orphaned and its report never written. launchGuardedBrowser now
// hands handleSIGINT: false unless the caller sets it. Driven here through @puppeteer/browsers' own launch (a node child
// stands in for Chrome), with puppeteer-core's defaults, for SIGINT and SIGTERM.
{
  const browsersUrl = import.meta.resolve('@puppeteer/browsers');
  for (const [signal, exitCode] of [['SIGINT', 130], ['SIGTERM', 143]]) {
    const root = mkdtempSync(join(tmpdir(), 'cot-hold-unwind-real-'));
    const strays = [];
    let passed = false;
    try {
      const lockDir = join(root, 'lock'), events = join(root, 'events'), report = join(root, 'report.json');
      writeFileSync(events, '');
      const script = `import { spawn } from 'node:child_process';
        import { appendFileSync, writeFileSync } from 'node:fs';
        import { launch } from ${JSON.stringify(browsersUrl)};
        import { createCaptureLock } from ${JSON.stringify(new URL('./capture-lock.mjs', import.meta.url).href)};
        import { openCaptureHold } from ${JSON.stringify(new URL('./capture-hold.mjs', import.meta.url).href)};
        import { launchGuardedBrowser } from ${JSON.stringify(new URL('./browser-launch.mjs', import.meta.url).href)};
        const note = (line) => appendFileSync(${JSON.stringify(events)}, line + '\\n');
        // puppeteer-core's BrowserLauncher.launch: handleSIGINT/SIGTERM/SIGHUP default true, handed to @puppeteer/browsers
        const puppeteerLike = { launch: async ({ args = [], handleSIGINT = true, handleSIGTERM = true, handleSIGHUP = true }) => {
          const proc = launch({ executablePath: process.execPath, args: ['-e', 'setInterval(() => {}, 1000)', '--', ...args],
            handleSIGINT, handleSIGTERM, handleSIGHUP });
          return { process: () => proc.nodeProcess, close: () => proc.close() };
        } };
        const lock = createCaptureLock({ lockDir: ${JSON.stringify(lockDir)}, queueDir: ${JSON.stringify(join(root, 'queue'))}, log: () => {} });
        const server = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
        const hold = await openCaptureHold({ lock, label: 'unwind-real-probe', timeoutMs: 5000 });
        const browser = await launchGuardedBrowser(puppeteerLike, {}, { label: 'stand-in', intervalMs: 60_000 });
        const child = browser.process();
        note('up server=' + server.pid + ' browser=' + child.pid);
        try {
          await new Promise((_, reject) => child.once('exit', () => reject(new Error('Target closed'))));
        } catch (error) { note('run failed: ' + error.message + ' (signal aborted: ' + hold.signal.aborted + ')'); }
        finally {
          await browser.close();
          await hold.release();
          note('released');
          server.kill('SIGTERM');
          await new Promise((done) => server.once('exit', done));
          note('server stopped');
          writeFileSync(${JSON.stringify(report)}, JSON.stringify({ interrupted: true }));
          note('report written');
        }`;
      const child = spawn(process.execPath, ['--input-type=module', '-e', script], { stdio: ['ignore', 'ignore', 'pipe'] });
      let err = '';
      child.stderr.setEncoding('utf8').on('data', (chunk) => { err += chunk; });
      const read = () => readFileSync(events, 'utf8').trim().split('\n').filter(Boolean);
      for (let i = 0; i < 800 && !read().some((line) => line.startsWith('up ')); i++) await sleep(25);
      const up = read().find((line) => line.startsWith('up ')) ?? '';
      const serverPid = Number(/server=(\d+)/.exec(up)?.[1]), browserPid = Number(/browser=(\d+)/.exec(up)?.[1]);
      strays.push(serverPid, browserPid);
      assert.ok(serverPid > 0 && browserPid > 0 && existsSync(lockDir), `${signal}: the child holds, with a server and a browser up: ${err.slice(-400)}`);
      child.kill(signal);
      const code = await new Promise((done) => child.once('close', (status, killedBy) => done(status ?? killedBy)));
      const lines = read();
      assert.equal(code, exitCode, `${signal}: it exits 128 + n (${lines.join(', ')}; ${err.slice(-300)})`);
      const order = ['run failed: Target closed (signal aborted: true)', 'released', 'server stopped', 'report written'];
      assert.deepEqual(lines.filter((line) => order.includes(line)), order,
        `${signal}: the browser stopped, the finally ran to its release, then what follows (${lines.join(', ')})`);
      assert.deepEqual(JSON.parse(readFileSync(report, 'utf8')), { interrupted: true }, `${signal}: the report is written`);
      assert.throws(() => process.kill(serverPid, 0), /ESRCH/, `${signal}: the server child is stopped, not orphaned`);
      for (let i = 0; i < 100; i++) { try { process.kill(browserPid, 0); await sleep(20); } catch { break; } }
      assert.throws(() => process.kill(browserPid, 0), /ESRCH/, `${signal}: the browser is gone`);
      assert.equal(existsSync(lockDir), false, `${signal}: and the hold was released`);
      passed = true;
    } finally {
      if (!passed) for (const pid of strays) { try { if (pid > 0) process.kill(pid, 'SIGKILL'); } catch { /* gone */ } }
      rmSync(root, { recursive: true, force: true });
    }
  }
}
// ---- (round 2 U38 review) a hold queued at a signal leaves the queue, and its caller's way out runs ---------------------
{
  const root = mkdtempSync(join(tmpdir(), 'cot-hold-queued-'));
  const { createCaptureLock } = await import('./capture-lock.mjs');
  const lockDir = join(root, 'lock'), queueDir = join(root, 'queue'), out = join(root, 'out.json');
  const holder = createCaptureLock({ lockDir, queueDir, log: () => {} });
  try {
    await holder.acquire(2_000);
    const script = `import { writeFileSync } from 'node:fs';
      import { createCaptureLock } from ${JSON.stringify(new URL('./capture-lock.mjs', import.meta.url).href)};
      import { openCaptureHold } from ${JSON.stringify(new URL('./capture-hold.mjs', import.meta.url).href)};
      const lock = createCaptureLock({ lockDir: ${JSON.stringify(lockDir)}, queueDir: ${JSON.stringify(queueDir)}, log: () => {} });
      let outcome = 'held';
      try { const hold = await openCaptureHold({ lock, label: 'queued-probe', timeoutMs: 60_000 }); await hold.release(); }
      catch (error) { outcome = error.code ?? error.message; }
      finally { writeFileSync(${JSON.stringify(out)}, JSON.stringify({ outcome })); }`;
    const child = spawn(process.execPath, ['--input-type=module', '-e', script], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    child.stderr.setEncoding('utf8').on('data', (chunk) => { err += chunk; });
    const tickets = () => { try { return readdirSync(queueDir).filter((name) => /\.[tw]$/.test(name)); } catch { return []; } };
    for (let i = 0; i < 400 && !tickets().length; i++) await sleep(25);
    assert.equal(tickets().length, 1, `the child waits in the queue: ${err.slice(-300)}`);
    child.kill('SIGTERM');
    const code = await new Promise((done) => child.once('close', (status, signal) => done(status ?? signal)));
    assert.equal(code, 143, `it exits 128 + SIGTERM: ${err.slice(-300)}`);
    assert.deepEqual(JSON.parse(readFileSync(out, 'utf8')), { outcome: 'CAPTURE_HOLD_SIGNAL' }, 'its openCaptureHold rejected, and its finally ran');
    assert.deepEqual(tickets(), [], 'its ticket left the queue');
    assert.ok(holder.held && holder.refresh(), 'the holder keeps its lock');
  } finally {
    holder.release();
    rmSync(root, { recursive: true, force: true });
  }
}
// ---- (round 2 U38 review 2) a signal while the open hold waits in its cap yield's re-queue lets the caller out ------------
// loading-census checkpoints between rows and pages, so on a contended lock it spends much of a run re-queued after a yield.
// That re-queue took no withdraw signal: a SIGTERM there left the caller blocked in checkpoint(), the hold was released for
// it 30 s later and the process exited with its finally never run (its preview server orphaned, its report never written).
{
  const root = mkdtempSync(join(tmpdir(), 'cot-hold-yield-'));
  const { createCaptureLock } = await import('./capture-lock.mjs');
  const lockDir = join(root, 'lock'), queueDir = join(root, 'queue'), events = join(root, 'events'), report = join(root, 'report.json');
  writeFileSync(events, '');
  const waiter = createCaptureLock({ lockDir, queueDir, log: () => {} });
  const strays = [];
  let passed = false;
  try {
    const script = `import { spawn } from 'node:child_process';
      import { appendFileSync, writeFileSync } from 'node:fs';
      import { createCaptureLock } from ${JSON.stringify(new URL('./capture-lock.mjs', import.meta.url).href)};
      import { openCaptureHold } from ${JSON.stringify(new URL('./capture-hold.mjs', import.meta.url).href)};
      const note = (line) => appendFileSync(${JSON.stringify(events)}, line + '\\n');
      const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
      // a 200 ms cap: the child yields at its first checkpoint past it once the parent queues
      const lock = createCaptureLock({ lockDir: ${JSON.stringify(lockDir)}, queueDir: ${JSON.stringify(queueDir)}, log: (line) => note('lock: ' + line), holdCapMs: 200 });
      const server = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
      let hold = null;
      try {
        hold = await openCaptureHold({ lock, label: 'yield-probe', timeoutMs: 60_000, capCheckMs: 50, signalWaitMs: 3000 });
        note('up server=' + server.pid);
        for (let row = 0; row < 100_000; row++) { await sleep(25); if ((await hold.checkpoint())?.yielded) note('resumed'); }
      } catch (error) { note('run failed: ' + (error.code ?? error.message)); }
      finally {
        server.kill('SIGTERM');
        await new Promise((done) => server.once('exit', done));
        note('server stopped');
        await hold?.release();
        note('released');
        writeFileSync(${JSON.stringify(report)}, JSON.stringify({ interrupted: true }));
        note('report written');
      }`;
    const child = spawn(process.execPath, ['--input-type=module', '-e', script], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    child.stderr.setEncoding('utf8').on('data', (chunk) => { err += chunk; });
    const read = () => readFileSync(events, 'utf8').trim().split('\n').filter(Boolean);
    for (let i = 0; i < 800 && !read().some((line) => line.startsWith('up ')); i++) await sleep(25);
    const serverPid = Number(/server=(\d+)/.exec(read().find((line) => line.startsWith('up ')) ?? '')?.[1]);
    strays.push(serverPid);
    assert.ok(serverPid > 0 && existsSync(lockDir), `the child holds, with a server up: ${err.slice(-400)}`);
    // the parent queues; past its cap the child yields to it and re-queues behind it
    await waiter.acquire(20_000);
    const tickets = () => { try { return readdirSync(queueDir).filter((name) => /\.[tw]$/.test(name)); } catch { return []; } };
    for (let i = 0; i < 400 && !tickets().length; i++) await sleep(25);
    assert.equal(tickets().length, 1, `the child waits in its yield's re-queue (${read().join(', ')})`);
    assert.ok(read().some((line) => /yielding at its checkpoint and re-queueing/.test(line)), 'it yielded at its checkpoint');
    child.kill('SIGTERM');
    const code = await new Promise((done) => child.once('close', (status, signal) => done(status ?? signal)));
    const lines = read().filter((line) => !line.startsWith('lock: '));
    assert.equal(code, 143, `it exits 128 + SIGTERM (${lines.join(', ')}; ${err.slice(-300)})`);
    const order = ['run failed: CAPTURE_HOLD_SIGNAL', 'server stopped', 'released', 'report written'];
    assert.deepEqual(lines.filter((line) => order.includes(line)), order,
      `the re-queue is withdrawn, the caller's checkpoint rejects, and its finally runs to the end (${lines.join(', ')})`);
    assert.ok(!/releasing for it/.test(err), `nobody was released for (${err.slice(-300)})`);
    assert.deepEqual(JSON.parse(readFileSync(report, 'utf8')), { interrupted: true }, 'the report is written');
    assert.throws(() => process.kill(serverPid, 0), /ESRCH/, 'the server child is stopped, not orphaned');
    assert.deepEqual(tickets(), [], 'its ticket left the queue');
    assert.ok(waiter.held && waiter.refresh(), 'the hold it yielded to keeps the lock');
    passed = true;
  } finally {
    if (!passed) for (const pid of strays) { try { if (pid > 0) process.kill(pid, 'SIGKILL'); } catch { /* gone */ } }
    waiter.release();
    rmSync(root, { recursive: true, force: true });
  }
}
// ---- (round 3 A5) a cap yield that fails without a signal stops the work as any stop does ------------------------------
// The yield's re-queue can fail for a reason that is no signal: its wait runs out (45 min by default, 240 min for
// loading-census) behind a holder that keeps the lock, or the yield's own freeze (onYield) or thaw (onResume) throws. The
// phases moved to 'stopping' with none of a stop's effects: the hold's signal never aborted, launches stayed allowed, and
// later checkpoints and between() returned { stopped: true } quietly, so loading-census (which records the rejection as a
// page error) carried on through every remaining condition and layout, launching browsers, without the lock.
{
  const { openCaptureHold } = captureHold;
  const { launchGuardedBrowser } = await import('./browser-launch.mjs');
  const launcher = { launch: async () => ({ double: true }) };
  const launches = () => launchGuardedBrowser(launcher, {}, { label: 'next-row' }).then(() => 'launched', (error) => `refused: ${error.message}`);
  // a lock whose checkpoint yields (beforeYield, then the release) and whose re-queue then fails: the wait ran out
  const yieldingLock = (events) => {
    let held = false;
    const lock = {
      async acquire() { held = true; events.push('hold'); },
      refresh() { return held; },
      release() { if (held) events.push('release'); held = false; return true; },
      waiting() { return 1; },
      get held() { return held; },
      get heldCapMs() { return held ? 1 : null; },
      get nested() { return false; },
      async checkpoint({ beforeYield } = {}) {
        await beforeYield?.();
        lock.release();
        events.push('yield');
        throw new Error('cot-shots lock timeout');
      },
    };
    return lock;
  };
  // the re-queue's wait ran out: nothing is held, so the teardown runs at once (not after the grace) and the work is stopped
  const events = [];
  const hold = await openCaptureHold({ label: 'requeue-timeout', lock: yieldingLock(events), log: () => {}, capCheckMs: 5_000, graceSeconds: 5,
    teardown: async () => { events.push('teardown'); } });
  watchAbort(hold.signal, events);
  const step = await hold.checkpoint().then(() => 'returned', (error) => error.message);
  assert.equal(step, 'cot-shots lock timeout', 'the checkpoint rejects with the re-queue\'s failure');
  assert.equal(hold.signal.aborted, true, `a failed re-queue stops the work: the hold's signal aborts (${events.join(' ')})`);
  await assert.rejects(hold.between(), /lock timeout/, 'and between() throws the failure, never { stopped: true } quietly');
  assert.match(await launches(), /refused: .*requeue-timeout capture hold was stopped/, 'no browser launches while it holds nothing');
  for (let i = 0; i < 100 && !events.includes('teardown'); i++) await sleep(10);
  assert.ok(events.includes('teardown'), `nothing is held, so the teardown runs at once, not after the 5 s grace (${events.join(' ')})`);
  assert.deepEqual(await hold.checkpoint(), { yielded: false, stopped: true }, 'a later checkpoint never yields');
  await hold.release();
  assert.equal(await launches(), 'launched', 'launches again once the hold is released');
  assert.deepEqual(events, ['hold', 'release', 'yield', 'abort', 'teardown'], `one stop, one teardown (${events.join(' ')})`);
  // the yield's own freeze (onYield) throws with the lock still held: stopped as at the cap, its teardown after the grace
  const held = [];
  const frozen = await openCaptureHold({ label: 'freeze-failed', lock: yieldingLock(held), log: () => {}, capCheckMs: 5_000, graceSeconds: 0.05,
    onYield: async () => { throw new Error('freeze failed: Target closed'); }, teardown: async () => { held.push('teardown'); } });
  watchAbort(frozen.signal, held);
  assert.equal(await frozen.checkpoint().then(() => 'returned', (error) => error.message), 'freeze failed: Target closed');
  assert.equal(frozen.signal.aborted, true, `a failed yield with the lock still held stops the work (${held.join(' ')})`);
  assert.match(await launches(), /refused: .*freeze-failed capture hold was stopped/, 'and refuses launches');
  for (let i = 0; i < 100 && !held.includes('teardown'); i++) await sleep(10);
  await frozen.release();
  assert.deepEqual(held, ['hold', 'abort', 'teardown', 'release'], `the teardown after the grace, then the release (${held.join(' ')})`);
  assert.equal(await launches(), 'launched');
}
// ---- (round 3 A5) on a real private lock: a re-queue that times out behind a holder that keeps the lock ----------------
{
  const root = mkdtempSync(join(tmpdir(), 'cot-hold-requeue-'));
  const { createCaptureLock } = await import('./capture-lock.mjs');
  const lockDir = join(root, 'lock'), queueDir = join(root, 'queue'), events = join(root, 'events');
  writeFileSync(events, '');
  const waiter = createCaptureLock({ lockDir, queueDir, log: () => {} });
  try {
    const script = `import { appendFileSync } from 'node:fs';
      import { createCaptureLock } from ${JSON.stringify(new URL('./capture-lock.mjs', import.meta.url).href)};
      import { openCaptureHold } from ${JSON.stringify(new URL('./capture-hold.mjs', import.meta.url).href)};
      import { launchGuardedBrowser } from ${JSON.stringify(new URL('./browser-launch.mjs', import.meta.url).href)};
      const note = (line) => appendFileSync(${JSON.stringify(events)}, line + '\\n');
      const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
      const lock = createCaptureLock({ lockDir: ${JSON.stringify(lockDir)}, queueDir: ${JSON.stringify(queueDir)}, log: (line) => note('lock: ' + line), holdCapMs: 200 });
      const hold = await openCaptureHold({ lock, label: 'requeue-probe', timeoutMs: 1500, capCheckMs: 50, teardown: async () => note('teardown') });
      note('up');
      let failure = null;
      for (let row = 0; row < 2_000 && !failure; row++) { await sleep(25); try { await hold.checkpoint(); } catch (error) { failure = error; } }
      note('checkpoint failed: ' + String(failure?.message ?? failure).split('\\n')[0]);
      note('signal aborted: ' + hold.signal.aborted);
      note('between: ' + await hold.between().then(() => 'returned', () => 'threw'));
      const launcher = { launch: async () => ({ double: true }) };
      note('launch: ' + await launchGuardedBrowser(launcher, {}, { label: 'next-row' }).then(() => 'launched', () => 'refused'));
      await hold.release();
      note('launch after release: ' + await launchGuardedBrowser(launcher).then(() => 'launched', () => 'refused'));`;
    const child = spawn(process.execPath, ['--input-type=module', '-e', script], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    child.stderr.setEncoding('utf8').on('data', (chunk) => { err += chunk; });
    const closed = new Promise((done) => child.once('close', (status, signal) => done(status ?? signal)));
    const read = () => readFileSync(events, 'utf8').trim().split('\n').filter((line) => line && !line.startsWith('lock: '));
    for (let i = 0; i < 800 && !read().includes('up'); i++) await sleep(25);
    assert.ok(read().includes('up'), `the child holds its private lock: ${err.slice(-400)}`);
    // the parent queues and keeps the lock it is yielded: the child's re-queue runs out after its 1.5 s wait
    await waiter.acquire(20_000);
    const code = await Promise.race([closed, sleep(60_000).then(() => 'still running')]);
    if (code === 'still running') child.kill('SIGKILL');
    const lines = read();
    assert.equal(code, 0, `the child ends on its own (${lines.join(', ')}; ${err.slice(-300)})`);
    assert.deepEqual(lines.filter((line) => !line.startsWith('teardown')), ['up', 'checkpoint failed: cot-shots lock timeout', 'signal aborted: true',
      'between: threw', 'launch: refused', 'launch after release: launched'], `a timed-out re-queue stops the work (${lines.join(', ')})`);
    assert.ok(lines.indexOf('teardown') > 0 && lines.indexOf('teardown') < lines.indexOf('launch after release: launched'), 'its teardown ran before the release');
    assert.ok(waiter.held && waiter.refresh(), 'the holder keeps its lock');
  } finally {
    waiter.release();
    rmSync(root, { recursive: true, force: true });
  }
}
// ---- several holds in one process (round 2): a signal stops them all before the one exit ------------------------------
// tank-release-check runs its capture steps four at a time through runCapturedCommand: one holding, the others queued.
// Each hold had its own handler and exited after its own teardown, so a queued hold's (nothing to tear down) exited at
// once: the holder's lock went by its 'exit' listener while its command ran on, and the command's SIGKILL timer died.
{
  const root = mkdtempSync(join(tmpdir(), 'cot-hold-signals-'));
  try {
    const events = join(root, 'events'), writes = join(root, 'writes');
    writeFileSync(events, '');
    writeFileSync(writes, '');
    // the holder's command takes 800 ms to stop after its SIGTERM, writing all the while
    // (its handler goes in before it says it is up: under load a TERM that came between the two killed it by default)
    const command = `const { appendFileSync } = require('node:fs');
      process.on('SIGTERM', () => { appendFileSync(${JSON.stringify(events)}, 'child TERM\\n');
        setTimeout(() => { appendFileSync(${JSON.stringify(events)}, 'child exit\\n'); process.exit(0); }, 800); });
      setInterval(() => appendFileSync(${JSON.stringify(writes)}, 'x'), 50);
      appendFileSync(${JSON.stringify(events)}, 'child up ' + process.pid + '\\n');`;
    const driver = `import { appendFileSync } from 'node:fs';
      import { runCapturedCommand } from ${JSON.stringify(new URL('./capture-command.mjs', import.meta.url).href)};
      const note = (line) => appendFileSync(${JSON.stringify(events)}, line + '\\n');
      const fake = (name, holds) => { let held = false; return {
        acquire: async () => { if (!holds) return new Promise(() => {}); held = true; note(name + ' hold'); },
        refresh: () => held, release: () => { if (held) note(name + ' release'); held = false; return true; } }; };
      process.on('exit', (code) => note('driver exit ' + code));
      runCapturedCommand(process.execPath, ['-e', ${JSON.stringify(command)}], { stdio: 'ignore' }, { lock: fake('A', true) })
        .then(() => note('A returned'), () => note('A failed'));
      runCapturedCommand(process.execPath, ['-e', 'setTimeout(() => {}, 1e6)'], { stdio: 'ignore' }, { lock: fake('B', false) })
        .then(() => note('B returned'), () => note('B failed'));`;
    const child = spawn(process.execPath, ['--input-type=module', '-e', driver], { stdio: ['ignore', 'ignore', 'inherit'] });
    const read = () => readFileSync(events, 'utf8').trim().split('\n').filter(Boolean);
    for (let i = 0; i < 800 && !read().some((line) => line.startsWith('child up')); i++) await sleep(25);
    const childPid = Number(read().find((line) => line.startsWith('child up'))?.split(' ')[2]);
    assert.ok(childPid > 0, 'the holder\'s command is running');
    child.kill('SIGTERM');
    const code = await new Promise((done) => child.once('close', (status, signal) => done(status ?? signal)));
    const written = readFileSync(writes, 'utf8').length;
    await sleep(250);
    const lines = read();
    assert.equal(code, 143, `the driver exits 128 + SIGTERM once (${lines.join(', ')})`);
    const at = (line) => lines.indexOf(line);
    assert.ok(at('child exit') >= 0 && at('child exit') < at('A release') && at('A release') < at('driver exit 143'),
      `the holder's command stops, then its lock goes, then the process exits (${lines.join(', ')})`);
    assert.ok(!lines.includes('A returned') && !lines.includes('B returned'), 'no caller sees its step end during the stop');
    assert.equal(readFileSync(writes, 'utf8').length, written, 'nothing writes after the driver is gone');
    assert.throws(() => process.kill(childPid, 0), /ESRCH/, 'the command is gone');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
assert.deepEqual(['SIGTERM', 'SIGINT', 'SIGHUP'].map((signal) => process.listenerCount(signal)), [0, 0, 0], 'every hold removed its signal handlers');
console.log('capture-hold-phases.selftest: one owner of the cap, the budget, the grace and the yield (no yield after a stop, no freeze or thaw of closed pages, a cooperative shoot yields at the cap, a non-cooperative one is stopped while anyone waits), withCaptureHold tears down before it releases, a signal included');
