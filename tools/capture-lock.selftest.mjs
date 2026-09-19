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
  console.log('capture-lock.selftest: acquire, refresh, release, recovery, timeout, and same-millisecond FIFO passed');
} finally {
  rmSync(root, { recursive: true, force: true });
}
