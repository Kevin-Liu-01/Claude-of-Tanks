// The media lane's payback to the normal band, one copy (2026-11-02 audit S4, tools/media-r5/priority-yield.mjs): lab.mjs
// and site50-finals.mjs each carried the rule, and the copies drifted (each comment cites the other's incident; the lab
// went on while ANY ticket waited, the finals only while a normal-band one did). Driven on a fake clock with a scripted
// lock and queue: a priority-band hold is passed by and a normal one pays; with the lock free the lane goes on after a
// minute when no normal ticket waits and after five minutes at most; the capture service's own count replaces the
// lock-directory count; a stop ends the wait. Both callers use it, and the lab reads the lock's own state for its leases.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCaptureLock } from '../capture-lock.mjs';
import { createHoldClassifier, PRIORITY_AGE_MS, yieldToNormalHolds } from './priority-yield.mjs';

const T0 = 1_800_000_000_000;
const stamp = (msAgo) => T0 - msAgo;
/** A scripted world: `holdAt(t)` the hold id at t (or null), `ticketsAt(t)` the queue at t ({ name: stamp }). */
function world({ holdAt, ticketsAt }) {
  let t = T0;
  return {
    now: () => t,
    sleep: async (ms) => { t += ms; },
    readHold: () => holdAt(t - T0),
    readTickets: () => new Map(Object.entries(ticketsAt(t - T0))),
    elapsed: () => t - T0,
  };
}

// ---- a priority-band hold is passed by; the normal one pays ---------------------------------------------------------
{
  const old = stamp(2 * PRIORITY_AGE_MS), recent = stamp(60_000);
  const w = world({
    holdAt: (dt) => (dt >= 1_000 && dt < 5_000 ? 'media' : dt >= 6_000 ? 'normal' : null),
    ticketsAt: (dt) => ({ ...(dt < 1_000 ? { P: old } : {}), ...(dt < 6_000 ? { N: recent } : {}) }),
  });
  let priorityNoted = 0;
  const paid = await yieldToNormalHolds({ holds: 1, ...w, onPriority: () => { priorityNoted += 1; } });
  assert.deepEqual([paid.normal, paid.priority, paid.stopped], [1, 1, false], 'the media lease is passed by, the normal hold pays');
  assert.equal(priorityNoted, 1);
  assert.ok(w.elapsed() >= 6_000 && w.elapsed() < 10_000, `it went on once the normal hold began (${w.elapsed()} ms)`);
}

// ---- the lock free: on after a minute with no normal ticket waiting, five minutes at most otherwise ------------------
{
  const idle = world({ holdAt: () => null, ticketsAt: () => ({ P: stamp(2 * PRIORITY_AGE_MS) }) });
  const none = await yieldToNormalHolds({ holds: 2, ...idle });
  assert.equal(none.normal, 0);
  assert.ok(idle.elapsed() > 60_000 && idle.elapsed() < 62_000, `a priority ticket waiting does not hold it (${idle.elapsed()} ms)`);
  const waiting = world({ holdAt: () => null, ticketsAt: () => ({ N: stamp(1_000) }) });
  await yieldToNormalHolds({ holds: 2, ...waiting });
  assert.ok(waiting.elapsed() > 300_000 && waiting.elapsed() < 302_000, `a normal ticket waiting holds it to the cap (${waiting.elapsed()} ms)`);
}

// ---- the capture service's count; its restart; a stop -----------------------------------------------------------------
{
  const busy = world({ holdAt: () => 'other', ticketsAt: () => ({}) });
  const counts = [10, 10, 11, 12, 12];
  const read = () => counts[Math.min(counts.length - 1, Math.floor(busy.elapsed() / 5_000))];
  const paid = await yieldToNormalHolds({ holds: 2, ...busy, fifo2: read, fifo2Base: null });
  assert.deepEqual([paid.served, paid.fifo2Base], [2, 10], 'two of the service\'s holds since the first look');
  const restarted = world({ holdAt: () => 'other', ticketsAt: () => ({}) });
  const after = await yieldToNormalHolds({ holds: 1, ...restarted, fifo2: () => (restarted.elapsed() < 5_000 ? 0 : 1), fifo2Base: 40 });
  assert.deepEqual([after.served, after.fifo2Base], [1, 0], 'a restarted service counts from its new zero');
  let stop = false;
  const stopping = world({ holdAt: () => 'other', ticketsAt: () => ({}) });
  const stoppedAt = await yieldToNormalHolds({ holds: 5, ...stopping, stopped: () => { if (stopping.elapsed() > 2_000) stop = true; return stop; } });
  assert.equal(stoppedAt.stopped, true, 'a stop ends the wait');
}

// ---- the classifier alone: a hold whose owner ticket never shows is normal after three seconds -----------------------
{
  const classifier = createHoldClassifier({ tickets: new Map() });
  assert.deepEqual(classifier.observe({ holdId: 'h', tickets: new Map(), t: T0 }), []);
  assert.deepEqual(classifier.observe({ holdId: 'h', tickets: new Map(), t: T0 + 3_000 }), [{ hold: 'h', priority: false }]);
  assert.deepEqual([classifier.normal, classifier.priority], [1, 0]);
}

// ---- both callers use the one rule; the lab's leases read the lock's own state ----------------------------------------
{
  const code = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:\\'"`])\/\/.*$/gm, '$1');
  const lab = code('./lab.mjs'), finals = code('./site50-finals.mjs');
  for (const [name, text] of [['lab.mjs', lab], ['site50-finals.mjs', finals]]) {
    assert.match(text, /yieldToNormalHolds\(\{/, `${name} pays back through the shared rule`);
    assert.doesNotMatch(text, /PRIORITY_AGE_MS\s*=|const holdId = |left\.filter\(/, `${name} keeps no copy of it`);
  }
  assert.doesNotMatch(lab, /\bholding\b/, 'the lab keeps no flag of its own for whether it holds the lock');
  assert.match(lab, /lock\.held\b/, 'it reads the lock\'s own state');
  assert.doesNotMatch(lab, /lock\.release\s*=/, 'and patches no lock method');
  const root = mkdtempSync(join(tmpdir(), 'cot-priority-yield-'));
  try {
    const lock = createCaptureLock({ lockDir: join(root, 'l'), queueDir: join(root, 'q'), log: () => {} });
    assert.equal(lock.held, false);
    await lock.acquire(2_000);
    assert.equal(lock.held, true, 'the lock reports its own hold');
    lock.release();
    assert.equal(lock.held, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
}
console.log('priority-yield.selftest: the payback rule (priority holds passed, normal holds pay, the free-lock exits, the service count, a stop), shared by the lab and the finals; the lab reads lock.held');
