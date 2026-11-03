// The hold's phases (2026-11-02 audit S4, tools/capture-hold.mjs createHoldPhases, withCaptureHold, runWarmHold). The
// hold limit and the lock's cap were two timers that disagreed: the limit (18 min by default) came before the cap (20), so
// a checkpoint never yielded before the abort; a checkpoint after the abort and its grace froze closed pages and threw;
// a yield after an abort left the grace running, which closed the browser during the re-queue wait (the thaw then hit
// closed pages); and a shoot that never called checkpoint() kept its hold past the cap however many waited. Driven with a
// fake lock (a cap of tens of milliseconds, a waiter count, a checkpoint that yields as the real one does) and fake pages
// that refuse a freeze or a thaw once their browser is closed. The last case runs withCaptureHold on a real private lock
// in a child process and stops it with SIGTERM.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
  const { events, options } = rig({ capMs: 300, waiters: 1 });
  await runWarmHold({ ...options, holdMinutes: 0.004, graceSeconds: 0.05, shoot: async ({ signal, checkpoint }) => {
    watchAbort(signal, events);
    const until = Date.now() + 600;
    while (Date.now() < until) { await sleep(30); await checkpoint(); } // a shoot that keeps checkpointing past its stop
  } });
  assert.ok(events.includes('abort') && events.includes('close'), `the budget stopped the shoot and the grace closed it (${events.join(' ')})`);
  assert.ok(!events.includes('yield'), 'no checkpoint yields after the stop');
  assert.ok(events.indexOf('close') < events.lastIndexOf('release'), 'closed before the release');
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
assert.deepEqual(['SIGTERM', 'SIGINT', 'SIGHUP'].map((signal) => process.listenerCount(signal)), [0, 0, 0], 'every hold removed its signal handlers');
console.log('capture-hold-phases.selftest: one owner of the cap, the budget, the grace and the yield (no yield after a stop, no freeze or thaw of closed pages, a cooperative shoot yields at the cap, a non-cooperative one is stopped while anyone waits), withCaptureHold tears down before it releases, a signal included');
