// The spike-budget receipt's judge (tools/battle-spike-budget.mjs; docs/PERF-SPIKES.md "The budget"): a battle record's
// live readings against its pass's limits — the counts a minute, a time limit held while the machine is loaded (never
// failed by the load), the load-free limits judged always, a missing battle failed — and the shipped budget's shape.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { judgeCensus, judgeRecord, liveReadings, readBudget } from './battle-spike-budget.mjs';

const budget = {
  scenarios: ['verdant:standard'], sizes: [14], passes: ['cold', 'warm'], seconds: 40, loadPerCore: 0.75,
  limits: { warm: { links: 0, longTasks: 0, allocMBPerS: 6, over33PerMin: 4, hitchesPerMin: 2 }, cold: { links: 3, over33PerMin: 12 } },
};
const record = (pass, { links = 0, longTasks = 0, alloc = 4, over33 = 2, load = 4 } = {}) => ({
  key: `verdant-standard-14v14-${pass}`, pass, load: { before: [load], after: [load] },
  window: { liveStartMs: 10000, endMs: 40000 },
  live: { links: { links }, longTasks, heap: { allocMBPerS: alloc }, intervals: { over33, over50: 0, hitches: 1 } },
});

// a half-minute window: two spikes are four a minute
assert.equal(liveReadings(record('warm')).over33PerMin, 4);
const verdict = (r, cores = 16) => Object.fromEntries(judgeRecord(r, budget, cores).map((v) => [v.name, v.verdict]));
assert.deepEqual(verdict(record('warm')), { links: 'PASS', longTasks: 'PASS', allocMBPerS: 'PASS', over33PerMin: 'PASS', hitchesPerMin: 'PASS' });
assert.equal(verdict(record('warm', { links: 1 })).links, 'FAIL', 'a first-use link in a warm battle fails');
assert.equal(verdict(record('warm', { over33: 3 })).over33PerMin, 'FAIL', 'six spikes a minute past four fail');
// loaded: the time limit is held, never failed; the load-free limits still judge
const loaded = verdict(record('warm', { over33: 30, alloc: 9, load: 40 }), 16);
assert.equal(loaded.over33PerMin, 'HELD', 'a loaded machine holds the time limits');
assert.equal(loaded.allocMBPerS, 'FAIL', 'the allocation rate is judged under any load');
assert.equal(verdict(record('cold', { links: 3 })).links, 'PASS', 'the cold pass has its own limits');

// a census folder: the budget's battles, one missing
const dir = mkdtempSync(path.join(os.tmpdir(), 'spike-budget-'));
try {
  writeFileSync(path.join(dir, 'verdant-standard-14v14-warm.json'), JSON.stringify(record('warm')));
  const judged = judgeCensus(dir, budget, 16);
  assert.equal(judged.failed, 1, 'the missing cold battle fails');
  assert.ok(judged.lines.some((line) => /cold: FAIL \(no record\)/.test(line)));
  assert.ok(judged.lines.some((line) => /warm: PASS/.test(line)));
} finally { rmSync(dir, { recursive: true, force: true }); }

// the shipped budget: watched battles, both passes, the four kinds of limit
const shipped = readBudget();
assert.equal(shipped.driver, 'watch', 'the budget replays watched battles (the same battle every run)');
assert.ok(shipped.scenarios.length >= 2 && shipped.sizes.length >= 1);
for (const pass of ['cold', 'warm']) for (const name of ['links', 'longTasks', 'allocMBPerS', 'hitchesPerMin']) {
  assert.ok(Number.isFinite(shipped.limits[pass][name]), `the ${pass} pass limits ${name}`);
}
assert.equal(shipped.limits.warm.links, 0, 'a warm battle links no program');
console.log('battle-spike-budget.selftest: limits a minute, time held under load, load-free limits always judged, missing battles failed, the shipped budget well formed PASS');
