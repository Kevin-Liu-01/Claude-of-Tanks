import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

// Execute the actual standalone browser sampler without importing the CLI,
// acquiring a capture lease, or launching a browser.
const source = readFileSync(new URL('./perfprobe.mjs', import.meta.url), 'utf8');
const begin = source.indexOf('function installPerfSampler(');
assert.ok(begin >= 0);
const end = source.indexOf('\n}', begin);
const declaration = source.slice(begin, end + 2);
const plain = value => JSON.parse(JSON.stringify(value));
const admissionStart = source.indexOf('function inspectPerfSubmissionWindow(');
const admissionEnd = source.indexOf('\n}', admissionStart);
assert.ok(admissionStart >= 0 && admissionEnd > admissionStart);
const inspectAdmission = runInNewContext(`${source.slice(admissionStart, admissionEnd + 2)}\ninspectPerfSubmissionWindow`);
const admit = (perf, scene = 'battle', sampleMs = 100) => inspectAdmission(perf, {
  scene, sampleMs, frameMsP99Max: 25,
});

function fixture({ waitForControl = true, sampleMs = 100 } = {}) {
  let now = 0, nextId = 0;
  const frames = new Map(), intervals = new Map();
  const game = { phase: 'garage', preBattleS: 1, timeS: 0, tanks: [], player: null };
  const timing = [];
  const info = {
    autoReset: true, render: { calls: 999, triangles: 999, points: 999, lines: 999 },
    memory: { geometries: 2, textures: 3 }, programs: [{}],
    reset() { Object.assign(this.render, { calls: 0, triangles: 0, points: 0, lines: 0 }); },
  };
  const window = {
    __DEBUG: { renderer: { info }, game, lighting: { scheduledMask: 15 } },
    __PERF_READ_ENVIRONMENT: () => ({ at: now }),
    __PERF_WINDOW_TIMING: {
      start: (...args) => timing.push(['start', ...args]),
      frame: (...args) => timing.push(['frame', ...args]),
      end: (...args) => timing.push(['end', ...args]),
    },
  };
  const context = {
    window, performance: { now: () => now, timeOrigin: 10000 },
    requestAnimationFrame(callback) { frames.set(++nextId, callback); return nextId; },
    setInterval(callback) { intervals.set(++nextId, callback); return nextId; },
    clearInterval(id) { intervals.delete(id); },
  };
  runInNewContext(`${declaration}\ninstallPerfSampler`, context)({
    sampleMs, waitForControl, profileWindow: true,
  });
  return {
    game, info, frames, intervals, timing,
    get perf() { return window.__PERF; },
    step(at, calls = 0) {
      now = at;
      Object.assign(info.render, { calls, triangles: calls * 10, points: calls * 2, lines: calls * 3 });
      const queued = [...frames.values()]; frames.clear();
      assert.equal(queued.length, 1, 'one sampler chain, never a duplicate callback loop');
      for (const callback of queued) callback(at);
    },
    release(at = 0) { game.phase = 'battle'; game.preBattleS = 0; this.step(at, 999); },
  };
}

{
  const f = fixture();
  f.step(0, 999);
  assert.equal(f.perf.startedAt, null, 'unreleased loading is not sampled');
  f.release(1000);
  for (let offset = 8; offset <= 96; offset += 8) f.step(1000 + offset, offset % 16 === 0 ? 20 : 0);
  assert.equal(f.perf.protocol, 'perfprobe-submission-v3');
  assert.deepEqual(plain(f.perf.deltas), [16, 16, 16, 16, 16, 16]);
  assert.deepEqual(plain(f.perf.times), [16, 32, 48, 64, 80, 96]);
  assert.deepEqual(plain(f.perf.calls), Array(6).fill(20));
  assert.deepEqual(plain(f.perf.tris), Array(6).fill(200));
  assert.deepEqual(plain(f.perf.points), Array(6).fill(40));
  assert.deepEqual(plain(f.perf.lines), Array(6).fill(60));
  assert.deepEqual(plain(f.perf.shadowMasks), Array(6).fill(15));
  assert.deepEqual(plain(f.perf.nativeCallbacks.deltas), Array(12).fill(8));
  assert.equal(f.perf.nativeCallbacks.skipped, 6);
  assert.equal(f.timing.filter(row => row[0] === 'frame').length, 13,
    'profiling still observes every native callback, including skipped submissions');
  f.step(1104, 40);
  assert.equal(f.perf.deltas.length, 6, 'out-of-window submission is not admitted');
  assert.equal(f.perf.trailingNoSubmissionMs, 8, 'right-censored tail remains explicit');
  assert.equal(f.perf.lastSubmissionAt, 1096);
  assert.equal(f.perf.done, true);
  assert.equal(f.info.autoReset, true);
  assert.equal(f.frames.size, 0);
  assert.equal(f.intervals.size, 0);
  assert.equal(admit(f.perf).pass, true, 'complete healthy sampling has usable terminal coverage');
}

{
  const f = fixture({ sampleMs: 160 });
  f.release();
  f.step(16, 9);
  for (const at of [24, 32, 40, 48, 56, 64, 72, 80, 88]) f.step(at);
  f.step(96, 11);
  f.step(112, 12);
  assert.deepEqual(plain(f.perf.deltas), [16, 80, 16],
    'a real render stall cannot be hidden by frequent empty browser callbacks');
  assert.deepEqual(plain(f.perf.calls), [9, 11, 12], 'multi-pass counts retain their observed submission cohort');
  for (const at of [120, 128, 136, 144, 152, 160, 168]) f.step(at);
  assert.equal(f.perf.trailingNoSubmissionMs, 56,
    'a missing final render is reported, never invented as a completed submission');
  const before = JSON.stringify(f.perf);
  const verdict = admit(f.perf, 'battle', 160);
  assert.equal(verdict.pass, false);
  assert.equal(verdict.terminalNoSubmissionLimitMs, 25, 'terminal bound is the unchanged frame ceiling');
  assert.match(verdict.reasons.join('; '), /terminal submission/);
  assert.equal(JSON.stringify(f.perf), before, 'admission never inserts synthetic completed frames');
}

{
  const f = fixture({ waitForControl: false, sampleMs: 40 });
  f.step(8, 999); // Explicit first callback discards pre-window render counters.
  f.step(16); f.step(24); f.step(32); f.step(40); f.step(48);
  assert.deepEqual(plain(f.perf.deltas), [], 'no submitted frames cannot become fast FPS samples');
  assert.equal(f.perf.nativeCallbacks.skipped, 4);
  assert.equal(f.perf.lastSubmissionAt, null);
  assert.equal(f.perf.trailingNoSubmissionMs, 48);
  assert.equal(f.perf.done, true);
  assert.equal(admit(f.perf, 'battle', 40).pass, false, 'no-render windows explicitly refuse certification');
}

{
  const base = { done: true, startedAt: 0, endedAt: 100,
    deltas: [16, 16, 16, 16, 16], calls: [5, 5, 5, 5, 5], lastSubmissionAt: 80 };
  assert.equal(admit(base).pass, true);
  assert.equal(admit({ ...base, lastSubmissionAt: 75 }).pass, true, 'exact existing ceiling is accepted');
  assert.equal(admit({ ...base, lastSubmissionAt: 74.99 }).pass, false, 'no tolerance silently raises the ceiling');
  for (const patch of [
    { done: false }, { endedAt: 99 }, { startedAt: NaN },
    { deltas: [] }, { deltas: [16], calls: [5] },
    { deltas: [16, NaN] }, { deltas: [16, 0] }, { calls: [0, 5, 5, 5, 5] },
    { lastSubmissionAt: null }, { lastSubmissionAt: 101 },
  ]) assert.equal(admit({ ...base, ...patch }).pass, false, 'incomplete/nonfinite/unusable windows reject');
  const garage = admit({ ...base, endedAt: 60000, lastSubmissionAt: 55000,
    deltas: [5000, 5000], calls: [5, 5] }, 'garage', 60000);
  assert.equal(garage.pass, false);
  assert.match(garage.reasons[0], /Dormant Garage.*not battle FPS/,
    'healthy safety paints are labelled incompatible, not treated as a runtime battle regression');
}

// Execute the actual failure branch against the CLI-owned exit flag. Merely
// checking budget JSON would not detect a locally shadowed `failed` variable.
const budgetStart = source.indexOf('  if (!report.budget.pass) {');
const budgetEnd = source.indexOf('\n  }', budgetStart);
const budgetBranch = source.slice(budgetStart, budgetEnd + 4);
for (const pass of [false, true]) {
  const result = runInNewContext(`let failed = false; ${budgetBranch}; failed`, {
    report: { budget: { pass } }, lines: { fpsMedian: { pass, actual: 30, limit: '>=60' } },
    console: { error() {} },
  });
  assert.equal(result, !pass, 'failed budget sets the outer process-exit flag');
}
const quantile = source.match(/const q = \(arr, p\) => ([^;]+);/)[1];
const emptyMetric = runInNewContext(`const arr = [], p = 0.5; +(${quantile}).toFixed(1)`);
assert.equal(JSON.stringify({ median: emptyMetric }), '{"median":null}',
  'no-render metric serializes without an exception that erases the failure receipt');
assert.doesNotMatch(source, /perfprobe-raf-v2/);
assert.match(source, /protocol: perf\.protocol/);
assert.match(source, /nativeCallbacks: perf\.nativeCallbacks/);
assert.match(source, /acquisitionProtocol: report\.acquisition\.protocol/,
  'trend rows carry the incompatible acquisition protocol too');
assert.match(source, /const deltas = perf\.deltas\.slice\(\)\.sort/,
  'existing frame gates consume the submission intervals, not raw callback diagnostics');
assert.match(source, /submissionAdmission: \{/);
assert.match(source, /REFUSED — unusable submission window/);
console.log('perfprobe-submission: capped callbacks, censored-stall admission, empty/Garage refusal, budget exit and lifecycle pass');
