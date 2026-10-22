import assert from 'node:assert/strict';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  rmdirSync,
  statSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCaptureLock, stampBehindWaiting, ticketAt } from './capture-lock.mjs';
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

// 2026-10-07: a run split over processes (one per lease) rejoins at its first ticket's stamp: a new process's ticketAt
// sorts at that place, ahead of a waiter that queued after the stamp, while a lane holds the GPU between the leases.
async function checkTicketAt() {
  const heldDir = join(root, 'stamp.lock');
  const stampQueue = join(root, 'stamp.queue');
  const options = { lockDir: heldDir, queueDir: stampQueue, lockStaleMs: 60_000 };
  const stamp = Date.now() - 1_000;
  mkdirSync(heldDir);
  const later = createCaptureLock(options);
  const rejoining = createCaptureLock(options);
  const order = [];
  const pending = [later.acquire(5_000).then(() => { order.push('later'); later.release(); })];
  await new Promise((resolve) => setTimeout(resolve, 30));
  const ticket = ticketAt(stamp);
  assert.equal(ticket, `${String(stamp).padStart(15, '0')}-000000000000-${process.pid}.t`);
  pending.push(rejoining.acquire(5_000, { ticket }).then(() => { order.push('rejoined'); rejoining.release(); }));
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(readdirSync(stampQueue).sort()[0], ticket, "the stamped ticket sorts at the run's first place");
  rmSync(heldDir, { recursive: true });
  await Promise.allSettled(pending);
  assert.deepEqual(order, ['rejoined', 'later'], 'the rejoining run is served before the waiter that queued after its stamp');
  assert.deepEqual(readdirSync(stampQueue), [], 'the stamped ticket is removed like any other');
  for (const bad of [0, -1, 1.5, 1e15, Number.NaN]) assert.throws(() => ticketAt(bad), /not a ticket stamp/);
}

// ---- owned locks (2026-10-21, item 233) ----------------------------------------------------------------------------
// No node:child_process here: capture lane 2 runs this receipt under its loader, which refuses it for an unpinned import.
const OWNER = 'owner.json';
const twoHoursAgo = () => new Date(Date.now() - 2 * 60 * 60 * 1000);
const dirId = (dir) => { const st = lstatSync(dir, { bigint: true }); return `${st.dev}:${st.ino}`; };
const readToken = (dir) => JSON.parse(readFileSync(join(dir, OWNER), 'utf8'));
/** A hand-written owner token for the directory `dir` (a holder this process is not). */
function plantOwner(dir, fields) {
  mkdirSync(dir);
  writeFileSync(join(dir, OWNER), JSON.stringify({ format: 'cot-capture-lock-owner/1', id: dirId(dir), ticket: null,
    startedAt: new Date().toISOString(), procStart: null, ...fields }));
}
function deadPid() {
  for (let pid = 99_999; pid > 50_000; pid--) {
    try { process.kill(pid, 0); } catch (error) { if (error.code === 'ESRCH') return pid; }
  }
  throw new Error('no unused pid to stand for a dead owner');
}
async function until(what, ready, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (!ready()) {
    if (Date.now() > deadline) throw new Error(`capture-lock.selftest: ${what} never happened within ${timeoutMs} ms`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
const leftovers = (prefix) => readdirSync(root).filter((name) => name.startsWith(`${prefix}.`) && !name.endsWith('.queue'));

// The 2026-10-21 cascade (ui-type-230): A held; its directory was removed under it; B took the free path; A failed and
// released, which removed B's directory; C took the lock while B ran. Now A's refresh and release refuse B's lock, B
// keeps it, and C waits however late B's refresh is, because B lives.
async function checkOwnershipCascade() {
  const dir = join(root, 'cascade.lock');
  const logs = [];
  const options = { lockDir: dir, queueDir: join(root, 'cascade.queue'), lockStaleMs: 1, orphanStaleMs: 1, log: (m) => logs.push(m) };
  const a = createCaptureLock(options), b = createCaptureLock(options), c = createCaptureLock(options);
  await a.acquire(1_000);
  const tokenA = readToken(dir);
  assert.equal(tokenA.pid, process.pid, 'the token names the owner pid');
  assert.match(tokenA.nonce, /^[0-9a-f]{24}$/, 'and a random nonce');
  assert.equal(tokenA.id, dirId(dir), 'and the directory it created (dev:inode)');
  assert.equal(tokenA.ticket, a.lastTicket, 'and the ticket it was served at');
  assert.equal(tokenA.stamp, Number(a.lastTicket.slice(0, 15)), "and that ticket's stamp");
  assert.ok(Date.parse(tokenA.startedAt) > 0, 'and when the hold began');
  assert.ok(!/\.holder$/.test(OWNER), 'the token is never read as a lane-1 timing block');
  assert.throws(() => rmdirSync(dir), /ENOTEMPTY/, "an older copy's rmdir release or stale reap cannot remove an owned lock");
  rmSync(dir, { recursive: true }); // removed under A from outside (an older copy's stale recovery, or rm -rf)
  await b.acquire(1_000);
  const tokenB = readToken(dir);
  assert.notEqual(tokenB.nonce, tokenA.nonce, 'B holds its own token');
  assert.equal(a.refresh(), false, "A's refresh refuses B's lock");
  assert.equal(a.release(), false, "A's release refuses B's lock");
  assert.equal(readToken(dir).nonce, tokenB.nonce, 'B still holds after A released');
  assert.ok(logs.some((m) => /refresh refused/.test(m)) && logs.some((m) => /release refused .*held by pid \d+, ticket/.test(m)),
    'both refusals are logged, naming the lock\'s owner');
  const late = twoHoursAgo();
  utimesSync(dir, late, late); // B's refresh is two hours late; its pid lives
  await assert.rejects(c.acquire(700), /cot-shots lock timeout/, 'C cannot acquire while B lives');
  assert.equal(readToken(dir).nonce, tokenB.nonce, 'stale recovery leaves a live holder in place');
  assert.ok(logs.some((m) => /held by live pid .*never reaped/.test(m)), 'the waiting head says why it waits');
  assert.equal(b.refresh(), true, "B's refresh renews its own lock");
  assert.ok(Date.now() - statSync(dir).mtimeMs < 60_000, 'its mtime is fresh again');
  assert.equal(b.release(), true, 'B releases its own lock');
  assert.equal(existsSync(dir), false, 'and the path is free');
  assert.equal(b.release(), false, 'a second release does nothing');
  assert.equal(b.refresh(), false, 'nor does a refresh after the release');
  assert.deepEqual(leftovers('cascade.lock'), [], 'no released directory or reaper mutex is left behind');
}

// Stale recovery with a live pid: a lock two hours without a refresh whose owner (another process: pid 1, which this
// user cannot signal) lives is never reaped, however small the waiter's stale ages.
async function checkLiveOwnerKept() {
  const dir = join(root, 'live.lock');
  plantOwner(dir, { pid: 1, nonce: 'live-owner' });
  const late = twoHoursAgo();
  utimesSync(dir, late, late);
  const waiter = createCaptureLock({ lockDir: dir, queueDir: join(root, 'live.queue'), lockStaleMs: 1, orphanStaleMs: 1, log: () => {} });
  await assert.rejects(waiter.acquire(500), /cot-shots lock timeout/, 'a live owner keeps its stale-looking lock');
  assert.equal(readToken(dir).nonce, 'live-owner', 'its directory and token are untouched');
  assert.equal(waiter.release(), false, 'a waiter that never held releases nothing');
  assert.equal(readToken(dir).nonce, 'live-owner');
  rmSync(dir, { recursive: true });
}

// Stale recovery of the dead: a dead owner's lock goes at once (a fresh mtime does not keep it), with the *.holder file
// it left; a pid reused by another process is a dead owner once the lock is stale; a holder file naming a live pid keeps
// a dead owner's lock.
async function checkDeadOwnerReaped() {
  const dead = deadPid();
  const dir = join(root, 'dead.lock');
  plantOwner(dir, { pid: dead, nonce: 'dead-owner', ticket: `001791397983200-000000000000-${dead}.t` });
  writeFileSync(join(dir, 'perf-block1.holder'), `perf-block1 pid ${dead} perf lane ${new Date().toISOString()}\n`);
  const logs = [];
  const waiter = createCaptureLock({ lockDir: dir, queueDir: join(root, 'dead.queue'), log: (m) => logs.push(m) });
  await waiter.acquire(2_000);
  assert.equal(readToken(dir).pid, process.pid, "the dead owner's lock was reaped and taken");
  assert.deepEqual(readdirSync(dir), [OWNER], "the dead block's holder file went with it");
  assert.ok(logs.some((m) => new RegExp(`reaped .*pid ${dead}.*is dead`).test(m)), 'the reaping is logged with the dead pid');
  assert.equal(waiter.release(), true);

  const reused = join(root, 'reused.lock');
  plantOwner(reused, { pid: process.pid, nonce: 'reused-pid', procStart: 'Thu Jan 1 00:00:00 1970' });
  const late = twoHoursAgo();
  utimesSync(reused, late, late);
  const reuseLogs = [];
  const second = createCaptureLock({ lockDir: reused, queueDir: join(root, 'reused.queue'), lockStaleMs: 60_000, log: (m) => reuseLogs.push(m) });
  await second.acquire(5_000);
  assert.notEqual(readToken(reused).nonce, 'reused-pid', 'a stale lock whose pid now names another process was reaped');
  assert.ok(reuseLogs.some((m) => /now names another process/.test(m)), 'the reused pid is logged');
  assert.equal(second.release(), true);

  const blocked = join(root, 'block.lock');
  plantOwner(blocked, { pid: dead, nonce: 'dead-with-live-block' });
  writeFileSync(join(blocked, 'fx-block.holder'), '1'); // a timing block of a live process (pid 1)
  const third = createCaptureLock({ lockDir: blocked, queueDir: join(root, 'block.queue'), log: () => {} });
  await assert.rejects(third.acquire(400), /cot-shots lock timeout/, 'a holder file of a live pid keeps the lock');
  assert.equal(readToken(blocked).nonce, 'dead-with-live-block');
  rmSync(blocked, { recursive: true });
  for (const prefix of ['dead.lock', 'reused.lock', 'block.lock']) assert.deepEqual(leftovers(prefix), [], `nothing of ${prefix} is left`);
}

// A dead owner's lock is cleared by a waiter behind the head too (the head may run an older copy of this module, which
// cannot remove an owned directory); the waiter still takes the lock only at the head.
async function checkReapBehindHead() {
  const dir = join(root, 'behind.lock');
  const queue = join(root, 'behind.queue');
  mkdirSync(queue);
  const head = `${String(Date.now() - 1_000).padStart(15, '0')}-000000000000-1.t`; // a live waiter ahead (pid 1)
  writeFileSync(join(queue, head), '1');
  plantOwner(dir, { pid: deadPid(), nonce: 'dead-ahead' });
  const waiter = createCaptureLock({ lockDir: dir, queueDir: queue, log: () => {} });
  let acquired = false;
  const pending = waiter.acquire(10_000).then(() => { acquired = true; });
  try {
    await until('the waiter behind the head reaping the dead lock', () => !existsSync(dir));
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(acquired, false, 'and it does not take the lock out of turn');
    assert.equal(existsSync(dir), false);
  } finally {
    unlinkSync(join(queue, head)); // the head's turn passes
    await pending;
  }
  assert.equal(acquired, true, 'it takes the lock once it is the head');
  assert.equal(waiter.release(), true);
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
  assert.equal(lock.refresh(), true, 'refresh reports its own hold');
  assert.ok(statSync(lockDir).mtimeMs > beforeRefresh, 'refresh renews the held lock');

  assert.equal(lock.release(), true, 'release reports its own hold');
  assert.equal(existsSync(lockDir), false, 'release removes the held lock');
  assert.equal(lock.release(), false, 'nothing is held after a release');

  mkdirSync(lockDir);
  utimesSync(lockDir, oldTime, oldTime);
  mkdirSync(queueDir, { recursive: true });
  const abandonedTicket = '000000000000000-99999999.t';
  writeFileSync(join(queueDir, abandonedTicket), '99999999');
  utimesSync(join(queueDir, abandonedTicket), oldTime, oldTime);
  const recoveryLogs = [];
  const recoveryLock = createCaptureLock({
    lockDir,
    queueDir,
    lockStaleMs: 1,
    ticketStaleMs: 1,
    log: (m) => recoveryLogs.push(m),
  });
  await recoveryLock.acquire(1_000);
  assert.equal(existsSync(join(queueDir, abandonedTicket)), false, 'dead tickets are reaped');
  assert.ok(recoveryLogs.some((m) => /reaped .*no owner token/.test(m)), 'an old tokenless lock past the orphan age is reaped');
  recoveryLock.release();

  mkdirSync(lockDir);
  const blockedLock = createCaptureLock({ lockDir, queueDir, lockStaleMs: 10_000 });
  await assert.rejects(blockedLock.acquire(10), /cot-shots lock timeout/);
  assert.deepEqual(readdirSync(queueDir), [], 'timed-out waits remove their queue ticket');

  await checkSameMillisecondFifo();
  await checkLongWaiterKeepsPlace();
  await checkLongWaitFifo();
  await checkRestoredTicket();
  await checkTicketAt();
  await checkOwnershipCascade();
  await checkLiveOwnerKept();
  await checkDeadOwnerReaped();
  await checkReapBehindHead();

  // Gate P5 (2026-10-01): waiting() is a read-only count of live queued acquisitions.
  const probeQueue = join(root, 'probe.queue');
  const probe = createCaptureLock({ lockDir: join(root, 'probe.lock'), queueDir: probeQueue });
  assert.equal(probe.waiting(), 0, 'no queue directory: nobody waits');
  mkdirSync(probeQueue);
  assert.equal(probe.waiting(), 0, 'an empty queue: nobody waits');
  writeFileSync(join(probeQueue, `000000000000001-000000000000-${process.pid}.t`), String(process.pid));
  const longWaiter = `000000000000002-000000000001-${process.pid}.t`;
  writeFileSync(join(probeQueue, longWaiter), String(process.pid));
  const longAgo = twoHoursAgo();
  utimesSync(join(probeQueue, longWaiter), longAgo, longAgo);
  writeFileSync(join(probeQueue, '000000000000003-99999999.t'), '99999999');
  writeFileSync(join(probeQueue, 'notes.txt'), 'not a ticket');
  assert.equal(probe.waiting(), 2, 'live tickets count, a long waiter included; dead tickets and other files do not');
  assert.equal(readdirSync(probeQueue).length, 4, 'waiting() reaps nothing');
  writeFileSync(join(root, 'queue-file'), 'not a directory');
  assert.equal(createCaptureLock({ lockDir: join(root, 'other.lock'), queueDir: join(root, 'queue-file') }).waiting(), 1,
    'an unreadable queue reports a waiter, so callers keep draining');
  // a place-keeping lease rejoins behind a waiting perf band ticket (2026-10-13), never behind normal tickets or
  // another band's, and keeps its place with none waiting
  const band = join(root, 'band-queue');
  mkdirSync(band);
  const NOW = 1791870000000, MEDIA = 1791397979999;
  writeFileSync(join(band, `001791397983201-000000000000-52362.t`), '52362');
  writeFileSync(join(band, `001791397983202-000000000000-31662.t`), '31662');
  writeFileSync(join(band, `${String(NOW - 5000).padStart(15, '0')}-000000000000-45128.t`), '45128');
  const commands = { 52362: 'node tools/zz-perf-block.mjs --plan=x', 31662: 'node .qa-dev/cn/lock-run-stamp.mjs', 45128: 'node tools/zz-perf-probe.mjs' };
  const commandOf = (pid) => commands[pid] ?? '';
  assert.equal(stampBehindWaiting(MEDIA, { queueDir: band, now: NOW, commandOf }), 1791397983202,
    'one past the waiting perf band ticket; another band ticket and a normal perf ticket do not move it');
  assert.equal(stampBehindWaiting(1791397983300, { queueDir: band, now: NOW, commandOf }), 1791397983300, 'tickets ahead of the stamp do not move it');
  assert.equal(stampBehindWaiting(MEDIA, { queueDir: band, now: NOW, commandOf: () => 'node tools/media-production/cinema.mjs' }), MEDIA,
    'no perf ticket waiting: the lease keeps its place');
  assert.equal(stampBehindWaiting(MEDIA, { queueDir: join(root, 'no-such-queue'), now: NOW, commandOf }), MEDIA, 'no queue: its place');
  console.log('capture-lock.selftest: acquire, refresh, release, recovery, timeout, same-millisecond FIFO, long-wait FIFO, long-waiter place, restored ticket, stamped ticket, owner tokens (the A/B/C cascade, a live owner kept, dead and reused-pid owners reaped, reaping behind the head) and waiting() passed');
} finally {
  rmSync(root, { recursive: true, force: true });
}
