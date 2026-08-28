import assert from 'node:assert/strict';
import {
  emitBreakFx,
  emitDestroyed,
  notifyShellImpact,
  notifyShellSweep,
  registerWorldDestructibles,
  setBreakFxProvider,
  setDestroyedEventSink,
} from './destructibles.ts';

const calls = [];
setBreakFxProvider((...args) => calls.push(['fx', ...args]));
emitBreakFx('fence', 1, 2, 3, 4, 5, 6);
assert.deepEqual(calls.pop(), ['fx', 'fence', 1, 2, 3, 4, 5, 6],
  'break FX retains every authored coordinate and impulse');
setBreakFxProvider(null);
emitBreakFx('barrel', 0, 0, 0, 0, 0, 0);
assert.equal(calls.length, 0, 'cleared FX provider is inert');

setDestroyedEventSink((event) => calls.push(['destroyed', event]));
const destroyed = { kind: 'bale', pos: [7, 8, 9], cause: 'blast' };
emitDestroyed(destroyed);
assert.deepEqual(calls.pop(), ['destroyed', destroyed], 'destruction event identity is preserved');
setDestroyedEventSink(null);

registerWorldDestructibles({
  key: 'inactive',
  isActive: () => false,
  sweep: () => calls.push(['inactive-sweep']),
  impact: () => calls.push(['inactive-impact']),
});
registerWorldDestructibles({
  key: 'active',
  isActive: () => true,
  sweep: (...args) => calls.push(['sweep', ...args]),
  impact: (...args) => calls.push(['impact', ...args]),
});
notifyShellSweep(1, 2, 3, 4, 5, 6);
notifyShellImpact(7, 8, 9, { r: 4.6, he: true });
assert.deepEqual(calls, [
  ['sweep', 1, 2, 3, 4, 5, 6],
  ['impact', 7, 8, 9, { r: 4.6, he: true }],
], 'only the active world receives shell traffic');

calls.length = 0;
registerWorldDestructibles({
  key: 'active',
  isActive: () => true,
  sweep: () => calls.push(['replacement-sweep']),
  impact: () => calls.push(['replacement-impact']),
});
notifyShellSweep(0, 0, 0, 1, 1, 1);
assert.deepEqual(calls, [['replacement-sweep']], 'same-key rebuild replaces stale handlers');

console.log('destructibles.selftest: provider, sink, activity, and replacement routing passed');
