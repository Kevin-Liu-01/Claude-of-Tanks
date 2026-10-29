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
import { classifyCommand, createCaptureLock, stampBehindWaiting, summarizeHoldLog, ticketAt } from './capture-lock.mjs';
// acquire() lengthens its wait to COT_SHOTS_LOCK_TIMEOUT_MS inside a landing chain; this receipt pins the lock's own semantics.
process.env.COT_SHOTS_LOCK_TIMEOUT_MS = '';
// and acquire's class from COT_SHOTS_LOCK_CLASS, which a lane may export
process.env.COT_SHOTS_LOCK_CLASS = '';

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

// 2026-10-22 (item 240): a waiter killed in the queue whose pid then names another process, or whose heartbeat stopped,
// no longer stalls the head; an older copy's bare-pid ticket keeps the old rules.
async function checkDeadWaiterIdentity() {
  const dir = join(root, 'identity.queue'), lockAt = join(root, 'identity.lock');
  mkdirSync(dir);
  const logs = [];
  const lock = createCaptureLock({ lockDir: lockAt, queueDir: dir, ticketSilentMs: 1_000, ticketRefreshMs: 50, log: (m) => logs.push(m) });
  const ticket = (stamp, pid, meta) => {
    const name = `${String(stamp).padStart(15, '0')}-000000000000-${pid}.t`;
    writeFileSync(join(dir, name), meta ? JSON.stringify({ format: 'cot-capture-ticket/1', pid, ...meta }) : String(pid));
    return name;
  };
  // the parent process is alive, but this ticket's owner started at another time: a reused pid
  const reused = ticket(1, process.ppid, { procStart: 'Mon Jan 1 00:00:00 1990', refreshMs: 30_000, ready: true });
  await lock.acquire(5_000);
  assert.equal(existsSync(join(dir, reused)), false, 'a reused-pid ticket at the head is removed at once');
  assert.ok(logs.some((m) => /removed the dead ticket .*now names another process/.test(m)), 'and the removal says why');
  lock.release();
  // a live process whose heartbeat stopped
  const silent = ticket(2, process.ppid, { refreshMs: 50, ready: true });
  const longAgo = new Date(Date.now() - 60_000);
  utimesSync(join(dir, silent), longAgo, longAgo);
  await lock.acquire(5_000);
  assert.equal(existsSync(join(dir, silent)), false, 'a ticket whose heartbeat stopped is removed');
  lock.release();
  // an older copy's bare pid of a live process, 30 min without a heartbeat (under the old hour): still the head, never
  // "silent" (that rule needs a declared heartbeat), so the waiter times out behind it
  const older = ticket(3, process.ppid, null);
  const halfHourAgo = new Date(Date.now() - 30 * 60_000);
  utimesSync(join(dir, older), halfHourAgo, halfHourAgo);
  await assert.rejects(lock.acquire(300), /cot-shots lock timeout/);
  assert.equal(existsSync(join(dir, older)), true, "an older copy's live ticket is kept");
  unlinkSync(join(dir, older));
  rmSync(lockAt, { recursive: true, force: true });
}

// 2026-10-22 (item 240): acquire's `prepare` warms while the ticket waits; the queue serves the tickets behind it
// meanwhile, waiting() leaves it out, and acquire resolves with prepare's result once it heads the queue.
async function checkWarmingKeepsPlace() {
  const dir = join(root, 'warm.queue'), lockAt = join(root, 'warm.lock'), logFile = join(root, 'warm.log');
  const options = { lockDir: lockAt, queueDir: dir, ticketRefreshMs: 50, logFile };
  const warmer = createCaptureLock(options), other = createCaptureLock(options), probe = createCaptureLock(options);
  mkdirSync(lockAt); // a holder this test is not
  let openGate;
  const gate = new Promise((resolve) => { openGate = resolve; });
  const order = [];
  const warming = warmer.acquire(10_000, { prepare: async () => { await gate; return { pages: 2 }; } })
    .then((value) => { order.push('warmer'); return value; });
  await until('the warming ticket', () => existsSync(dir) && readdirSync(dir).length === 1);
  const [warmTicket] = readdirSync(dir);
  assert.equal(JSON.parse(readFileSync(join(dir, warmTicket), 'utf8')).ready, false, 'a warming ticket says so');
  assert.ok(warmTicket.endsWith('.w'), 'and waits as .w, which older copies (they list *.t) never wait behind');
  const later = other.acquire(10_000).then(() => { order.push('other'); });
  await until('the second ticket', () => readdirSync(dir).length === 2);
  assert.equal(probe.waiting(), 1, 'waiting() leaves a warming ticket out');
  rmSync(lockAt, { recursive: true }); // the holder leaves
  await later;
  assert.deepEqual(order, ['other'], 'the ticket behind a warming one is served');
  assert.equal(readdirSync(dir).includes(warmTicket), true, 'and the warming ticket keeps its place');
  other.release();
  openGate();
  assert.deepEqual(await warming, { pages: 2 }, "acquire resolves with prepare's result");
  assert.equal(warmer.lastTicket, warmTicket.replace(/\.w$/, '.t'), 'once ready it holds as .t at its first stamp');
  assert.deepEqual(order, ['other', 'warmer']);
  warmer.release();
  const lines = readFileSync(logFile, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  assert.deepEqual(lines.map((line) => line.e), ['hold', 'release', 'hold', 'release'], 'every hold and release is logged');
  assert.ok(lines[2].warmMs > 0 && lines[2].waitedMs >= lines[2].warmMs, 'a warmed hold records its warm and wait times');
  assert.ok(Number.isFinite(lines[3].heldMs) && lines[3].released === true);
  const stats = summarizeHoldLog(lines.map((line) => JSON.stringify(line)), { hours: 1 });
  assert.deepEqual([stats.holds, stats.warmedHolds, stats.reaped], [2, 1, 0], 'the status summary counts holds and warmed holds');

  // a prepare that throws leaves the queue; a wait that times out hands prepare's result back to close
  await assert.rejects(warmer.acquire(5_000, { prepare: async () => { throw new Error('warm failed'); } }), /warm failed/);
  assert.deepEqual(readdirSync(dir), [], 'a failed prepare removes its ticket');
  mkdirSync(lockAt);
  const timedOut = await warmer.acquire(200, { prepare: async () => ({ browser: 'b' }) }).then(() => null, (error) => error);
  assert.match(String(timedOut?.message), /cot-shots lock timeout/);
  assert.deepEqual(timedOut.prepared, { browser: 'b' }, "a timed-out wait carries prepare's result to clean up");
  rmSync(lockAt, { recursive: true, force: true });
}

// 2026-10-22 (item 240): prepare starts just in time — once at most `warmAhead` live tickets are ahead — so a long queue
// does not hold a warm browser per lane for hours.
async function checkJustInTimeWarm() {
  const dir = join(root, 'jit.queue'), lockAt = join(root, 'jit.lock');
  const options = { lockDir: lockAt, queueDir: dir, ticketRefreshMs: 50 };
  mkdirSync(lockAt);
  const started = [], held = [];
  const waiter = (name) => {
    const lock = createCaptureLock(options);
    return lock.acquire(20_000, { warmAhead: 1, prepare: async () => { started.push(name); return name; } })
      .then((value) => { held.push(value); lock.release(); });
  };
  const runs = [];
  for (const name of ['A', 'B', 'C']) {
    runs.push(waiter(name));
    await until(`ticket ${name}`, () => existsSync(dir) && readdirSync(dir).filter((n) => /\.[tw]$/.test(n)).length === runs.length);
  }
  await until('A and B warming', () => started.length === 2);
  await new Promise((resolve) => setTimeout(resolve, 1_500));
  assert.deepEqual(started, ['A', 'B'], 'the third ticket waits to warm while two are ahead');
  const tickets = readdirSync(dir).filter((n) => /\.[tw]$/.test(n)).sort();
  assert.deepEqual(tickets.map((n) => [n.slice(-2), JSON.parse(readFileSync(join(dir, n), 'utf8')).phase]),
    [['.t', 'ready'], ['.t', 'ready'], ['.w', 'queued']], 'warm tickets are .t; the third waits as .w, queued to warm');
  rmSync(lockAt, { recursive: true });
  await Promise.all(runs);
  assert.deepEqual(started, ['A', 'B', 'C']);
  assert.deepEqual(held, ['A', 'B', 'C'], 'holds stay in queue order');
}

// 2026-10-22 (item 240): a job killed while it waited rejoins at its first run's stamp under the same `place` key; the
// place is dropped once it holds.
async function checkPlaceKey() {
  const dir = join(root, 'place.queue'), lockAt = join(root, 'place.lock');
  const options = { lockDir: lockAt, queueDir: dir };
  mkdirSync(lockAt);
  const first = createCaptureLock(options);
  await assert.rejects(first.acquire(200, { place: 'lane 240/item' }), /cot-shots lock timeout/);
  const stamp = first.lastTicket.slice(0, 15);
  const second = createCaptureLock(options);
  await assert.rejects(second.acquire(200, { place: 'lane 240/item' }), /cot-shots lock timeout/);
  assert.equal(second.lastTicket.slice(0, 15), stamp, 'the second run rejoins at the first stamp');
  rmSync(lockAt, { recursive: true });
  const third = createCaptureLock(options);
  await third.acquire(2_000, { place: 'lane 240/item' });
  assert.equal(third.lastTicket.slice(0, 15), stamp);
  assert.deepEqual(readdirSync(join(dir, 'places')), [], 'a held place is dropped');
  third.release();
  const fourth = createCaptureLock(options);
  await fourth.acquire(2_000, { place: 'lane 240/item' });
  assert.notEqual(fourth.lastTicket.slice(0, 15), stamp, 'a later job under the key queues anew');
  fourth.release();
}

// ---- lock classes and the hold cap (2026-10-27, item 262) ----------------------------------------------------------
const settle = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const slotsIn = (dir) => (existsSync(dir) ? readdirSync(dir).filter((name) => /^slot-\d+\.holder$/.test(name)).sort() : []);
/** A lock instance on a private queue, with its events in `order` and its log lines in `logs`. */
function classLock(prefix, extra = {}) {
  const logs = [];
  const lock = createCaptureLock({ lockDir: join(root, `${prefix}.lock`), queueDir: join(root, `${prefix}.queue`), lockStaleMs: 60_000,
    ticketRefreshMs: 50, log: (message) => logs.push(message), ...extra });
  return { lock, logs };
}
/** acquire() in the background: { done, held() }; the promise records `name` into `order` once held. */
function take(lock, name, order, options) {
  let held = false;
  const done = lock.acquire(10_000, options).then(() => { held = true; order.push(name); });
  return { done, held: () => held };
}

// Commands are classified by their script names only; timing wins; an unknown command is timing (exclusive).
function checkClassifyCommand() {
  const lane = '/Users/k/cot-lanes/web-nav-perf-240';
  for (const command of [`${lane}/tools/genHeroCards.mjs --ids=kf51_u --out=/tmp/x`, 'tools/genIcons.mjs --views armorSide,modulesSide,crewSide',
    'tools/genDrawings.mjs --ids=t72b3', `${lane}/tools/anatomy-render-set.mjs --ids=a`, 'tools/ui-gauntlet/capture.mjs --sizes=8',
    'tools/garage-kit-sheet.mjs', `node ${lane}/tools/media-r5/with-capture-lock.mjs node tools/genIcons.mjs`]) {
    assert.deepEqual(classifyCommand(command), { lockClass: 'render', from: 'command' }, `a render: ${command}`);
  }
  for (const command of ['tools/perfprobe.mjs --map=verdant', '/x/rust-sim-core-252/.qa-dev/rust/worker-sortie-probe.mjs dist /y',
    `${lane}/tools/mp-room-census.mjs --dist=/x/genIcons-out`, 'tools/garage-action-timing.mjs', 'tools/visual-census-sheet.mjs']) {
    assert.deepEqual(classifyCommand(command), { lockClass: 'timing', from: 'command' }, `timing: ${command}`);
  }
  assert.deepEqual(classifyCommand('/x/aps-frames.mjs --root=/y/gauntlet-run'), { lockClass: 'timing', from: 'default' },
    'an unknown script is timing by default; its arguments never classify it');
  assert.deepEqual(classifyCommand(''), { lockClass: 'timing', from: 'default' });
  // a zsh script is a script: its name classifies it, never its arguments or its lane directory (2026-10-29: a lane's
  // `/bin/zsh /abs/steps.zsh` render chain was read whole and held the lock as exclusive timing)
  for (const command of ['zsh x.zsh', '/bin/zsh /abs/x.zsh', '/bin/zsh /abs/x.zsh --out=/y/genIcons-out']) {
    assert.deepEqual(classifyCommand(command), { lockClass: 'timing', from: 'default' }, `an unknown zsh script: ${command}`);
  }
  for (const command of [`/bin/zsh ${lane}/steps/genIcons-batch.zsh`, 'zsh tools/genDrawings-steps.zsh --out=/y/perf']) {
    assert.deepEqual(classifyCommand(command), { lockClass: 'render', from: 'command' }, `a render zsh script: ${command}`);
  }
  assert.deepEqual(classifyCommand(`/bin/zsh ${lane}/steps/fleet-census.zsh`), { lockClass: 'timing', from: 'command' });
  // tank-standard-check's stage holds render and capture only (2026-10-29): each child stage by its command, the clip
  // audit and the standard check's own render by their process command lines; a timing script still wins
  for (const command of ['/usr/local/bin/node tools/geometry-gate.mjs --ids=t80u --check',
    '/usr/local/bin/node tools/first-party-concept-check.mjs --ids=t72_rys --out=/x/concepts',
    '/usr/local/bin/node tools/photo-reference-check.mjs --ids=a --out=/x/photos',
    `${lane}/tools/track-clip-audit.mjs --exact --strict --ids=t62mv1 --out-dir=/x/tracks`,
    `${lane}/tools/tank-standard-check.mjs --ids=t80u,t90m --gate --stages`]) {
    assert.deepEqual(classifyCommand(command), { lockClass: 'render', from: 'command' }, `a standard-check stage: ${command}`);
  }
  assert.deepEqual(classifyCommand('tools/geometry-gate.mjs tools/perfprobe.mjs'), { lockClass: 'timing', from: 'command' },
    'a timing script still wins over a standard-check stage');
}

// Renders share the lock two at a time in one directory; a third waits for a slot; the last one out frees the path.
async function checkSharedRenders() {
  const order = [];
  const [a, b, c] = ['a', 'b', 'c'].map(() => classLock('share').lock);
  const lockAt = join(root, 'share.lock');
  const first = take(a, 'a', order, { lockClass: 'render' });
  await first.done;
  const second = take(b, 'b', order, { lockClass: 'render' });
  await second.done;
  assert.deepEqual(order, ['a', 'b'], 'a second render holds while the first does');
  const token = readToken(lockAt);
  assert.equal(token.lockClass, 'render');
  assert.deepEqual(token.group, { max: 2 }, 'owner.json records a render group of two');
  assert.deepEqual(slotsIn(lockAt), ['slot-0.holder', 'slot-1.holder'], 'one slot file per member');
  for (const slot of slotsIn(lockAt)) {
    // older copies keep a directory whose *.holder file names a live pid on its first line (liveHolderFiles)
    assert.match(readFileSync(join(lockAt, slot), 'utf8'), new RegExp(`^pid ${process.pid}\\n\\{`), 'a slot names its pid on line one');
  }
  assert.equal(a.heldClass, 'render');
  const third = take(c, 'c', order, { lockClass: 'render' });
  await settle(1_300);
  assert.equal(third.held(), false, 'a third render waits: two slots');
  assert.equal(a.release(), true, 'a member leaves');
  assert.equal(existsSync(lockAt), true, 'the group stays while members hold');
  await third.done;
  assert.deepEqual(order, ['a', 'b', 'c'], 'the freed slot goes to the waiting render');
  assert.equal(b.release(), true);
  assert.equal(existsSync(lockAt), true);
  assert.equal(c.release(), true);
  assert.equal(existsSync(lockAt), false, 'the last member out removes the directory');
  assert.equal(existsSync(`${lockAt}.members`), false, 'and leaves no members mutex');
  assert.deepEqual(readdirSync(join(root, 'share.queue')).filter((name) => /\.[tw]$/.test(name)), [], 'every ticket is removed');
}

// A timing hold is exclusive: a render waits for it, and a timing ticket waits for the running renders to finish.
async function checkTimingExclusion() {
  const order = [];
  const [timing, render, timing2, render2] = [0, 1, 2, 3].map(() => classLock('excl').lock);
  const lockAt = join(root, 'excl.lock');
  await take(timing, 't', order, { lockClass: 'timing' }).done;
  assert.equal(readToken(lockAt).lockClass, 'timing', 'owner.json shows the class');
  assert.equal(readToken(lockAt).group, undefined, 'a timing hold is no group');
  const r = take(render, 'r', order, { lockClass: 'render' });
  await settle(1_300);
  assert.equal(r.held(), false, 'a render waits while a timing hold runs');
  timing.release();
  await r.done;
  const t2 = take(timing2, 't2', order, { lockClass: 'timing' });
  await settle(1_300);
  assert.equal(t2.held(), false, 'a timing ticket waits for the running render');
  render.release();
  await t2.done;
  const r2 = take(render2, 'r2', order, { lockClass: 'render' });
  await settle(1_300);
  assert.equal(r2.held(), false, 'nothing joins a timing hold');
  timing2.release();
  await r2.done;
  render2.release();
  assert.deepEqual(order, ['t', 'r', 't2', 'r2']);
  assert.equal(existsSync(lockAt), false);
}

// FIFO between the classes: a render queued behind a waiting timing ticket does not take the free slot, so a stream
// of renders cannot starve a timing ticket.
async function checkNoStarvation() {
  const order = [];
  const [r1, t, r2, r3] = [0, 1, 2, 3].map(() => classLock('fair').lock);
  await take(r1, 'r1', order, { lockClass: 'render' }).done;
  const timing = take(t, 't', order, { lockClass: 'timing' });
  const behind = take(r2, 'r2', order, { lockClass: 'render' });
  const later = take(r3, 'r3', order, { lockClass: 'render' });
  await settle(1_500);
  assert.equal(timing.held(), false, 'the timing ticket waits for the running render');
  assert.equal(behind.held() || later.held(), false, 'renders behind it do not take the free slot');
  r1.release();
  await timing.done;
  await settle(700);
  assert.deepEqual(order, ['r1', 't'], 'the timing ticket holds alone');
  t.release();
  await Promise.all([behind.done, later.done]);
  assert.deepEqual(order.slice(0, 2), ['r1', 't']);
  assert.deepEqual(new Set(order.slice(2)), new Set(['r2', 'r3']), 'then the renders behind it share');
  r2.release();
  r3.release();
  assert.equal(existsSync(join(root, 'fair.lock')), false);
}

// The hold cap: checkpoint() keeps a hold under its cap or with nobody waiting, and past it with a waiter gives the
// lock up and re-queues at the back; the cap is raised per ticket only with a reason.
async function checkHoldCap() {
  const logFile = join(root, 'cap.log');
  const order = [];
  const { lock: long, logs } = classLock('cap', { logFile });
  const other = classLock('cap', { logFile }).lock;
  const lockAt = join(root, 'cap.lock');
  await assert.rejects(long.acquire(1_000, { holdCapMinutes: 45 }), /holdCapReason/, 'raising the cap needs a reason');
  await assert.rejects(long.acquire(1_000, { lockClass: 'gpu' }), /not a lock class/);
  await long.acquire(5_000, { holdCapMinutes: 45, holdCapReason: 'the full-fleet hero sheet' });
  assert.equal(readToken(lockAt).capMs, 45 * 60_000, 'owner.json records the raised cap');
  assert.equal(readToken(lockAt).capReason, 'the full-fleet hero sheet', 'and its reason');
  long.release();
  await assert.rejects(long.checkpoint(), /holds nothing/);
  await long.acquire(5_000, { lockClass: 'render', holdCapMinutes: 0.01 }); // 0.6 s
  assert.equal((await long.checkpoint()).yielded, false, 'under the cap: keep going');
  await settle(700);
  assert.equal((await long.checkpoint()).yielded, false, 'past the cap with nobody waiting: keep going');
  assert.ok(logs.some((m) => /past its .*cap with nobody waiting/.test(m)));
  const waiter = take(other, 'timing', order, { lockClass: 'timing' });
  await until('the timing ticket queues', () => readdirSync(join(root, 'cap.queue')).some((name) => name.endsWith('.t')));
  const steps = [];
  const yielding = long.checkpoint({
    beforeYield: async () => { steps.push(`before: ${existsSync(lockAt) ? 'held' : 'free'}`); },
    afterResume: async () => { steps.push('resumed'); },
  }).then((result) => { order.push('render again'); return result; });
  await waiter.done;
  assert.deepEqual(steps, ['before: held'], 'beforeYield runs while the lock is still held');
  await settle(1_300);
  assert.deepEqual(order, ['timing'], 'the yielded render waits behind the ticket it yielded to');
  other.release();
  const result = await yielding;
  assert.equal(result.yielded, true);
  assert.deepEqual(steps, ['before: held', 'resumed']);
  assert.deepEqual(order, ['timing', 'render again'], 'it holds again once that hold is done');
  assert.equal(long.heldClass, 'render', 'with its class kept');
  long.release();
  const records = readFileSync(logFile, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
  assert.ok(records.some((r) => r.e === 'release' && /^hold cap: yielded/.test(r.reason ?? '')), 'the hold log says why it yielded');
  assert.ok(records.some((r) => r.e === 'hold' && r.lockClass === 'render' && r.members === 1 && r.capMs === 600));
}

// Dead tickets and dead members: a dead timing ticket ahead of a render is removed; a live older copy's ticket (no
// class) is exclusive; a dead member's slot is freed; a group whose members all died is reaped, also by a timing hold.
async function checkDeadClassedCleanup() {
  const queue = join(root, 'dead.queue'), lockAt = join(root, 'dead.lock');
  mkdirSync(queue, { recursive: true });
  const { lock, logs } = classLock('dead');
  const ghost = deadPid();
  writeFileSync(join(queue, `000000000000001-000000000000-${ghost}.t`), JSON.stringify({ format: 'cot-capture-ticket/1', pid: ghost,
    refreshMs: 30_000, ready: true, lockClass: 'timing' }));
  await lock.acquire(5_000, { lockClass: 'render' });
  assert.ok(logs.some((m) => m.includes(`removed the dead ticket 000000000000001-000000000000-${ghost}.t`)), 'a dead timing ticket is removed');
  lock.release();
  // an older copy's ticket (a live bare pid) is exclusive: a render queued behind it waits, though the path is free
  const older = `000000000000002-000000000000-${process.pid}.t`;
  writeFileSync(join(queue, older), String(process.pid));
  const order = [];
  const behind = take(lock, 'render', order, { lockClass: 'render' });
  await settle(1_300);
  assert.equal(behind.held(), false, "a render does not pass an older copy's ticket");
  unlinkSync(join(queue, older));
  await behind.done;
  // a member that died: its slot is removed when the next render joins, and the group goes on
  const record = (pid) => `pid ${pid}\n${JSON.stringify({ format: 'cot-capture-lock-slot/1', pid, nonce: 'ghost', procStart: null,
    ticket: null, startedAt: new Date().toISOString(), lockClass: 'render' })}\n`;
  writeFileSync(join(lockAt, 'slot-1.holder'), record(ghost));
  const { lock: joiner, logs: joinerLogs } = classLock('dead');
  await joiner.acquire(5_000, { lockClass: 'render' });
  assert.ok(joinerLogs.some((m) => m.includes(`removed the dead render slot slot-1.holder (pid ${ghost}`)), 'the dead slot is freed, and logged');
  assert.deepEqual(slotsIn(lockAt), ['slot-0.holder', 'slot-1.holder'], 'and taken by the live render');
  joiner.release();
  lock.release();
  assert.equal(existsSync(lockAt), false);
  // a group whose every member died (its creator too): reaped by the next hold, a timing one here
  plantOwner(lockAt, { pid: ghost, nonce: 'dead-group', lockClass: 'render', group: { max: 2 } });
  writeFileSync(join(lockAt, 'slot-0.holder'), record(ghost));
  await lock.acquire(5_000, { lockClass: 'timing' });
  assert.ok(logs.some((m) => /reaped .*dead\.lock.*every member of its render group is dead/.test(m)), 'the dead group is reaped');
  assert.equal(readToken(lockAt).lockClass, 'timing');
  lock.release();
  // a group with a live member is kept, even when its creator is dead (the owner token names the dead pid)
  plantOwner(lockAt, { pid: ghost, nonce: 'live-group', lockClass: 'render', group: { max: 2 } });
  writeFileSync(join(lockAt, 'slot-1.holder'), record(process.pid));
  const timing = take(classLock('dead').lock, 'timing', order, { lockClass: 'timing' });
  await settle(1_300);
  assert.equal(timing.held(), false, 'a live member keeps its group though its creator died');
  rmSync(lockAt, { recursive: true });
  await timing.done;
}

// --lock-class on the command line overrides acquire's lockClass and the command's class; an older copy's hold (no
// class) is exclusive to renders.
async function checkClassOverrideAndOlderHold() {
  const { lock } = classLock('override');
  const lockAt = join(root, 'override.lock');
  process.argv.push('--lock-class=render');
  try {
    await lock.acquire(5_000, { lockClass: 'timing' });
  } finally {
    process.argv.pop();
  }
  assert.equal(readToken(lockAt).lockClass, 'render');
  const slot = JSON.parse(readFileSync(join(lockAt, 'slot-0.holder'), 'utf8').split('\n')[1]);
  assert.equal(slot.classFrom, '--lock-class', 'the slot records where its class came from');
  lock.release();
  plantOwner(lockAt, { pid: process.pid, nonce: 'older-copy' }); // an older copy's hold: no class, no group
  const order = [];
  const render = take(classLock('override').lock, 'render', order, { lockClass: 'render' });
  await settle(1_300);
  assert.equal(render.held(), false, "a render never joins an older copy's hold");
  rmSync(lockAt, { recursive: true });
  await render.done;
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
  await checkDeadWaiterIdentity();
  await checkWarmingKeepsPlace();
  await checkPlaceKey();
  await checkJustInTimeWarm();
  checkClassifyCommand();
  await checkSharedRenders();
  await checkTimingExclusion();
  await checkNoStarvation();
  await checkHoldCap();
  await checkDeadClassedCleanup();
  await checkClassOverrideAndOlderHold();

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
  console.log('capture-lock.selftest: acquire, refresh, release, recovery, timeout, same-millisecond FIFO, long-wait FIFO, long-waiter place, restored ticket, stamped ticket, owner tokens (the A/B/C cascade, a live owner kept, dead and reused-pid owners reaped, reaping behind the head), dead waiters (reused pid, silent heartbeat), warming tickets, just-in-time warming, place keys, lock classes (shared renders, timing exclusion, no starvation, '
    + 'the hold cap and its yield, dead classed tickets and members, the --lock-class override), the hold log and waiting() passed');
} finally {
  rmSync(root, { recursive: true, force: true });
}
