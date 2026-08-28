import assert from 'node:assert/strict';
import { createSelectedVehicleSelection } from './selectedVehicleSelection.ts';

const saved = new Map([['cot.lastTank.v1', 'm1a2']]);
const storage = {
  getItem: (key) => saved.get(key) ?? null,
  setItem: (key, value) => saved.set(key, value),
};
const selection = createSelectedVehicleSelection({
  visibleIds: ['m1a1', 'm1a2'],
  defaultId: 'm1a1',
  getStorage: () => storage,
});
assert.equal(selection.id, 'm1a2');
selection.set('diagnostic-hidden-tank');
assert.equal(selection.id, 'diagnostic-hidden-tank');
selection.remember('diagnostic-hidden-tank');
assert.equal(saved.get('cot.lastTank.v1'), 'm1a2', 'hidden diagnostics are not persisted');
selection.select('m1a1');
assert.equal(selection.id, 'm1a1');
assert.equal(saved.get('cot.lastTank.v1'), 'm1a1');

const restricted = createSelectedVehicleSelection({
  visibleIds: ['m1a1'],
  defaultId: 'm1a1',
  getStorage: () => { throw new Error('storage denied'); },
});
assert.equal(restricted.id, 'm1a1');
restricted.select('m1a1');
assert.equal(restricted.id, 'm1a1');

assert.throws(() => createSelectedVehicleSelection({
  visibleIds: ['m1a2'], defaultId: 'm1a1', getStorage: () => storage,
}), /default/);

console.log('selectedVehicleSelection.selftest: durable and restricted storage passed');
