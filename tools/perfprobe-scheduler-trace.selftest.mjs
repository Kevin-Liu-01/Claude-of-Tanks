import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installPerfSchedulerTrace } from './perfprobe-scheduler-trace.mjs';

const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
// Execute the serialized function: page-side code cannot depend on module scope.
const install = new Function(`return (${installPerfSchedulerTrace.toString()})`)();
function fixture(capacity = 20) {
  let observer = null, disposed = 0;
  const state = { active: true, callbacks: 0, restartSequence: 0, resetSequence: 0,
    observerErrors: 0, error: null, initialDeadlineMs: 100, intervalMs: 1000 / 60, toleranceMs: 1.5 };
  const fake = { __DEBUG: { observeFrameLoopScheduler(fn) {
    observer = fn;
    return { state, dispose() { disposed++; state.active = false; } };
  } } };
  Object.defineProperty(globalThis, 'window', { value: fake, configurable: true });
  install({ capacity });
  return { trace: fake.__PERF_SCHEDULER_TRACE, state, disposed: () => disposed,
    emit(rafMs = 100, entryMs = 100.2, decision = 0) {
      observer(++state.callbacks, rafMs, entryMs, 100, 100 + 1000 / 60, decision, state.restartSequence, state.resetSequence);
    } };
}
try {
  const f = fixture();
  f.emit(90); // Lead-in is excluded, but attachment-relative sequence survives.
  f.trace.start(99); f.trace.frame(99); f.emit(100); f.trace.frame(101);
  f.emit(108.33, 108.6, 1); f.trace.frame(110);
  f.trace.frame(120);
  const r = f.trace.finish(120);
  assert.equal(r.pass, true);
  assert.equal(r.speedCertification, false);
  assert.deepEqual(r.decisions.sequence, [2, 3]);
  assert.deepEqual(r.decisions.rafMs, [100, 108.33]);
  assert.deepEqual(r.decisions.entryMs, [100.2, 108.6]);
  assert.deepEqual(r.sampler.callbacks, [1, 2, 3, 3]);
  assert.equal(r.end.callbacks - r.start.callbacks, 2);
  assert.equal(f.trace.finish(), r);
  f.trace.stop(); assert.equal(f.disposed(), 1);
  f.emit(130); assert.deepEqual(r.decisions.sequence, [2, 3]);
  assert.throws(() => f.trace.start(200), /cannot restart/);
  assert.throws(() => install(), /already installed/);

  const overflow = fixture(2); overflow.trace.start(0);
  for (let i = 0; i < 3; i++) { overflow.emit(i); overflow.trace.frame(i); }
  const o = overflow.trace.finish(10);
  assert.equal(o.pass, false); assert.equal(o.dropped, 1); assert.equal(o.boundaryDropped, 1);
  assert.equal(o.decisions.sequence.length, 2); assert.equal(overflow.disposed(), 1);

  const incomplete = fixture(); incomplete.trace.start(0); incomplete.emit();
  assert.equal(incomplete.trace.finish().pass, false);
  assert.equal(incomplete.disposed(), 1);
  const abandoned = fixture(); assert.equal(abandoned.trace.finish().pass, false);
  const detached = fixture(); detached.trace.start(0); detached.emit();
  detached.state.active = false; detached.state.observerErrors = 1; detached.state.error = 'failed';
  assert.equal(detached.trace.finish(200).pass, false);
  const missing = fixture(); missing.trace.start(0); missing.emit(); missing.state.callbacks++;
  assert.equal(missing.trace.finish(200).pass, false);
  const invalid = fixture(); invalid.trace.start(0); invalid.emit(100, NaN);
  assert.equal(invalid.trace.finish(200).pass, false);
  const reset = fixture(); reset.trace.start(0); reset.emit(); reset.state.resetSequence++;
  reset.trace.frame(200);
  const resetReceipt = reset.trace.finish(200);
  assert.equal(resetReceipt.pass, true);
  assert.equal(resetReceipt.end.resetSequence, 1); // A reset with no later RAF is not lost.
  for (const kind of ['missing', 'invalid', 'range', 'terminal', 'regression']) {
    const b = fixture(); b.trace.start(0); b.emit();
    if (kind === 'invalid') b.trace.frame(NaN);
    if (kind === 'range') b.trace.frame(-1);
    if (kind === 'terminal') b.trace.frame(199);
    if (kind === 'regression') { b.trace.frame(150); b.trace.frame(149); }
    if (kind !== 'missing' && kind !== 'terminal') b.trace.frame(200);
    assert.equal(b.trace.finish(200).pass, false, kind);
  }

  Object.defineProperty(globalThis, 'window', { value: {}, configurable: true });
  assert.throws(() => install(), /port unavailable/);
  assert.throws(() => install({ capacity: Infinity }), /capacity/);
  const source = readFileSync(new URL('./perfprobe.mjs', import.meta.url), 'utf8');
  assert.match(source, /schedulerTrace \? 'scheduler-trace-only'/);
  assert.match(source, /!noTrend && !profileWindow && !drawAttribution && !schedulerTrace/);
  assert.match(source, /REFUSED — scheduler-trace diagnostic overhead/);
  assert.equal((source.match(/waitForControl: (?:true|false), profileWindow, drawAttribution, schedulerTrace/g) || []).length, 2);
  assert.match(source, /scheduler\?\.frame\(now\);[\s\S]*const pageMs/);
  assert.match(source, /finally \{[\s\S]*__PERF_SCHEDULER_TRACE\?\.finish\(\)/);
} finally {
  if (original) Object.defineProperty(globalThis, 'window', original);
  else delete globalThis.window;
}
console.log('perfprobe scheduler trace selftest PASS');
