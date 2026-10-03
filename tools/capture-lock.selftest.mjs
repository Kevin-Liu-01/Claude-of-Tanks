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

// 2026-10-02: a live waiter keeps its place past the reaping age. It renews its ticket, and when another process
// reaps it anyway it restores the same name; only a dead or silent ticket goes stale.
async function checkLongWaiterKeepsPlace() {
  const heldDir = join(root, 'long.lock');
  const longQueue = join(root, 'long.queue');
  mkdirSync(heldDir); // another owner holds the lock
  const options = { lockDir: heldDir, queueDir: longQueue, lockStaleMs: 60_000, ticketStaleMs: 200, ticketRefreshMs: 40 };
  const first = createCaptureLock(options);
  const second = createCaptureLock(options);
  const order = [];
  const pending = [first.acquire(5_000).then(() => { order.push('first'); first.release(); })];
  const firstTicket = readdirSync(longQueue)[0];
  await new Promise((resolve) => setTimeout(resolve, 20));
  pending.push(second.acquire(5_000).then(() => { order.push('second'); second.release(); }));
  try {
    await new Promise((resolve) => setTimeout(resolve, 700)); // three reaping ages pass while both wait
    assert.ok(readdirSync(longQueue).includes(firstTicket), 'a live waiter past the reaping age keeps its ticket');
    rmSync(join(longQueue, firstTicket)); // a waiter on an older copy of the module reaps it anyway
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.ok(readdirSync(longQueue).includes(firstTicket), 'the reaped live waiter restores the same ticket, so its place');
  } finally {
    rmSync(heldDir, { recursive: true, force: true });
    await Promise.allSettled(pending);
  }
  assert.deepEqual(order, ['first', 'second'], 'the long waiter is served first');
  assert.deepEqual(readdirSync(longQueue), [], 'both acquisitions remove their tickets');
}

// 2026-10-02: a waiter that gave its turn back (a lock of its own was held by someone queued behind it) re-enters under
// its original ticket once that holder is done, ahead of everyone who queued after it.
async function checkRestoredTicket() {
  const heldDir = join(root, 'restore.lock');
  const restoreQueue = join(root, 'restore.queue');
  const options = { lockDir: heldDir, queueDir: restoreQueue, lockStaleMs: 60_000 };
  const yielding = createCaptureLock(options);
  await yielding.acquire(1_000);
  const original = yielding.lastTicket;
  assert.match(original, new RegExp(`-${process.pid}\\.t$`));
  yielding.release(); // gives its turn back
  mkdirSync(heldDir); // the holder it yielded to runs
  const later = createCaptureLock(options);
  const order = [];
  const pending = [later.acquire(5_000).then(() => { order.push('later'); later.release(); })];
  await new Promise((resolve) => setTimeout(resolve, 30));
  pending.push(yielding.acquire(5_000, { ticket: original }).then(() => { order.push('restored'); yielding.release(); }));
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(readdirSync(restoreQueue).sort()[0], original, 'the restored ticket sorts at its original place');
  rmSync(heldDir, { recursive: true });
  await Promise.allSettled(pending);
  assert.deepEqual(order, ['restored', 'later'], 'it is served before the waiter that queued after it');
  assert.deepEqual(readdirSync(restoreQueue), [], 'the restored ticket is removed like any other');
  await assert.rejects(yielding.acquire(100, { ticket: '000000000000001-000000000000-1.t' }), /not this process/);
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
  await checkLongWaiterKeepsPlace();
  await checkLongWaitFifo();
  await checkRestoredTicket();

  // Gate P5 (2026-10-01): waiting() is a read-only count of live queued acquisitions.
  const probeQueue = join(root, 'probe.queue');
  const probe = createCaptureLock({ lockDir: join(root, 'probe.lock'), queueDir: probeQueue });
  assert.equal(probe.waiting(), 0, 'no queue directory: nobody waits');
  mkdirSync(probeQueue);
  assert.equal(probe.waiting(), 0, 'an empty queue: nobody waits');
  writeFileSync(join(probeQueue, `000000000000001-000000000000-${process.pid}.t`), String(process.pid));
  const longWaiter = `000000000000002-000000000001-${process.pid}.t`;
  writeFileSync(join(probeQueue, longWaiter), String(process.pid));
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
  utimesSync(join(probeQueue, longWaiter), twoHoursAgo, twoHoursAgo);
  writeFileSync(join(probeQueue, '000000000000003-99999999.t'), '99999999');
  writeFileSync(join(probeQueue, 'notes.txt'), 'not a ticket');
  assert.equal(probe.waiting(), 2, 'live tickets count, a long waiter included; dead tickets and other files do not');
  assert.equal(readdirSync(probeQueue).length, 4, 'waiting() reaps nothing');
  writeFileSync(join(root, 'queue-file'), 'not a directory');
  assert.equal(createCaptureLock({ lockDir: join(root, 'other.lock'), queueDir: join(root, 'queue-file') }).waiting(), 1,
    'an unreadable queue reports a waiter, so callers keep draining');
  console.log('capture-lock.selftest: acquire, refresh, release, recovery, timeout, same-millisecond FIFO, long-wait FIFO, long-waiter place, restored ticket and waiting() passed');
} finally {
  rmSync(root, { recursive: true, force: true });
}
