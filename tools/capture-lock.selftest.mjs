import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  unlinkSync,
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 2026-10-02: waiters never refreshed their tickets, so the queue's stale-ticket reaping deleted an honest waiter's
// ticket after the stale window and it could never reach the head again. A waiter now heartbeats its ticket while it
// polls and restores it under its original name if another process reaped it anyway, keeping its place in line.
async function checkLongWaitKeepsItsPlace() {
  const longLockDir = join(root, 'long-wait.lock');
  const longQueueDir = join(root, 'long-wait.queue');
  mkdirSync(longLockDir); // A foreign holder outlasts several stale windows.
  const staleMs = 600;
  const first = createCaptureLock({ lockDir: longLockDir, queueDir: longQueueDir, lockStaleMs: 60_000, ticketStaleMs: staleMs });
  const second = createCaptureLock({ lockDir: longLockDir, queueDir: longQueueDir, lockStaleMs: 60_000, ticketStaleMs: staleMs });
  const order = [];
  const pending = [];
  try {
    pending.push(first.acquire(15_000).then(() => { order.push('first'); first.release(); }));
    await sleep(40);
    pending.push(second.acquire(15_000).then(() => { order.push('second'); second.release(); }));
    await sleep(staleMs * 4);
    assert.equal(readdirSync(longQueueDir).length, 2, 'both waiters still hold tickets after four stale windows');
    rmSync(longLockDir, { recursive: true });
    const settled = await Promise.allSettled(pending);
    assert.ok(settled.every(result => result.status === 'fulfilled'), 'both long waiters acquire');
    assert.deepEqual(order, ['first', 'second'], 'the longest waiter keeps its place');
    assert.deepEqual(readdirSync(longQueueDir), [], 'long waiters remove their tickets');
  } finally {
    rmSync(longLockDir, { recursive: true, force: true });
    await Promise.allSettled(pending);
    first.release(); second.release();
  }
}

async function checkReapedTicketIsRestored() {
  const reapLockDir = join(root, 'reaped.lock');
  const reapQueueDir = join(root, 'reaped.queue');
  mkdirSync(reapLockDir);
  const first = createCaptureLock({ lockDir: reapLockDir, queueDir: reapQueueDir, lockStaleMs: 60_000 });
  const second = createCaptureLock({ lockDir: reapLockDir, queueDir: reapQueueDir, lockStaleMs: 60_000 });
  const order = [];
  const pending = [];
  try {
    pending.push(first.acquire(15_000).then(() => { order.push('first'); first.release(); }));
    await sleep(40);
    pending.push(second.acquire(15_000).then(() => { order.push('second'); second.release(); }));
    await sleep(40);
    const [firstTicket] = readdirSync(reapQueueDir).sort();
    unlinkSync(join(reapQueueDir, firstTicket)); // Another process reaped it while its owner was still waiting.
    await sleep(1_200);
    assert.ok(readdirSync(reapQueueDir).includes(firstTicket), 'a reaped ticket is restored under its original name');
    rmSync(reapLockDir, { recursive: true });
    const settled = await Promise.allSettled(pending);
    assert.ok(settled.every(result => result.status === 'fulfilled'), 'both waiters acquire after a reap');
    assert.deepEqual(order, ['first', 'second'], 'the restored waiter keeps its FIFO place');
    assert.deepEqual(readdirSync(reapQueueDir), [], 'restored tickets are removed on acquisition');
  } finally {
    rmSync(reapLockDir, { recursive: true, force: true });
    await Promise.allSettled(pending);
    first.release(); second.release();
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
  await checkLongWaitKeepsItsPlace();
  await checkReapedTicketIsRestored();
  console.log('capture-lock.selftest: acquire, refresh, release, recovery, timeout, same-millisecond FIFO, long-wait heartbeat and reaped-ticket restore passed');
} finally {
  rmSync(root, { recursive: true, force: true });
}
