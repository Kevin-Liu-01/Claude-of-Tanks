// The capture lock's acquire as one owner of its hold (2026-11-02 audit S4). An instance holds at most one hold and runs
// at most one acquire: a second acquire on an instance that holds (or is still queued) is refused at once, by name. On
// the base a second acquire overwrote `hold`: on a render slot the first slot leaked until the process exited (the group
// directory outlived every release), and on an exclusive hold it waited on its own live pid until its timeout.
// Nested holds (COT_SHOTS_HELD): a parent that holds the lock hands its children a token (nestedEnv()); a child's acquire
// that finds the token naming the live owner record at its lock directory nests inside the parent's hold at once (no
// ticket, no claim; refresh, release and checkpoint leave the parent's hold alone). A stale or foreign token queues as
// usual. On the base a child of a holder queued behind its own parent's live pid until its timeout (45 min to 3 h).
// Every hold is private (a temporary lock and queue directory); no machine lock is touched.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCapturedCommand } from './capture-command.mjs';
import { createCaptureLock } from './capture-lock.mjs';

// the lock reads these by name; this receipt pins its own semantics, so it owns all of them (as capture-lock.selftest)
const LOCK_ENV = [...new Set([...readFileSync(fileURLToPath(new URL('./capture-lock.mjs', import.meta.url)), 'utf8')
  .matchAll(/process\.env\.([A-Z0-9_]+)/g)].map((match) => match[1]))].sort();
for (const name of LOCK_ENV) delete process.env[name];

const root = mkdtempSync(join(tmpdir(), 'cot-capture-reentry-'));
const quiet = () => {};
const rig = (name, extra = {}) => ({ lockDir: join(root, `${name}.lock`), queueDir: join(root, `${name}.queue`), log: quiet, ...extra });

try {
  // ---- an exclusive hold: a second acquire is refused at once, and the hold is unchanged ------------------------------
  {
    const dirs = rig('exclusive');
    const lock = createCaptureLock(dirs);
    await lock.acquire(2_000);
    const held = lock.heldTicket;
    const started = Date.now();
    await assert.rejects(lock.acquire(600), /already holds/, 'a second acquire on a holding instance is refused, not queued behind its own pid');
    assert.ok(Date.now() - started < 450, `refused at once (${Date.now() - started} ms), not after its timeout`);
    assert.equal(lock.heldTicket, held, 'the refused acquire leaves the hold as it was');
    assert.equal(lock.refresh(), true, 'the hold still refreshes');
    assert.equal(lock.release(), true);
    assert.equal(existsSync(dirs.lockDir), false, 'and releases');
    await lock.acquire(2_000);
    assert.equal(lock.release(), true, 'a released instance acquires again');
  }

  // ---- a render slot: a second acquire is refused, so no slot leaks past the release ----------------------------------
  {
    const dirs = rig('render');
    const lock = createCaptureLock(dirs);
    await lock.acquire(2_000, { lockClass: 'render' });
    await assert.rejects(lock.acquire(600, { lockClass: 'render' }), /already holds/, 'a second render acquire is refused');
    assert.deepEqual(readdirSync(dirs.lockDir).filter((name) => name.endsWith('.holder')), ['slot-0.holder'], 'one slot, its own');
    assert.equal(lock.release(), true);
    assert.equal(existsSync(dirs.lockDir), false, 'the group leaves with its one member: no slot outlives the release');
  }

  // ---- an instance still queued: a second acquire is refused; the first goes on and holds ----------------------------
  {
    const dirs = rig('queued');
    const owner = createCaptureLock(dirs), waiter = createCaptureLock(dirs);
    await owner.acquire(2_000);
    const first = waiter.acquire(5_000);
    await new Promise((done) => setTimeout(done, 100));
    await assert.rejects(waiter.acquire(600), /already queued/, 'a second acquire while the first waits is refused');
    owner.release();
    await first;
    assert.ok(waiter.heldTicket, 'the first acquire holds once the owner leaves');
    assert.equal(waiter.release(), true);
  }

  // ---- checkpoint's own release-and-requeue is not a re-entry ---------------------------------------------------------
  {
    const dirs = rig('checkpoint', { holdCapMs: 50 });
    const lock = createCaptureLock(dirs), other = createCaptureLock(dirs);
    await lock.acquire(2_000);
    await new Promise((done) => setTimeout(done, 80));
    const waiting = other.acquire(5_000).then(() => { other.release(); });
    await new Promise((done) => setTimeout(done, 300)); // the other ticket is in the queue
    const result = await lock.checkpoint({ timeoutMs: 5_000 });
    assert.equal(result.yielded, true, 'past the cap with a waiter, the checkpoint yields and holds again');
    await waiting;
    assert.ok(lock.heldTicket, 'holding again after the yield');
    assert.equal(lock.release(), true);
  }

  // ---- nested holds: a child under its parent's token nests at once; a foreign or stale token queues ------------------
  {
    const dirs = rig('nested');
    const parent = createCaptureLock(dirs);
    assert.deepEqual(parent.nestedEnv(), {}, 'no hold: no token to hand down');
    await parent.acquire(2_000);
    const env = parent.nestedEnv();
    assert.match(env.COT_SHOTS_HELD ?? '', new RegExp(`^${process.pid}:[0-9a-f]{24}$`), 'the token names the holder and its hold');
    // a child process acquires the same lock directory under the token: it holds at once and leaves the parent's hold
    const child = (extraEnv, timeoutMs) => new Promise((done) => {
      const script = `import { createCaptureLock } from ${JSON.stringify(new URL('./capture-lock.mjs', import.meta.url).href)};
        const lock = createCaptureLock({ lockDir: ${JSON.stringify(dirs.lockDir)}, queueDir: ${JSON.stringify(dirs.queueDir)}, log: () => {} });
        const t0 = Date.now();
        try {
          const prepared = await lock.acquire(${timeoutMs}, { prepare: async () => 'warm' });
          const ms = Date.now() - t0, nested = lock.nested, env = lock.nestedEnv().COT_SHOTS_HELD ?? null;
          const refreshed = lock.refresh(), cp = await lock.checkpoint(), released = lock.release();
          console.log(JSON.stringify({ ok: true, ms, nested, prepared, refreshed, cp, released, env }));
        } catch (error) { console.log(JSON.stringify({ ok: false, ms: Date.now() - t0, error: error.message })); }`;
      const proc = spawn(process.execPath, ['--input-type=module', '-e', script], {
        env: { ...process.env, ...extraEnv }, stdio: ['ignore', 'pipe', 'inherit'] });
      let out = '';
      proc.stdout.setEncoding('utf8').on('data', (chunk) => { out += chunk; });
      proc.once('close', () => done(JSON.parse(out.trim().split('\n').at(-1))));
    });
    const nested = await child(env, 2_000);
    assert.equal(nested.ok, true, `the child holds under its parent's token: ${JSON.stringify(nested)}`);
    assert.ok(nested.ms < 1_500, `at once (${nested.ms} ms), not behind its parent's live pid`);
    assert.equal(nested.nested, true);
    assert.equal(nested.prepared, 'warm', 'its prepare still runs and its result comes back');
    assert.deepEqual([nested.refreshed, nested.cp.yielded, nested.released], [true, false, false],
      'refresh reports the parent hold standing; checkpoint never yields the parent\'s hold; release leaves it');
    assert.equal(nested.env, env.COT_SHOTS_HELD, 'a nested child hands the same token on to its own children');
    assert.ok(existsSync(dirs.lockDir) && parent.refresh(), 'the parent still holds after the nested child released');
    // a stale token (no such hold: another nonce) or a foreign directory's token queues as usual: here it times out
    const stale = await child({ COT_SHOTS_HELD: `${process.pid}:${'0'.repeat(24)}` }, 700);
    assert.deepEqual([stale.ok, stale.error], [false, 'cot-shots lock timeout'], 'a token naming no live hold here waits in the queue');
    const other = createCaptureLock(rig('nested-other'));
    await other.acquire(2_000);
    const foreign = await child(other.nestedEnv(), 700);
    assert.deepEqual([foreign.ok, foreign.error], [false, 'cot-shots lock timeout'], 'another lock directory\'s token does not open this one');
    other.release();
    // a dead parent's token: the hold is gone once the parent releases, so the child queues and takes the free lock
    parent.release();
    const after = await child(env, 2_000);
    assert.deepEqual([after.ok, after.nested], [true, false], 'after the parent released, the token is stale: the child holds on its own');
  }
  // ---- the wrapper hands the token down: a tool under runCapturedCommand that takes the lock itself nests ------------
  {
    const dirs = rig('wrapped');
    const result = join(root, 'wrapped.json');
    const script = `import { writeFileSync } from 'node:fs';
      import { createCaptureLock } from ${JSON.stringify(new URL('./capture-lock.mjs', import.meta.url).href)};
      const lock = createCaptureLock({ lockDir: ${JSON.stringify(dirs.lockDir)}, queueDir: ${JSON.stringify(dirs.queueDir)}, log: () => {} });
      const t0 = Date.now();
      try { await lock.acquire(1500); writeFileSync(${JSON.stringify(result)}, JSON.stringify({ ok: true, nested: lock.nested, ms: Date.now() - t0 })); lock.release(); }
      catch (error) { writeFileSync(${JSON.stringify(result)}, JSON.stringify({ ok: false, error: error.message })); }`;
    const lock = createCaptureLock(dirs);
    await runCapturedCommand(process.execPath, ['--input-type=module', '-e', script], { stdio: 'ignore' }, { lock, timeoutMs: 2_000 });
    const seen = JSON.parse(readFileSync(result, 'utf8'));
    assert.deepEqual([seen.ok, seen.nested], [true, true], `the wrapped tool nests in the wrapper's hold: ${JSON.stringify(seen)}`);
    assert.equal(existsSync(dirs.lockDir), false, 'and the wrapper releases its own hold after');
  }
  assert.deepEqual(LOCK_ENV.filter((name) => process.env[name] !== undefined), [], 'no lock variable is set at the end');
  console.log('capture-lock-reentry.selftest: a holding or queued instance refuses a second acquire (no leaked render slot, no wait on its own pid), checkpoint re-queues, and a child nests in its parent\'s hold through the token (runCapturedCommand hands it down)');
} finally {
  rmSync(root, { recursive: true, force: true });
}
