// visual-census-lock.selftest — the patient head (2026-10-05): two waiters of one session, the older at the FIFO head and
// the session mutex held by a sibling lane's hold; when the mutex frees, the older waiter takes it (the patient head),
// where the old step-behind rule handed it to the newer one. And the cap: past patientHeadMs the head steps behind.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createPoliteCaptureLock } from './visual-census-lock.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fast = { requeuePauseMs: 30, headPollMs: 15, maxHolderWaitMs: 2000, patientPollMs: 25, ticketRefreshMs: 50 };
// (2026-10-16, the perf lane: the triage's flake class) every step waits on what it needs — a log line, a won lock — never
// on a fixed sleep a loaded host can outrun; each wait is bounded, and a miss names what never happened
async function until(what, ready, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (!ready()) {
    if (Date.now() > deadline) throw new Error(`visual-census-lock.selftest: ${what} never happened within ${timeoutMs} ms`);
    await sleep(10);
  }
}

async function race(patientHeadMs) {
  const root = mkdtempSync(path.join(tmpdir(), 'cot-patient-head-'));
  const dirs = { queueDir: path.join(root, 'queue'), lockDir: path.join(root, 'lock'), probeDir: path.join(root, 'probe.lock') };
  try {
    // a sibling lane's hold has the session mutex (a live pid: never reaped)
    mkdirSync(dirs.probeDir); writeFileSync(path.join(dirs.probeDir, 'pid'), String(process.pid));
    const logs = { older: [], newer: [] };
    const older = createPoliteCaptureLock({ ...dirs, ...fast, patientHeadMs, log: (m) => logs.older.push(m) });
    const won = [];
    const a = older.acquire(60_000).then(() => won.push('older'));
    // the older waiter reaches the head and finds the mutex busy: it holds the head (patient) or passes (the old rule)
    await until('the older waiter reaching the busy head',
      () => logs.older.some((m) => (patientHeadMs > 0 ? /holding the head/ : /one waiter passes/).test(m)));
    const newer = createPoliteCaptureLock({ ...dirs, ...fast, patientHeadMs, log: (m) => logs.newer.push(m) });
    const b = newer.acquire(60_000).then(() => won.push('newer'));
    await sleep(8 * fast.headPollMs); // both waiting (the newer's ticket is queued as acquire starts)
    rmSync(dirs.probeDir, { recursive: true, force: true }); // the sibling's hold ends
    await until('a waiter taking the freed session mutex', () => won.length > 0);
    const first = won[0];
    // the winner releases; the other then gets its turn
    (first === 'older' ? older : newer).release();
    await until('the second waiter\'s turn', () => won.length === 2);
    await Promise.all([a, b]);
    (first === 'older' ? newer : older).release();
    return { first, order: [...won], logs };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const patient = await race(60_000);
assert.equal(patient.first, 'older', `the patient head: the older waiter takes the freed session mutex (${patient.order.join(' → ')})`);
assert.deepEqual(patient.order, ['older', 'newer'], 'and the newer one goes next');
assert.ok(patient.logs.older.some((m) => /holding the head/.test(m)), 'the wait at the head is logged');
assert.ok(patient.logs.older.some((m) => /the session mutex freed after/.test(m)), 'and its end');
assert.ok(!patient.logs.older.some((m) => /one waiter passes/.test(m)), 'it never stepped behind');

// the old rule (patientHeadMs 0), read from its own logs, not from which waiter a loaded host lets win the race: the head
// passes rather than holding, never waits at the head, and both waiters get their turn
const old = await race(0);
assert.ok(old.logs.older.some((m) => /one waiter passes/.test(m)), `the old rule: the busy head steps behind (${old.order.join(' → ')})`);
assert.ok(![...old.logs.older, ...old.logs.newer].some((m) => /holding the head/.test(m)), 'and never holds the head');
assert.deepEqual([...old.order].sort(), ['newer', 'older'], 'both waiters get their turn');

// the cap: a mutex held past patientHeadMs — the head logs the wait and steps behind as before
{
  const root = mkdtempSync(path.join(tmpdir(), 'cot-patient-cap-'));
  const dirs = { queueDir: path.join(root, 'queue'), lockDir: path.join(root, 'lock'), probeDir: path.join(root, 'probe.lock') };
  try {
    mkdirSync(dirs.probeDir); writeFileSync(path.join(dirs.probeDir, 'pid'), String(process.pid));
    const logs = [];
    const lock = createPoliteCaptureLock({ ...dirs, ...fast, patientHeadMs: 150, log: (m) => logs.push(m) });
    await assert.rejects(lock.acquire(3000), /cot-shots lock timeout/, 'never gets a mutex that stays held');
    assert.ok(logs.some((m) => /the patient head waited/.test(m)) && logs.some((m) => /one waiter passes/.test(m)), 'past the cap it steps behind, logged');
    assert.ok(!existsSync(dirs.lockDir), 'and it never took the FIFO lock while waiting');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
console.log(`visual-census-lock.selftest: the patient head — the older waiter of one session takes the freed mutex (${patient.order.join(' → ')}; the old rule: ${old.order.join(' → ')}), the cap steps behind, no FIFO lock while waiting PASS`);
