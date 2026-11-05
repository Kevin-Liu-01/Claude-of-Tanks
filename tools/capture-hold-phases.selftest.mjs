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
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as captureHold from './capture-hold.mjs';
import { runWarmHold, withCaptureHold } from './capture-hold.mjs';

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

function fakeLock({ capMs = null, waiters = 1, yieldWaitMs = 40, nested = false, events }) {
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
      const hold = await openCaptureHold({ lock, label: 'open-probe', timeoutMs: 5000, teardown: async () => writeFileSync(${JSON.stringify(marker)}, 'torn') });
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
  } finally {
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
    const command = `const { appendFileSync } = require('node:fs');
      appendFileSync(${JSON.stringify(events)}, 'child up ' + process.pid + '\\n');
      setInterval(() => appendFileSync(${JSON.stringify(writes)}, 'x'), 50);
      process.on('SIGTERM', () => { appendFileSync(${JSON.stringify(events)}, 'child TERM\\n');
        setTimeout(() => { appendFileSync(${JSON.stringify(events)}, 'child exit\\n'); process.exit(0); }, 800); });`;
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
