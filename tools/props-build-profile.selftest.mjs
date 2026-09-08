import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { runInNewContext } from 'node:vm';
import { createPropsProfiler, instrumentSource, registerProfileCancellation } from './props-build-profile.mjs';

// Exercise the actual cancellation owner without OS signals or child processes.
// Queued cancellation retains both handlers until ticket/worker drain is done.
const emitter = new EventEmitter(), signals = [];
let child = null, foreignCalls = 0;
const foreign = () => { foreignCalls++; };
emitter.on('SIGINT', foreign);
const cancellation = registerProfileCancellation(() => child, emitter);
assert.equal(cancellation.isInterrupted(), false);
for (const signal of ['SIGINT', 'SIGINT', 'SIGTERM', 'SIGTERM']) {
  emitter.emit(signal);
  assert.equal(cancellation.isInterrupted(), true);
  assert.equal(emitter.listenerCount('SIGINT'), 2, 'repeat cancellation keeps the owner handler installed while queued');
  assert.equal(emitter.listenerCount('SIGTERM'), 1);
}
assert.deepEqual(signals, [], 'queued cancellation with no child cannot create or kill a resource');
child = { kill: signal => signals.push(['first', signal]) };
emitter.emit('SIGINT'); emitter.emit('SIGINT');
child = null; emitter.emit('SIGTERM');
child = { kill: signal => signals.push(['current', signal]) };
emitter.emit('SIGTERM'); emitter.emit('SIGTERM');
assert.deepEqual(signals, [['first', 'SIGTERM'], ['first', 'SIGTERM'], ['current', 'SIGTERM'], ['current', 'SIGTERM']],
  'each cancellation targets only the currently owned child and safely tolerates a drained child');
cancellation.dispose(); cancellation.dispose();
assert.equal(emitter.listenerCount('SIGINT'), 1, 'cleanup preserves unrelated signal handlers');
assert.equal(emitter.listenerCount('SIGTERM'), 0, 'cleanup removes the exact owned handler');
const killsAfterCleanup = signals.length;
emitter.emit('SIGINT'); emitter.emit('SIGTERM');
assert.equal(signals.length, killsAfterCleanup, 'removed handlers cannot kill a later child');
assert.equal(foreignCalls, 5);
assert.equal(cancellation.isInterrupted(), true, 'disposal does not erase cancellation evidence');
emitter.off('SIGINT', foreign);

let time = 0;
const profiler = createPropsProfiler(() => time);
profiler.measure('parent', () => {
  time += 2;
  profiler.measure('child', () => { time += 3; });
  time += 1;
});
assert.deepEqual(profiler.operations.parent,
  { calls: 1, inclusiveMs: 6, selfMs: 3, maxMs: 6 });
assert.deepEqual(profiler.operations.child,
  { calls: 1, inclusiveMs: 3, selfMs: 3, maxMs: 3 });
const failure = new Error('original operation failed');
assert.throws(() => profiler.measure('failure', () => { time += 4; throw failure; }),
  error => error === failure);
assert.equal(profiler.operations.failure.selfMs, 4);
assert.equal(profiler.atoms.length, 0, 'operations outside generator atoms are not attributed to a slice');

const input = [];
const generator = (function* () {
  profiler.measure('merge', () => { time += 2; }, { input });
  profiler.yieldBoundary(17);
  yield { stage: 'building' };
  profiler.measure('merge', () => { time += 3; }, { input });
  profiler.yieldBoundary(22);
  yield undefined;
  time += 1;
  return 'completed';
})();
assert.deepEqual(profiler.next(generator), { value: { stage: 'building' }, done: false });
assert.deepEqual(profiler.next(generator), { value: undefined, done: false });
assert.deepEqual(profiler.next(generator), { value: 'completed', done: true });
assert.deepEqual(profiler.atoms.map(atom => [atom.stage, atom.endYieldLine, atom.synchronousMs]),
  [['building', 17, 2], ['slice-1', 22, 3], ['finalize', null, 1]]);
assert.deepEqual(profiler.repeatedTriangles,
  { uniqueInputs: 1, repeatedCalls: 1, repeatedInclusiveMs: 3 });
assert.deepEqual(profiler.atoms[0].details, [], 'source triangle arrays are never serialized as diagnostic details');

// A small JS fixture exercises the real source transformer without building a
// world. Original evaluation order, return values, throws and yield values stay
// unchanged; only the in-memory observer is added.
const fixture = `function* createPropsAsync() {
  const g = (function* () {
    const value = makeWood(nextArgument());
    yield { stage: value };
    yield;
    return 9;
  })();
  yield g.next();
  yield g.next();
  return g.next();
}
globalThis.result = Array.from(createPropsAsync());`;
function execute(source) {
  const calls = [], observer = createPropsProfiler(() => ++time);
  const context = { __PROPS_PROFILE: observer,
    nextArgument() { calls.push('argument'); return 7; },
    makeWood(value) { calls.push(['makeWood', value]); return value; } };
  runInNewContext(source, context);
  return { result: JSON.stringify(context.result), calls, observer };
}
const transformed = instrumentSource(fixture, 'props');
assert.equal(transformed.counts.makeWood, 1);
assert.equal(transformed.counts.next, 3);
assert.equal(transformed.counts.yield, 4);
const control = execute(fixture), observed = execute(transformed.transformed);
assert.equal(observed.result, control.result);
assert.deepEqual(observed.calls, control.calls);
assert.equal(observed.observer.operations['props.makeWood'].calls, 1);
assert.equal(observed.observer.atoms.length, 3);

const collisionFixture = `function mergeProjectedTriangles(triangles) {
  if (triangles.length) throw new Error('original geometry error');
  return triangles;
}
globalThis.invoke = mergeProjectedTriangles;`;
const observedCollision = instrumentSource(collisionFixture, 'collision');
assert.equal(observedCollision.counts.mergeProjectedTriangles, 1);
const observer = createPropsProfiler(() => ++time);
const context = { __PROPS_PROFILE: observer };
runInNewContext(observedCollision.transformed, context);
const empty = [];
assert.equal(context.invoke(empty), empty);
assert.throws(() => context.invoke([1]), /original geometry error/);
assert.equal(observer.operations['collision.mergeProjectedTriangles'].calls, 2);
assert.throws(() => instrumentSource('function {', 'props'), /valid source syntax/);

console.log('props-build-profile.selftest: repeated cancellation ownership/cleanup, nested timing, errors, atom attribution, identity counts and observer-only source instrumentation pass; no world or browser built');
