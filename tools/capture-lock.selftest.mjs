import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCaptureLock } from './capture-lock.mjs';
// acquire() lengthens its wait to COT_SHOTS_LOCK_TIMEOUT_MS inside a landing chain; this receipt pins the lock's own semantics.
process.env.COT_SHOTS_LOCK_TIMEOUT_MS = '';

const root = mkdtempSync(join(tmpdir(), 'cot-capture-lock-'));
const lockDir = join(root, 'capture.lock');
const queueDir = join(root, 'capture.queue');

async function checkSameMillisecondFifo() {
  const fifoLockDir = join(root, 'same-ms.lock');
  const fifoQueueDir = join(root, 'same-ms.queue');
  mkdirSync(fifoLockDir); // Block enrollment so every waiter must retain a ticket.
  const now = Date.now;
  const stamp = now();
  const locks = [];
  const pending = [];
  const acquired = [];
  let enrolled = [];
  try {
    for (let index = 0; index < 5; index++) {
      const waiter = createCaptureLock({
        lockDir: fifoLockDir, queueDir: fifoQueueDir, lockStaleMs: 60_000,
      });
      locks.push(waiter);
      // Match four concurrent release workers, followed by a later acquisition.
      // Restore the real clock before timers execute; polling/stale logic is real.
      Date.now = () => index < 4 ? stamp : stamp + 1;
      try {
        pending.push(waiter.acquire(10_000).then(() => {
          acquired.push(index);
          waiter.release();
        }));
      } finally {
        Date.now = now;
      }
    }
    enrolled = readdirSync(fifoQueueDir).sort();
    rmSync(fifoLockDir, { recursive: true });
    const settled = await Promise.allSettled(pending);
    assert.ok(settled.every(result => result.status === 'fulfilled'), 'all private waiters finish');
    assert.equal(enrolled.length, 5, 'same-millisecond acquisitions retain distinct queue tickets');
    assert.ok(enrolled.every(name => name.endsWith(`-${process.pid}.t`)), 'PID remains the trailing liveness field');
    assert.deepEqual(acquired, [0, 1, 2, 3, 4], 'a later waiter cannot overtake same-millisecond acquisitions');
    assert.deepEqual(readdirSync(fifoQueueDir), [], 'every acquisition removes only its own ticket');
    assert.equal(existsSync(fifoLockDir), false, 'completed FIFO test releases its private lock');
  } finally {
    Date.now = now;
    rmSync(fifoLockDir, { recursive: true, force: true });
    await Promise.allSettled(pending);
    for (const waiter of locks) waiter.release();
  }
}

async function checkLongWaitFifo() {
  const waitingLockDir = join(root, 'long-wait.lock');
  const waitingQueueDir = join(root, 'long-wait.queue');
  mkdirSync(waitingLockDir);
  const options = { lockDir: waitingLockDir, queueDir: waitingQueueDir,
    lockStaleMs: 60_000, ticketStaleMs: 2_000 };
  const first = createCaptureLock(options), later = createCaptureLock(options);
  const acquired = [], pending = [];
  try {
    pending.push(first.acquire(10_000).then(() => { acquired.push('first'); first.release(); }));
    const [ticket] = readdirSync(waitingQueueDir);
    const initialMtime = statSync(join(waitingQueueDir, ticket)).mtimeMs;
    // Keep a real waiter blocked beyond the ticket's stale period, then
    // introduce a later job. Live waiting must not be mistaken for abandonment.
    await new Promise(resolve => setTimeout(resolve, 3_100));
    const waitingMtime = statSync(join(waitingQueueDir, ticket)).mtimeMs;
    pending.push(later.acquire(10_000).then(() => { acquired.push('later'); later.release(); }));
    rmSync(waitingLockDir, { recursive: true });
    const settled = await Promise.allSettled(pending);
    assert.ok(settled.every(result => result.status === 'fulfilled'), 'both long-wait jobs finish');
    assert.ok(waitingMtime > initialMtime, 'waiting ticket has a liveness heartbeat');
    assert.deepEqual(acquired, ['first', 'later'], 'a long wait retains its FIFO position');
    assert.deepEqual(readdirSync(waitingQueueDir), [], 'long-wait tickets are cleaned up');
  } finally {
    rmSync(waitingLockDir, { recursive: true, force: true });
    await Promise.allSettled(pending);
    first.release(); later.release();
  }
}

try {
  const lock = createCaptureLock({ lockDir, queueDir });
  await lock.acquire(100);
  assert.equal(existsSync(lockDir), true, 'acquire owns the atomic lock directory');
  assert.deepEqual(readdirSync(queueDir), [], 'acquire removes its queue ticket');

  const oldTime = new Date(Date.now() - 5_000);
  utimesSync(lockDir, oldTime, oldTime);
  const beforeRefresh = statSync(lockDir).mtimeMs;
  lock.refresh();
  assert.ok(statSync(lockDir).mtimeMs > beforeRefresh, 'refresh renews the held lock');

  lock.release();
  assert.equal(existsSync(lockDir), false, 'release removes the held lock');
  lock.release();

  mkdirSync(lockDir);
  utimesSync(lockDir, oldTime, oldTime);
  mkdirSync(queueDir, { recursive: true });
  const abandonedTicket = '000000000000000-99999999.t';
  writeFileSync(join(queueDir, abandonedTicket), '99999999');
  utimesSync(join(queueDir, abandonedTicket), oldTime, oldTime);
  const recoveryLock = createCaptureLock({
    lockDir,
    queueDir,
    lockStaleMs: 1,
    ticketStaleMs: 1,
  });
  await recoveryLock.acquire(1_000);
  assert.equal(existsSync(join(queueDir, abandonedTicket)), false, 'dead tickets are reaped');
  recoveryLock.release();

  mkdirSync(lockDir);
  const blockedLock = createCaptureLock({ lockDir, queueDir, lockStaleMs: 10_000 });
  await assert.rejects(blockedLock.acquire(10), /cot-shots lock timeout/);
  assert.deepEqual(readdirSync(queueDir), [], 'timed-out waits remove their queue ticket');

  await checkSameMillisecondFifo();
  await checkLongWaitFifo();
  console.log('capture-lock.selftest: acquire, refresh, release, recovery, timeout, same-millisecond and long-wait FIFO passed');
} finally {
  rmSync(root, { recursive: true, force: true });
}
