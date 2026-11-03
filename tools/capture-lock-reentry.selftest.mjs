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

  assert.deepEqual(LOCK_ENV.filter((name) => process.env[name] !== undefined), [], 'no lock variable is set at the end');
  console.log('capture-lock-reentry.selftest: a holding or queued instance refuses a second acquire (no leaked render slot, no wait on its own pid), and checkpoint re-queues');
} finally {
  rmSync(root, { recursive: true, force: true });
}
