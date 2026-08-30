import assert from 'node:assert/strict';

import { createBattleEntryLifecycle } from './battleEntryLifecycle.ts';
import { createSoloBattleEntryRuntime } from './soloBattleEntryRuntime.ts';

const order = [];
let shouldFail = true;
let loadingArgs = null;
const lifecycle = createBattleEntryLifecycle({
  nextFrame: async () => {},
  now: () => 0,
});
const runtime = createSoloBattleEntryRuntime({
  lifecycle,
  loading: {
    async begin(...args) {
      loadingArgs = args;
      order.push('load');
      if (shouldFail) throw new Error('cold chunk failed');
    },
  },
  battleLoad: { hide: async () => { order.push('hide'); } },
  audio: { loadingOn: (active) => order.push(`loading:${active}`) },
  enterGarage: () => order.push('garage'),
  nextFrame: async () => { order.push('frame'); },
  isVisibleSpecId: (id) => id === 'm1a2',
  getSelectedSpecId: () => 'leo2a7',
  getSelectedMapId: () => 'desert',
  reportError: () => order.push('error'),
});

await runtime.beginSelected({ specId: 'invalid', randomRoster: false, gameMode: 'horde' });
assert.deepEqual(loadingArgs, [
  'leo2a7', 'desert', { randomRoster: false, gameMode: 'horde' },
]);
assert.deepEqual(order, ['load', 'error', 'loading:false', 'garage', 'frame', 'hide'],
  'failure restores and paints the Garage before the opaque loader fades');
assert.equal(lifecycle.pending, false);
assert.equal(lifecycle.renderingCovered, false);

order.length = 0;
shouldFail = false;
await runtime.beginSelected({ specId: 'm1a2', mapId: 'winter' });
assert.deepEqual(loadingArgs, [
  'm1a2', 'winter', { randomRoster: true, gameMode: 'standard' },
]);
assert.deepEqual(order, ['load']);
assert.equal(lifecycle.pending, false);
assert.equal(lifecycle.renderingCovered, false);

assert.throws(() => createSoloBattleEntryRuntime({}), /requires every recovery port/);

console.log('soloBattleEntryRuntime.selftest: selection and covered failure recovery pass');
