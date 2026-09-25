// tools/garage-switch-probe.selftest.mjs — FSP-01 Garage switch cost receipt.
//
// Part 1 (no browser): the profile helpers' contracts — census ranking, named
// sequences, nearest-rank percentiles, switch classification, stage
// normalization, the markdown renderer and the warm-switch gate with its
// negative controls.
// Part 2 (real browser, exclusive CPU, capture FIFO): boots the Garage on an
// isolated Vite dev server, drives the five exhibit vehicles cold, then eight
// warm revisits that must hit the desktop pedestal LRU. Warm switches must not
// block the main thread longer than 120 ms (p95 of the worst long task) and
// must have their first frame after reveal within 250 ms (p95). Cold rows are
// reported, never gated: dev-server module transforms inflate them.
// node tools/garage-switch-probe.selftest.mjs [--out=/absolute/fresh-directory]
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createCaptureLock } from './capture-lock.mjs';
import {
  GARAGE_FIVE, RECEIPT_WARM_PASS, WARM_SWITCH_BUDGET, checkWarmSwitchBudget, classifySwitches,
  garageSwitchUrl, heaviestHullsFromCensus, normalizeStages, percentile, renderProfileMarkdown,
  resolveProfileSequence, runProfile, summarizeProfile,
} from './garage-switch-probe.mjs';

const out = process.argv.find((a) => a.startsWith('--out='))?.slice(6);

// --- Part 1: browser-free contracts ---------------------------------------
assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 50), 5);
assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95), 10);
assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 90), 9);
assert.equal(percentile([7], 95), 7);
assert.equal(percentile([], 95), null);
assert.equal(percentile([3, NaN, 1], 50), 1, 'non-finite samples are ignored');

const census = ['id,builder_group,high_triangles,low_triangles', 'a,g,10,5', 'b,g,30,5', 'c,g,20,5',
  'd,g,40,5', 'e,g,x,5'].join('\n');
assert.deepEqual(heaviestHullsFromCensus(census, { count: 2 }).map((row) => row.id), ['d', 'b']);
assert.deepEqual(heaviestHullsFromCensus(census, { count: 3, exclude: ['d'] }).map((row) => row.id), ['b', 'c', 'a']);
assert.deepEqual(heaviestHullsFromCensus(census, { count: 5, available: ['a', 'c'] }).map((row) => row.id), ['c', 'a']);
assert.throws(() => heaviestHullsFromCensus('foo,bar\n1,2', {}), /id\/high_triangles/);
assert.throws(() => heaviestHullsFromCensus('', {}), /empty/);

assert.deepEqual(resolveProfileSequence('garage'), [...GARAGE_FIVE]);
assert.deepEqual(resolveProfileSequence('receipt'), [...GARAGE_FIVE, ...RECEIPT_WARM_PASS, ...RECEIPT_WARM_PASS]);
assert.equal(GARAGE_FIVE.length, 5);
assert.ok(RECEIPT_WARM_PASS.every((id) => GARAGE_FIVE.includes(id)), 'the warm pass revisits exhibit vehicles');
assert.notEqual(RECEIPT_WARM_PASS[0], GARAGE_FIVE.at(-1), 'the warm pass never starts on the current hero');
assert.equal(new Set(RECEIPT_WARM_PASS).size, RECEIPT_WARM_PASS.length);
assert.deepEqual(resolveProfileSequence('walk'), [...Array(6).fill('@next'), ...Array(6).fill('@prev')]);
assert.deepEqual(resolveProfileSequence('x, y ,z'), ['x', 'y', 'z']);
assert.throws(() => resolveProfileSequence(' , '), /unknown switch sequence/);
const fsp01 = resolveProfileSequence('fsp01', { censusText: census, available: ['a', 'b', 'c', 'd', ...GARAGE_FIVE] });
assert.deepEqual(fsp01, [...GARAGE_FIVE, 'd', 'b', 'c', 'a', ...GARAGE_FIVE], 'fsp01 = five, heaviest available, five again');

const row = (id, path, extra = {}) => ({
  id, path, revealMs: 100, paintedMs: 120, presentedMs: 140, maxFrameGapMs: 30, longTaskCount: 0,
  longTaskTotalMs: 0, longTaskMaxMs: 0, settleLongTaskTotalMs: 0, programsDelta: 0, geometriesDelta: 0,
  texturesDelta: 0, heapDeltaMB: 0, stages: {}, ...extra,
});
const classified = classifySwitches([row('a', 'procedural'), row('b', 'procedural'), row('a', 'cached'),
  row('b', 'procedural'), row('c', null, { revealMs: -1 })]);
assert.deepEqual(classified.map((r) => r.class), ['cold', 'cold', 'warm', 'rebuild', 'failed']);

const good = [row('a', 'procedural', { longTaskMaxMs: 900, paintedMs: 1200 }), row('b', 'procedural'),
  ...['a', 'b', 'a', 'b'].map((id) => row(id, 'cached', { longTaskMaxMs: 40, paintedMs: 60 }))];
assert.deepEqual(checkWarmSwitchBudget(good), [], 'cold rows are reported, never gated');
assert.deepEqual(checkWarmSwitchBudget(good, { longTaskP95Ms: 30 }), ['warm p95 worst long task 40 ms > 30 ms']);
assert.deepEqual(checkWarmSwitchBudget(good, { paintP95Ms: 50 }), ['warm p95 painted 60 ms > 50 ms']);
assert.deepEqual(checkWarmSwitchBudget(good.slice(0, 5)), ['only 3 warm switches observed (need 4)']);
assert.deepEqual(checkWarmSwitchBudget([...good, row('a', 'cached', { revealMs: -1 })]),
  ['a: switch never revealed (cached)']);
assert.deepEqual(checkWarmSwitchBudget([...good, row('b', 'cached', { longTaskMaxMs: WARM_SWITCH_BUDGET.longTaskP95Ms + 1 })]),
  [`warm p95 worst long task ${WARM_SWITCH_BUDGET.longTaskP95Ms + 1} ms > ${WARM_SWITCH_BUDGET.longTaskP95Ms} ms`],
  'one bad warm switch in five is the p95 sample');

const summary = summarizeProfile(good.map((r, i) => ({ ...r, stages: i < 2
  ? { importMs: 10 + i, paintMs: 20, buildWorkMs: 50 + i, core: { authoredMs: 30 }, tail: { batchMs: 5 } } : {} })));
assert.deepEqual(Object.keys(summary.byClass), ['cold', 'warm']);
assert.equal(summary.byClass.warm.n, 4);
assert.equal(summary.byClass.cold.longTaskMaxMs.max, 900);
assert.equal(summary.stages['core.authoredMs'].n, 2);
assert.equal(summary.stages['tail.batchMs'].p95, 5);
assert.equal(summary.stages.buildWorkMs.max, 51);

const record = { id: 'a', path: 'procedural', stages: { import: { beginMs: 0, endMs: 12 }, paint: { beginMs: 0, endMs: 40 },
  build: { beginMs: 41, endMs: 141 }, stage: { beginMs: 141, endMs: 143 }, compile: { beginMs: 143, endMs: 180 } },
  build: { workMs: 90, yieldMs: 10, checkpointCount: 3, maxStepMs: 60 }, core: { totalMs: 70 }, tail: { totalMs: 20 } };
assert.deepEqual(normalizeStages(record, null), { importMs: 12, paintMs: 40, prebakeMs: 40, buildWallMs: 100,
  buildWorkMs: 90, buildYieldMs: 10, buildSteps: 3, buildMaxStepMs: 60, stageMs: 2, compileMs: 37,
  core: { totalMs: 70 }, tail: { totalMs: 20 } });
assert.deepEqual(normalizeStages(null, { prebakeMs: 55, buildMs: 80, buildYieldMs: 5, buildCheckpointCount: 1,
  maxBuildStepMs: 70, compileMs: 20, decorMs: 9 }), { prebakeMs: 55, buildWorkMs: 80, buildYieldMs: 5, buildSteps: 1,
  buildMaxStepMs: 70, compileMs: 20, tail: { decorWorkMs: 9 } }, 'older trees fall back to the legacy phases');
assert.deepEqual(normalizeStages(null, null), {});

const url = garageSwitchUrl('http://127.0.0.1:4178/?debug=0', { tier: 'mobile' });
for (const [key, value] of [['nosplash', '1'], ['tier', 'mobile'], ['gfxreset', '1']]) assert.equal(url.searchParams.get(key), value);
assert.throws(() => garageSwitchUrl('file:///private/build'), /HTTP/);

const markdown = renderProfileMarkdown({ meta: { label: 'unit', tree: 'abc', serving: 'x', browser: 'b',
  viewport: { width: 1, height: 2, deviceScaleFactor: 1 }, tier: 'desktop', cpuRate: 1, dwellMs: 0,
  loadAverage: [1, 2, 3], cpus: 4, bootMs: 5, sequence: ['a', 'b'], unavailable: ['zz'] }, summary });
assert.match(markdown, /### unit — abc/);
assert.match(markdown, /not in roster: zz/);
assert.match(markdown, /\| warm \| 4 \|/);
assert.match(markdown, /\| core\.authoredMs \| 2 \|/);
assert.equal((markdown.match(/^\| \d+ \| [ab] \| /gm) || []).length, 6, 'one row per switch');

console.log('garage-switch-probe.selftest part 1: helper contracts and negative controls pass (no browser)');

// --- Part 2: real Garage, warm switches gated ------------------------------
const lock = createCaptureLock();
await lock.acquire(45 * 60 * 1000);
const refresh = setInterval(() => lock.refresh(), 30000);
refresh.unref();
process.once('exit', () => lock.release());
const cacheDir = mkdtempSync(join(tmpdir(), 'cot-switch-receipt-vite-'));
let report;
try {
  report = await runProfile({
    root: process.cwd(), cacheDir, label: 'receipt', sequence: 'receipt', dwellMs: 2500,
    log: (line) => console.log(line),
  });
} finally {
  clearInterval(refresh);
  lock.release();
  rmSync(cacheDir, { recursive: true, force: true });
}
const rendered = renderProfileMarkdown(report);
console.log(rendered);
if (out) {
  mkdirSync(resolve(out), { recursive: true });
  writeFileSync(resolve(out, 'report.json'), JSON.stringify(report, null, 2));
  writeFileSync(resolve(out, 'report.md'), rendered);
}
assert.deepEqual(report.errors, [], 'no page/console errors during the switch sequence');
assert.deepEqual(report.meta.unavailable, [], 'every exhibit vehicle is in the Garage roster');
assert.equal(report.rows.length, GARAGE_FIVE.length + RECEIPT_WARM_PASS.length * 2);
const failures = checkWarmSwitchBudget(report.rows);
assert.deepEqual(failures, [], 'warm switch budget');
const warm = report.summary.byClass.warm;
const cold = report.summary.byClass.cold;
console.log(`garage-switch-probe.selftest: ${warm.n} warm switches p95 worst long task ${warm.longTaskMaxMs.p95} ms `
  + `(budget ${WARM_SWITCH_BUDGET.longTaskP95Ms}), p95 painted ${warm.paintedMs.p95} ms (budget ${WARM_SWITCH_BUDGET.paintP95Ms}); `
  + `${cold?.n ?? 0} cold switches reported only (p95 worst long task ${cold?.longTaskMaxMs.p95 ?? '–'} ms, `
  + `p95 painted ${cold?.paintedMs.p95 ?? '–'} ms)`);
