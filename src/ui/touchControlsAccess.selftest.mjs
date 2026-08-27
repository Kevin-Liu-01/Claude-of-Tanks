import assert from 'node:assert/strict';
import { createTouchControlsAccess } from './touchControlsAccess.ts';

let attempts = 0;
let constructions = 0;
const runtime = {
  root: {}, isLayout: true,
  refresh() {},
};
const options = {
  input: {}, bus: {},
  isBattleActive: () => false,
  onOpenSettings() {},
  onToggleSound: () => false,
  isSniper: () => false,
};
const access = createTouchControlsAccess(options, {
  controls: async () => {
    attempts++;
    if (attempts === 1) throw new Error('simulated touch chunk failure');
    return {
      createTouchControls(received) {
        constructions++;
        assert.equal(received, options);
        return runtime;
      },
    };
  },
});

await assert.rejects(access.preload(), /simulated touch chunk failure/);
assert.equal(access.current, null);
const first = access.preload();
const shared = access.preload();
assert.equal(first, shared, 'concurrent battle paths must join one touch runtime');
assert.equal(await first, runtime);
assert.equal(access.current, runtime);
assert.equal(attempts, 2);
assert.equal(constructions, 1);
assert.equal(await access.preload(), runtime);

console.log('touchControlsAccess.selftest: retryable battle-only mobile controls passed');
